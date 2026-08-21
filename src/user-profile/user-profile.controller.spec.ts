import { UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { UserProfileController } from './user-profile.controller';
import { UserProfileService } from './user-profile.service';

describe('UserProfileController', () => {
  let controller: UserProfileController;
  let service: Record<string, jest.Mock>;

  const mockUser: AuthenticatedUser = {
    id: 'user-1',
    name: 'Dr. Test',
    email: 'doc@example.com',
    role: UserRole.PSYCHOLOGIST,
  };

  beforeEach(() => {
    service = {
      getProfile: jest.fn(),
      updateProfile: jest.fn(),
      getPreferences: jest.fn(),
      updatePreferences: jest.fn(),
      getAvatarMetadata: jest.fn(),
      getAvatarContent: jest.fn(),
      uploadAvatar: jest.fn(),
      removeAvatar: jest.fn(),
      getSignatureMetadata: jest.fn(),
      getSignatureContent: jest.fn(),
      uploadSignature: jest.fn(),
      removeSignature: jest.fn(),
    };
    controller = new UserProfileController(
      service as unknown as UserProfileService,
    );
  });

  it('delegates getPreferences to service', async () => {
    service.getPreferences.mockResolvedValue({
      timeZone: 'America/Mexico_City',
      emailNotifications: true,
    });
    const result = await controller.getPreferences(mockUser);
    expect(service.getPreferences).toHaveBeenCalledWith('user-1');
    expect(result).toEqual({
      timeZone: 'America/Mexico_City',
      emailNotifications: true,
    });
  });

  it('delegates updatePreferences to service', async () => {
    const dto = { timeZone: 'America/Bogota', reminderAdvanceMinutes: 30 };
    service.updatePreferences.mockResolvedValue({
      timeZone: 'America/Bogota',
      reminderAdvanceMinutes: 30,
    });
    const result = await controller.updatePreferences(mockUser, dto);
    expect(service.updatePreferences).toHaveBeenCalledWith('user-1', dto);
    expect(result).toEqual({
      timeZone: 'America/Bogota',
      reminderAdvanceMinutes: 30,
    });
  });

  it('delegates getProfile to service', async () => {
    service.getProfile.mockResolvedValue({ professionalName: 'Dr. Rivera' });
    const result = await controller.getProfile(mockUser);
    expect(service.getProfile).toHaveBeenCalledWith('user-1');
    expect(result).toEqual({ professionalName: 'Dr. Rivera' });
  });

  it('delegates updateProfile to service', async () => {
    service.updateProfile.mockResolvedValue({
      professionalName: 'Dr. Updated',
    });
    const dto = { professionalName: 'Dr. Updated' };
    const result = await controller.updateProfile(mockUser, dto);
    expect(service.updateProfile).toHaveBeenCalledWith('user-1', dto);
    expect(result).toEqual({ professionalName: 'Dr. Updated' });
  });

  it('delegates avatar metadata and removal to service', async () => {
    service.getAvatarMetadata.mockResolvedValue({ rowState: 'ABSENT' });
    service.removeAvatar.mockResolvedValue({ rowState: 'ABSENT' });

    expect(await controller.getAvatarMetadata(mockUser)).toEqual({
      rowState: 'ABSENT',
    });
    expect(await controller.removeAvatar(mockUser)).toEqual({
      rowState: 'ABSENT',
    });
  });

  it('delegates signature metadata and removal to service', async () => {
    service.getSignatureMetadata.mockResolvedValue({ rowState: 'ABSENT' });
    service.removeSignature.mockResolvedValue({ rowState: 'ABSENT' });

    expect(await controller.getSignatureMetadata(mockUser)).toEqual({
      rowState: 'ABSENT',
    });
    expect(await controller.removeSignature(mockUser)).toEqual({
      rowState: 'ABSENT',
    });
  });
});
