import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TeleconsultationRoomStatus, MembershipRole, UserRole } from '@prisma/client';
import { TenantResolutionMode, type TenantContext } from '../common/request-context/request-context.service';
import { TeleconsultationService } from './teleconsultation.service';
import { PrismaService } from '../prisma/prisma.service';

// ─── Shared fixtures ────────────────────────────────────────────────
const ORG_ID = 'org-uuid-1111';
const USER_ID = 'user-uuid-1111';
const APPT_ID = 'appt-uuid-1111';
const ROOM_ID = 'room-uuid-1111';

const mockAppointment = {
  id: APPT_ID,
  organizationId: ORG_ID,
  psychologistId: USER_ID,
  scheduledAt: new Date('2026-09-01T10:00:00Z'),
  durationMinutes: 60,
  status: 'SCHEDULED',
};

const mockRoom = {
  id: ROOM_ID,
  appointmentId: APPT_ID,
  organizationId: ORG_ID,
  roomCode: 'abc123def456ghi7',
  provider: 'internal',
  therapistPasscode: '123456',
  patientToken: 'patient-token-uuid',
  expiresAt: new Date(Date.now() + 7200000),
  status: TeleconsultationRoomStatus.PENDING,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const ownerScope: TenantContext = {
  organizationId: ORG_ID,
  userId: USER_ID,
  membershipId: 'mem-1',
  organizationRole: MembershipRole.PSYCHOLOGIST,
  legacyUserRole: UserRole.PSYCHOLOGIST,
  resolutionMode: TenantResolutionMode.EXPLICIT,
};

const adminScope = {
  ...ownerScope,
  organizationRole: MembershipRole.ADMIN,
};

const otherUserScope = {
  ...ownerScope,
  userId: 'other-user-uuid',
  organizationRole: MembershipRole.PSYCHOLOGIST,
};

// ─── Mock PrismaService ─────────────────────────────────────────────
const mockPrisma = {
  appointment: {
    findFirst: jest.fn(),
  },
  teleconsultationRoom: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
};

describe('TeleconsultationService', () => {
  let service: TeleconsultationService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeleconsultationService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<TeleconsultationService>(TeleconsultationService);
  });

  // ─────────────────────────────────────────────────────────────────
  // createRoom
  // ─────────────────────────────────────────────────────────────────

  describe('createRoom', () => {
    it('creates a room with valid roomCode (16 hex chars), passcode (6 digits), and patientToken (UUID)', async () => {
      mockPrisma.appointment.findFirst.mockResolvedValue(mockAppointment);
      mockPrisma.teleconsultationRoom.findUnique.mockResolvedValue(null);
      mockPrisma.teleconsultationRoom.create.mockImplementation(({ data }) =>
        Promise.resolve({ ...mockRoom, ...data }),
      );

      const result = await service.createRoom(APPT_ID, ownerScope);

      expect(result.roomCode).toMatch(/^[0-9a-f]{16}$/);
      expect(result.therapistPasscode).toMatch(/^\d{6}$/);
      expect(result.patientToken).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(result.status).toBe(TeleconsultationRoomStatus.PENDING);
    });

    it('throws NotFoundException when appointment not found in tenant', async () => {
      mockPrisma.appointment.findFirst.mockResolvedValue(null);
      await expect(service.createRoom(APPT_ID, ownerScope)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when user is not the assigned therapist', async () => {
      mockPrisma.appointment.findFirst.mockResolvedValue(mockAppointment);
      await expect(service.createRoom(APPT_ID, otherUserScope)).rejects.toThrow(ForbiddenException);
    });

    it('allows ADMIN to create a room for any appointment', async () => {
      mockPrisma.appointment.findFirst.mockResolvedValue(mockAppointment);
      mockPrisma.teleconsultationRoom.findUnique.mockResolvedValue(null);
      mockPrisma.teleconsultationRoom.create.mockImplementation(({ data }) =>
        Promise.resolve({ ...mockRoom, ...data }),
      );

      const result = await service.createRoom(APPT_ID, adminScope);
      expect(result.appointmentId).toBe(APPT_ID);
    });

    it('throws ConflictException when an active room already exists', async () => {
      mockPrisma.appointment.findFirst.mockResolvedValue(mockAppointment);
      mockPrisma.teleconsultationRoom.findUnique.mockResolvedValue({
        ...mockRoom,
        status: TeleconsultationRoomStatus.ACTIVE,
      });
      await expect(service.createRoom(APPT_ID, ownerScope)).rejects.toThrow(ConflictException);
    });

    it('allows creating a new room when previous is TERMINATED', async () => {
      mockPrisma.appointment.findFirst.mockResolvedValue(mockAppointment);
      mockPrisma.teleconsultationRoom.findUnique.mockResolvedValue({
        ...mockRoom,
        status: TeleconsultationRoomStatus.TERMINATED,
      });
      mockPrisma.teleconsultationRoom.update.mockImplementation(({ data }) =>
        Promise.resolve({ ...mockRoom, ...data }),
      );
      const result = await service.createRoom(APPT_ID, ownerScope);
      expect(result.status).toBe(TeleconsultationRoomStatus.PENDING);
    });

    it('allows creating a new room when previous is EXPIRED', async () => {
      mockPrisma.appointment.findFirst.mockResolvedValue(mockAppointment);
      mockPrisma.teleconsultationRoom.findUnique.mockResolvedValue({
        ...mockRoom,
        status: TeleconsultationRoomStatus.EXPIRED,
      });
      mockPrisma.teleconsultationRoom.update.mockImplementation(({ data }) =>
        Promise.resolve({ ...mockRoom, ...data }),
      );
      const result = await service.createRoom(APPT_ID, ownerScope);
      expect(result.status).toBe(TeleconsultationRoomStatus.PENDING);
    });

    it('sets expiresAt to scheduledAt + durationMinutes + 60 min', async () => {
      mockPrisma.appointment.findFirst.mockResolvedValue(mockAppointment);
      mockPrisma.teleconsultationRoom.findUnique.mockResolvedValue(null);
      let capturedData: { expiresAt: Date } | null = null;
      mockPrisma.teleconsultationRoom.create.mockImplementation(({ data }) => {
        capturedData = data as { expiresAt: Date };
        return Promise.resolve({ ...mockRoom, ...data });
      });

      await service.createRoom(APPT_ID, ownerScope);
      const expectedExpiry = new Date(
        mockAppointment.scheduledAt.getTime() + (60 + 60) * 60 * 1000,
      );
      expect(capturedData!.expiresAt.getTime()).toBe(expectedExpiry.getTime());
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // getRoom
  // ─────────────────────────────────────────────────────────────────

  describe('getRoom', () => {
    it('returns room when found in tenant', async () => {
      mockPrisma.appointment.findFirst.mockResolvedValue(mockAppointment);
      mockPrisma.teleconsultationRoom.findUnique.mockResolvedValue(mockRoom);

      const result = await service.getRoom(APPT_ID, ownerScope);
      expect(result.id).toBe(ROOM_ID);
    });

    it('throws NotFoundException when room does not exist', async () => {
      mockPrisma.appointment.findFirst.mockResolvedValue(mockAppointment);
      mockPrisma.teleconsultationRoom.findUnique.mockResolvedValue(null);
      await expect(service.getRoom(APPT_ID, ownerScope)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when room belongs to different org', async () => {
      mockPrisma.appointment.findFirst.mockResolvedValue(mockAppointment);
      mockPrisma.teleconsultationRoom.findUnique.mockResolvedValue({
        ...mockRoom,
        organizationId: 'other-org-uuid',
      });
      await expect(service.getRoom(APPT_ID, ownerScope)).rejects.toThrow(ForbiddenException);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // activateRoom
  // ─────────────────────────────────────────────────────────────────

  describe('activateRoom', () => {
    it('activates a PENDING room', async () => {
      mockPrisma.appointment.findFirst.mockResolvedValue(mockAppointment);
      mockPrisma.teleconsultationRoom.findUnique.mockResolvedValue(mockRoom);
      mockPrisma.teleconsultationRoom.update.mockResolvedValue({
        ...mockRoom,
        status: TeleconsultationRoomStatus.ACTIVE,
      });

      const result = await service.activateRoom(APPT_ID, ownerScope);
      expect(result.status).toBe(TeleconsultationRoomStatus.ACTIVE);
    });

    it('throws BadRequestException when room is already ACTIVE', async () => {
      mockPrisma.appointment.findFirst.mockResolvedValue(mockAppointment);
      mockPrisma.teleconsultationRoom.findUnique.mockResolvedValue({
        ...mockRoom,
        status: TeleconsultationRoomStatus.ACTIVE,
      });
      await expect(service.activateRoom(APPT_ID, ownerScope)).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when room is TERMINATED', async () => {
      mockPrisma.appointment.findFirst.mockResolvedValue(mockAppointment);
      mockPrisma.teleconsultationRoom.findUnique.mockResolvedValue({
        ...mockRoom,
        status: TeleconsultationRoomStatus.TERMINATED,
      });
      await expect(service.activateRoom(APPT_ID, ownerScope)).rejects.toThrow(BadRequestException);
    });

    it('activates an EXPIRED room and extends expiresAt by 60 minutes', async () => {
      const expiredDate = new Date(Date.now() - 100000);
      mockPrisma.appointment.findFirst.mockResolvedValue(mockAppointment);
      mockPrisma.teleconsultationRoom.findUnique.mockResolvedValue({
        ...mockRoom,
        expiresAt: expiredDate,
        status: TeleconsultationRoomStatus.EXPIRED,
      });
      mockPrisma.teleconsultationRoom.update.mockImplementation(({ data }) =>
        Promise.resolve({ ...mockRoom, ...data }),
      );

      const result = await service.activateRoom(APPT_ID, ownerScope);
      expect(result.status).toBe(TeleconsultationRoomStatus.ACTIVE);
      const newExpiry = new Date(result.expiresAt).getTime();
      expect(newExpiry).toBeGreaterThan(Date.now());
      expect(mockPrisma.teleconsultationRoom.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TeleconsultationRoomStatus.ACTIVE,
          }),
        }),
      );
    });

    it('activates a room that is past expiresAt and extends expiresAt by 60 minutes', async () => {
      const pastDate = new Date(Date.now() - 5000);
      mockPrisma.appointment.findFirst.mockResolvedValue(mockAppointment);
      mockPrisma.teleconsultationRoom.findUnique.mockResolvedValue({
        ...mockRoom,
        expiresAt: pastDate,
        status: TeleconsultationRoomStatus.PENDING,
      });
      mockPrisma.teleconsultationRoom.update.mockImplementation(({ data }) =>
        Promise.resolve({ ...mockRoom, ...data }),
      );

      const result = await service.activateRoom(APPT_ID, ownerScope);
      expect(result.status).toBe(TeleconsultationRoomStatus.ACTIVE);
      const newExpiry = new Date(result.expiresAt).getTime();
      expect(newExpiry).toBeGreaterThan(Date.now());
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // terminateRoom
  // ─────────────────────────────────────────────────────────────────

  describe('terminateRoom', () => {
    it('terminates an ACTIVE room', async () => {
      mockPrisma.appointment.findFirst.mockResolvedValue(mockAppointment);
      mockPrisma.teleconsultationRoom.findUnique.mockResolvedValue({
        ...mockRoom,
        status: TeleconsultationRoomStatus.ACTIVE,
      });
      mockPrisma.teleconsultationRoom.update.mockResolvedValue({
        ...mockRoom,
        status: TeleconsultationRoomStatus.TERMINATED,
      });

      const result = await service.terminateRoom(APPT_ID, ownerScope);
      expect(result.status).toBe(TeleconsultationRoomStatus.TERMINATED);
    });

    it('throws BadRequestException when room is already TERMINATED', async () => {
      mockPrisma.appointment.findFirst.mockResolvedValue(mockAppointment);
      mockPrisma.teleconsultationRoom.findUnique.mockResolvedValue({
        ...mockRoom,
        status: TeleconsultationRoomStatus.TERMINATED,
      });
      await expect(service.terminateRoom(APPT_ID, ownerScope)).rejects.toThrow(BadRequestException);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // getRoomAccess (Public Patient Access)
  // ─────────────────────────────────────────────────────────────────

  describe('getRoomAccess', () => {
    const mockRoomWithRelations = {
      ...mockRoom,
      appointment: {
        ...mockAppointment,
        patient: { firstName: 'Ana', lastName: 'Rodríguez' },
        psychologist: { name: 'Dr. Carlos Mendoza' },
        organization: { displayName: 'PsiqueOS Central', tradeName: null },
      },
    };

    it('returns public room metadata when roomCode and token match', async () => {
      mockPrisma.teleconsultationRoom.findUnique.mockResolvedValue(mockRoomWithRelations);

      const result = await service.getRoomAccess(mockRoom.roomCode, mockRoom.patientToken);
      expect(result.roomCode).toBe(mockRoom.roomCode);
      expect(result.patientName).toBe('Ana Rodríguez');
      expect(result.psychologistName).toBe('Dr. Carlos Mendoza');
      expect(result.organizationName).toBe('PsiqueOS Central');
      expect(result.status).toBe(TeleconsultationRoomStatus.PENDING);
      expect((result as any).therapistPasscode).toBeUndefined();
    });

    it('throws UnauthorizedException when token is missing or empty', async () => {
      await expect(service.getRoomAccess(mockRoom.roomCode, '')).rejects.toThrow();
    });

    it('throws NotFoundException when roomCode is not found', async () => {
      mockPrisma.teleconsultationRoom.findUnique.mockResolvedValue(null);
      await expect(
        service.getRoomAccess('nonexistent-code', mockRoom.patientToken),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws UnauthorizedException when token does not match', async () => {
      mockPrisma.teleconsultationRoom.findUnique.mockResolvedValue(mockRoomWithRelations);
      await expect(
        service.getRoomAccess(mockRoom.roomCode, 'wrong-token'),
      ).rejects.toThrow();
    });

    it('returns EXPIRED status when expiresAt is in the past', async () => {
      mockPrisma.teleconsultationRoom.findUnique.mockResolvedValue({
        ...mockRoomWithRelations,
        expiresAt: new Date(Date.now() - 60000),
      });

      const result = await service.getRoomAccess(mockRoom.roomCode, mockRoom.patientToken);
      expect(result.status).toBe(TeleconsultationRoomStatus.EXPIRED);
    });

    it('builds teleconsultation patient URL correctly', () => {
      const url = service.buildTeleconsultationUrl(
        'https://app.psiqueos.com',
        'code123',
        'token456',
      );
      expect(url).toBe('https://app.psiqueos.com/teleconsulta/code123?token=token456');
    });
  });
});
