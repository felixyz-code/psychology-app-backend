import { NotFoundException } from '@nestjs/common';
import {
  PsychologistProfileStatus,
  UserRole,
  UserTimeFormat,
} from '@prisma/client';
import { UserProfileService } from './user-profile.service';

describe('UserProfileService', () => {
  let service: UserProfileService;
  let prisma: any;
  let storage: any;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
      },
      psychologistProfile: {
        findUnique: jest.fn(),
        create: jest.fn(),
        upsert: jest.fn(),
      },
      userAvatarAsset: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        delete: jest.fn(),
      },
      userSignatureAsset: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        delete: jest.fn(),
      },
      userPreferences: {
        findUnique: jest.fn(),
        create: jest.fn(),
        upsert: jest.fn(),
      },
    };
    storage = {
      writeAvatar: jest.fn(),
      writeSignature: jest.fn(),
      resolveAvatarPath: jest.fn(),
      resolveSignaturePath: jest.fn(),
      deleteAvatarFile: jest.fn(),
      deleteSignatureFile: jest.fn(),
    };
    service = new UserProfileService(prisma, storage);
  });

  describe('getProfile', () => {
    it('returns existing profile details with full mapping', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'doctor@example.com',
        role: UserRole.PSYCHOLOGIST,
        name: 'Dr. Test',
        psychologistProfile: {
          id: 'profile-1',
          userId: 'user-1',
          professionalName: 'Dr. Test Professional',
          licenseNumber: 'CED-12345',
          phone: '+52 55 1234 5678',
          specialties: ['TCC', 'Neuropsicología'],
          bio: 'Semblanza profesional',
          status: PsychologistProfileStatus.ACTIVE,
          avatarAsset: { storageKey: 'avatar.png' },
          signatureAsset: null,
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-02'),
        },
      };
      prisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.getProfile('user-1');

      expect(result.professionalName).toBe('Dr. Test Professional');
      expect(result.licenseNumber).toBe('CED-12345');
      expect(result.phone).toBe('+52 55 1234 5678');
      expect(result.specialties).toEqual(['TCC', 'Neuropsicología']);
      expect(result.hasAvatar).toBe(true);
      expect(result.hasSignature).toBe(false);
    });

    it('creates profile on-the-fly if user exists without one', async () => {
      const mockUser = {
        id: 'user-2',
        email: 'newdoc@example.com',
        role: UserRole.PSYCHOLOGIST,
        name: 'Dra. Nueva',
        psychologistProfile: null,
      };
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.psychologistProfile.create.mockResolvedValue({
        id: 'profile-2',
        userId: 'user-2',
        professionalName: 'Dra. Nueva',
        licenseNumber: null,
        phone: null,
        specialties: [],
        bio: null,
        status: PsychologistProfileStatus.LEGACY_UNVERIFIED,
        avatarAsset: null,
        signatureAsset: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.getProfile('user-2');

      expect(prisma.psychologistProfile.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-2',
          professionalName: 'Dra. Nueva',
        },
        include: {
          avatarAsset: true,
          signatureAsset: true,
        },
      });
      expect(result.professionalName).toBe('Dra. Nueva');
    });

    it('throws NotFoundException if user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.getProfile('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateProfile', () => {
    it('updates professional fields and syncs user name', async () => {
      const mockUser = {
        id: 'user-1',
        name: 'Old Name',
        email: 'doc@example.com',
        role: UserRole.PSYCHOLOGIST,
        psychologistProfile: { id: 'prof-1' },
      };
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.psychologistProfile.upsert.mockResolvedValue({
        id: 'prof-1',
        userId: 'user-1',
        professionalName: 'Dr. Updated Name',
        licenseNumber: 'NEW-CEDULA',
        phone: '5551234567',
        specialties: ['Infantil'],
        bio: 'Nueva bio',
        status: PsychologistProfileStatus.ACTIVE,
        avatarAsset: null,
        signatureAsset: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      prisma.user.update.mockResolvedValue({
        ...mockUser,
        name: 'Dr. Updated Name',
      });
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        ...mockUser,
        name: 'Dr. Updated Name',
      });

      const result = await service.updateProfile('user-1', {
        professionalName: 'Dr. Updated Name',
        licenseNumber: 'NEW-CEDULA',
        phone: '5551234567',
        specialties: ['Infantil'],
        bio: 'Nueva bio',
      });

      expect(prisma.psychologistProfile.upsert).toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { name: 'Dr. Updated Name' },
      });
      expect(result.licenseNumber).toBe('NEW-CEDULA');
      expect(result.specialties).toEqual(['Infantil']);
    });
  });

  describe('avatar management', () => {
    it('returns ABSENT when no avatar asset exists', async () => {
      prisma.userAvatarAsset.findUnique.mockResolvedValue(null);
      const result = await service.getAvatarMetadata('user-1');
      expect(result.rowState).toBe('ABSENT');
    });

    it('returns PRESENT with metadata when avatar exists', async () => {
      prisma.userAvatarAsset.findUnique.mockResolvedValue({
        mimeType: 'image/png',
        byteSize: 50000,
        width: 300,
        height: 300,
        updatedAt: new Date('2026-08-19'),
      });
      const result = await service.getAvatarMetadata('user-1');
      expect(result.rowState).toBe('PRESENT');
      expect(result.mimeType).toBe('image/png');
      expect(result.width).toBe(300);
    });

    it('removes avatar and deletes file from disk', async () => {
      prisma.userAvatarAsset.findUnique.mockResolvedValue({
        storageKey: 'old-avatar.png',
      });
      const result = await service.removeAvatar('user-1');
      expect(prisma.userAvatarAsset.delete).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
      expect(storage.deleteAvatarFile).toHaveBeenCalledWith('old-avatar.png');
      expect(result.rowState).toBe('ABSENT');
    });
  });

  describe('signature management', () => {
    it('returns ABSENT when no signature asset exists', async () => {
      prisma.userSignatureAsset.findUnique.mockResolvedValue(null);
      const result = await service.getSignatureMetadata('user-1');
      expect(result.rowState).toBe('ABSENT');
    });

    it('removes signature and deletes file from disk', async () => {
      prisma.userSignatureAsset.findUnique.mockResolvedValue({
        storageKey: 'old-signature.png',
      });
      const result = await service.removeSignature('user-1');
      expect(prisma.userSignatureAsset.delete).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
      expect(storage.deleteSignatureFile).toHaveBeenCalledWith(
        'old-signature.png',
      );
      expect(result.rowState).toBe('ABSENT');
    });
  });

  describe('preferences management', () => {
    it('throws NotFoundException when user does not exist on getPreferences', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.getPreferences('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns existing preferences if available', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        preferences: {
          userId: 'user-1',
          emailNotifications: true,
          inAppNotifications: true,
          appointmentReminders: true,
          reminderAdvanceMinutes: 30,
          sessionDigest: false,
          timeZone: 'America/Bogota',
          timeFormat: 'TWENTY_FOUR_HOUR',
          dateFormat: 'YYYY_MM_DD',
          locale: 'es-CO',
          weekStartsOn: 1,
          createdAt: new Date('2026-08-19'),
          updatedAt: new Date('2026-08-19'),
        },
      });

      const result = await service.getPreferences('user-1');
      expect(result.timeZone).toBe('America/Bogota');
      expect(result.reminderAdvanceMinutes).toBe(30);
      expect(result.timeFormat).toBe('TWENTY_FOUR_HOUR');
    });

    it('auto-provisions default preferences when user has none', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        preferences: null,
      });
      prisma.userPreferences.create.mockResolvedValue({
        userId: 'user-1',
        emailNotifications: true,
        inAppNotifications: true,
        appointmentReminders: true,
        reminderAdvanceMinutes: 60,
        sessionDigest: true,
        timeZone: 'America/Mexico_City',
        timeFormat: 'TWELVE_HOUR',
        dateFormat: 'DD_MM_YYYY',
        locale: 'es-MX',
        weekStartsOn: 1,
        createdAt: new Date('2026-08-19'),
        updatedAt: new Date('2026-08-19'),
      });

      const result = await service.getPreferences('user-1');
      expect(prisma.userPreferences.create).toHaveBeenCalledWith({
        data: { userId: 'user-1' },
      });
      expect(result.timeZone).toBe('America/Mexico_City');
      expect(result.emailNotifications).toBe(true);
    });

    it('throws NotFoundException when updating non-existent user preferences', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.updatePreferences('non-existent', {
          timeZone: 'America/Santiago',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('updates preferences via upsert successfully', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
      prisma.userPreferences.upsert.mockResolvedValue({
        userId: 'user-1',
        emailNotifications: false,
        inAppNotifications: true,
        appointmentReminders: true,
        reminderAdvanceMinutes: 120,
        sessionDigest: true,
        timeZone: 'America/Santiago',
        timeFormat: 'TWENTY_FOUR_HOUR',
        dateFormat: 'DD_MM_YYYY',
        locale: 'es-CL',
        weekStartsOn: 0,
        createdAt: new Date('2026-08-19'),
        updatedAt: new Date('2026-08-19'),
      });

      const result = await service.updatePreferences('user-1', {
        emailNotifications: false,
        reminderAdvanceMinutes: 120,
        timeZone: 'America/Santiago',
        timeFormat: UserTimeFormat.TWENTY_FOUR_HOUR,
        locale: 'es-CL',
        weekStartsOn: 0,
      });

      expect(prisma.userPreferences.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1' },
        }),
      );
      expect(result.timeZone).toBe('America/Santiago');
      expect(result.emailNotifications).toBe(false);
      expect(result.reminderAdvanceMinutes).toBe(120);
      expect(result.weekStartsOn).toBe(0);
    });
  });
});
