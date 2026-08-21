import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MembershipRole, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantResolutionMode } from '../common/request-context/request-context.service';
import {
  CapabilityDecision,
  OrganizationCapability,
} from '../tenant-context/authorization/organization-capability';
import { OrganizationPolicyService } from '../tenant-context/authorization/organization-policy.service';
import type { ClinicalAccessScope } from '../tenant-context/clinical-access.types';
import { TenantObservabilityService } from '../tenant-context/tenant-observability.service';
import { AppointmentsService } from './appointments.service';

type PrismaMock = {
  appointment: {
    create: jest.Mock;
    deleteMany: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    updateMany: jest.Mock;
  };
  scheduleBlock: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    delete: jest.Mock;
  };
  organizationMembership: { findFirst: jest.Mock };
  patient: { findFirst: jest.Mock };
  patientAssignment: { findFirst: jest.Mock };
};

describe('AppointmentsService tenant isolation and notes policy', () => {
  let service: AppointmentsService;
  let prisma: PrismaMock;
  let policy: { decisionFor: jest.Mock };
  let observability: { capabilityDenied: jest.Mock };

  beforeEach(() => {
    prisma = {
      appointment: {
        create: jest.fn(),
        deleteMany: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn(),
      },
      scheduleBlock: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        delete: jest.fn(),
      },
      organizationMembership: { findFirst: jest.fn() },
      patient: { findFirst: jest.fn() },
      patientAssignment: { findFirst: jest.fn() },
    };
    policy = {
      decisionFor: jest.fn((scope: ClinicalAccessScope, capability: string) =>
        decisionFor(scope.organizationRole, capability),
      ),
    };
    observability = { capabilityDenied: jest.fn() };
    service = new AppointmentsService(
      prisma as unknown as PrismaService,
      policy as unknown as OrganizationPolicyService,
      observability as unknown as TenantObservabilityService,
    );
  });

  const createDto = {
    patientId: 'patient-a-id',
    psychologistId: 'psychologist-a-id',
    scheduledAt: new Date(),
    durationMinutes: 50,
  };

  it('rejects creation with a foreign or legacy-null patient before writing', async () => {
    prisma.patient.findFirst.mockResolvedValue(null);

    await expect(
      service.create(
        { ...createDto, patientId: 'patient-b-id' },
        scope(MembershipRole.PSYCHOLOGIST),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.appointment.create).not.toHaveBeenCalled();
    expect(prisma.patient.findFirst).toHaveBeenCalledWith({
      where: { id: 'patient-b-id', organizationId: 'organization-a-id' },
      select: { id: true, psychologistId: true },
    });
  });

  it('creates tenant-scoped appointments and validates the professional membership', async () => {
    prisma.patient.findFirst.mockResolvedValue({
      id: 'patient-a-id',
      psychologistId: 'psychologist-a-id',
    });
    prisma.organizationMembership.findFirst.mockResolvedValue({
      id: 'membership-a-id',
    });
    prisma.appointment.create.mockResolvedValue(
      appointment({ notes: null, patient: { id: 'patient-a-id' } }),
    );
    prisma.patientAssignment.findFirst.mockResolvedValue({
      id: 'assignment-id',
    });

    await service.create(createDto, scope(MembershipRole.PSYCHOLOGIST));

    expect(prisma.organizationMembership.findFirst).toHaveBeenCalledWith({
      where: {
        userId: 'psychologist-a-id',
        organizationId: 'organization-a-id',
        status: 'ACTIVE',
        organization: { status: 'ACTIVE' },
      },
      select: { id: true },
    });
    const createCall = firstMockArg<{ data: Record<string, unknown> }>(
      prisma.appointment.create,
    );
    expect(createCall.data.organizationId).toBe('organization-a-id');
    expect(createCall.data.psychologistId).toBe('psychologist-a-id');
  });

  it('blocks receptionist notes on create even when the note is empty', async () => {
    prisma.patient.findFirst.mockResolvedValue({
      id: 'patient-a-id',
      psychologistId: 'psychologist-a-id',
    });
    prisma.organizationMembership.findFirst.mockResolvedValue({
      id: 'membership-a-id',
    });

    await expect(
      service.create(
        { ...createDto, notes: '' },
        scope(MembershipRole.RECEPTIONIST, 'receptionist-a-id'),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.appointment.create).not.toHaveBeenCalled();
  });

  it('omits notes from receptionist create responses for operational appointments', async () => {
    prisma.patient.findFirst.mockResolvedValue({
      id: 'patient-a-id',
      psychologistId: 'psychologist-a-id',
    });
    prisma.organizationMembership.findFirst.mockResolvedValue({
      id: 'membership-a-id',
    });
    prisma.appointment.create.mockResolvedValue(
      appointment({ notes: null, patient: { id: 'patient-a-id' } }),
    );

    const result = await service.create(
      createDto,
      scope(MembershipRole.RECEPTIONIST, 'receptionist-a-id'),
    );

    expect(result).not.toHaveProperty('notes');
  });

  it('lists only tenant appointments and strips clinical notes for receptionist access', async () => {
    prisma.appointment.findMany.mockResolvedValue([
      appointment({ notes: 'clinical note' }),
    ]);

    const result = await service.findAll(scope(MembershipRole.RECEPTIONIST));

    expect(prisma.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'organization-a-id' },
      }),
    );
    expect(result[0]).not.toHaveProperty('notes');
    expect(prisma.patientAssignment.findFirst).not.toHaveBeenCalled();
  });

  it('returns notes only when clinical capability and same-tenant assignment exist', async () => {
    prisma.appointment.findFirst.mockResolvedValue(
      appointment({ notes: 'clinical note' }),
    );
    prisma.patientAssignment.findFirst.mockResolvedValue({
      id: 'assignment-id',
    });

    await expect(
      service.findOne('appointment-a-id', scope(MembershipRole.PSYCHOLOGIST)),
    ).resolves.toMatchObject({ notes: 'clinical note' });
    const findCall = firstMockArg<{
      where: {
        id: string;
        organizationId: string;
        OR?: Array<{
          psychologistId?: string;
          patient?: {
            assignments?: {
              some?: { organizationId?: string; membershipId?: string };
            };
          };
        }>;
      };
      include: {
        patient: { select: { id: boolean; psychologistId: boolean } };
      };
    }>(prisma.appointment.findFirst);
    expect(findCall).toMatchObject({
      where: {
        id: 'appointment-a-id',
        organizationId: 'organization-a-id',
        OR: [{ psychologistId: 'psychologist-a-id' }, expect.any(Object)],
      },
      include: { patient: { select: { id: true, psychologistId: true } } },
    });
    expect(findCall.where.OR?.[1]?.patient?.assignments?.some).toMatchObject({
      organizationId: 'organization-a-id',
      membershipId: 'membership-a-id',
    });
  });

  it('blocks receptionist notes mutation without changing the record', async () => {
    prisma.appointment.findFirst.mockResolvedValue(appointment());

    await expect(
      service.update(
        'appointment-a-id',
        { notes: 'changed' },
        scope(MembershipRole.RECEPTIONIST),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.appointment.updateMany).not.toHaveBeenCalled();
  });

  it('allows receptionist operational updates when transformed DTO notes are undefined', async () => {
    prisma.appointment.findFirst.mockResolvedValue(appointment());
    prisma.appointment.updateMany.mockResolvedValue({ count: 1 });

    await service.update(
      'appointment-a-id',
      { status: 'CANCELLED', notes: undefined },
      scope(MembershipRole.RECEPTIONIST, 'receptionist-a-id'),
    );

    const updateCall = firstMockArg<{ where: Record<string, unknown> }>(
      prisma.appointment.updateMany,
    );
    expect(updateCall.where).toMatchObject({
      id: 'appointment-a-id',
      organizationId: 'organization-a-id',
    });
  });

  it('returns 404 for cross-tenant update and delete without side effects', async () => {
    prisma.appointment.findFirst.mockResolvedValue(null);

    await expect(
      service.update(
        'appointment-b-id',
        { status: 'CANCELLED' },
        scope(MembershipRole.ADMIN),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.remove('appointment-b-id', scope(MembershipRole.ADMIN)),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.appointment.updateMany).not.toHaveBeenCalled();
    expect(prisma.appointment.deleteMany).not.toHaveBeenCalled();
  });

  it('reschedules an appointment successfully when no conflict exists', async () => {
    const existing = appointment();
    prisma.appointment.findFirst.mockResolvedValue(existing);
    prisma.appointment.findMany.mockResolvedValue([]);
    prisma.scheduleBlock.findFirst.mockResolvedValue(null);
    prisma.appointment.updateMany.mockResolvedValue({ count: 1 });
    prisma.patientAssignment.findFirst.mockResolvedValue({ id: 'assignment-id' });

    const result = await service.reschedule(
      'appointment-a-id',
      {
        scheduledAt: '2026-08-25T16:00:00.000Z',
        durationMinutes: 60,
        reason: 'Patient request',
      },
      scope(MembershipRole.ADMIN),
    );

    expect(prisma.appointment.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'appointment-a-id',
        organizationId: 'organization-a-id',
      },
      data: expect.objectContaining({
        durationMinutes: 60,
        notes: expect.stringContaining('Patient request'),
      }),
    });
    expect(result).toBeDefined();
  });

  it('rejects reschedule when conflicting appointment exists', async () => {
    const existing = appointment({
      scheduledAt: new Date('2026-08-25T10:00:00.000Z'),
    });
    prisma.appointment.findFirst.mockResolvedValue(existing);
    prisma.appointment.findMany.mockResolvedValue([
      {
        id: 'appointment-other-id',
        scheduledAt: new Date('2026-08-25T16:00:00.000Z'),
        durationMinutes: 60,
      },
    ]);

    await expect(
      service.reschedule(
        'appointment-a-id',
        {
          scheduledAt: '2026-08-25T16:30:00.000Z',
          durationMinutes: 60,
        },
        scope(MembershipRole.ADMIN),
      ),
    ).rejects.toThrow('Existe un conflicto de horario con otra cita ya programada.');
  });

  it('rejects reschedule when conflicting schedule block exists', async () => {
    const existing = appointment({
      scheduledAt: new Date('2026-08-25T10:00:00.000Z'),
    });
    prisma.appointment.findFirst.mockResolvedValue(existing);
    prisma.appointment.findMany.mockResolvedValue([]);
    prisma.scheduleBlock.findFirst.mockResolvedValue({
      id: 'block-1',
      title: 'Training Session',
      startTime: new Date('2026-08-25T14:00:00.000Z'),
      endTime: new Date('2026-08-25T17:00:00.000Z'),
    });

    await expect(
      service.reschedule(
        'appointment-a-id',
        {
          scheduledAt: '2026-08-25T15:00:00.000Z',
          durationMinutes: 60,
        },
        scope(MembershipRole.ADMIN),
      ),
    ).rejects.toThrow('El horario seleccionado coincide con un bloqueo de agenda del terapeuta.');
  });

  it('rejects reschedule when appointment is not in SCHEDULED status', async () => {
    const existing = appointment({
      status: 'COMPLETED',
    });
    prisma.appointment.findFirst.mockResolvedValue(existing);

    await expect(
      service.reschedule(
        'appointment-a-id',
        {
          scheduledAt: '2026-08-25T15:00:00.000Z',
          durationMinutes: 60,
        },
        scope(MembershipRole.ADMIN),
      ),
    ).rejects.toThrow('La cita no se encuentra en un estado que permita su reprogramación.');
  });

  it('calculates availability slots accounting for appointments and schedule blocks', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({ id: 'mem-1' });
    prisma.appointment.findMany.mockResolvedValue([
      {
        id: 'appt-1',
        scheduledAt: new Date('2026-08-25T09:00:00.000Z'),
        durationMinutes: 60,
      },
    ]);
    prisma.scheduleBlock.findMany.mockResolvedValue([
      {
        id: 'block-1',
        title: 'Team Meeting',
        startTime: new Date('2026-08-25T11:00:00.000Z'),
        endTime: new Date('2026-08-25T12:00:00.000Z'),
      },
    ]);

    const availability = await service.getAvailability(
      {
        therapistId: 'psychologist-a-id',
        date: '2026-08-25',
        durationMinutes: 60,
        startHour: 8,
        endHour: 13,
      },
      scope(MembershipRole.ADMIN),
    );

    expect(availability.slots.length).toBe(5);
    // 08:00 - Available
    expect(availability.slots[0].available).toBe(true);
    // 09:00 - Appointment
    expect(availability.slots[1].available).toBe(false);
    expect(availability.slots[1].conflictType).toBe('APPOINTMENT');
    // 10:00 - Available
    expect(availability.slots[2].available).toBe(true);
    // 11:00 - Schedule Block
    expect(availability.slots[3].available).toBe(false);
    expect(availability.slots[3].conflictType).toBe('SCHEDULE_BLOCK');
    expect(availability.slots[3].title).toBe('Team Meeting');
    // 12:00 - Available
    expect(availability.slots[4].available).toBe(true);
  });
});

function decisionFor(role: MembershipRole, capability: string) {
  const organizationCapability = capability as OrganizationCapability;

  if (role === MembershipRole.OWNER) {
    return CapabilityDecision.ALLOW;
  }

  if (role === MembershipRole.ADMIN) {
    return [
      OrganizationCapability.APPOINTMENT_READ,
      OrganizationCapability.APPOINTMENT_MANAGE,
      OrganizationCapability.CLINICAL_READ,
      OrganizationCapability.CLINICAL_WRITE,
    ].includes(organizationCapability)
      ? CapabilityDecision.ALLOW
      : CapabilityDecision.DENY;
  }

  if (role === MembershipRole.PSYCHOLOGIST) {
    return [
      OrganizationCapability.APPOINTMENT_READ,
      OrganizationCapability.APPOINTMENT_MANAGE,
      OrganizationCapability.CLINICAL_READ,
      OrganizationCapability.CLINICAL_WRITE,
    ].includes(organizationCapability)
      ? CapabilityDecision.CONDITIONAL
      : CapabilityDecision.DENY;
  }

  if (role === MembershipRole.RECEPTIONIST) {
    if (organizationCapability === OrganizationCapability.APPOINTMENT_READ) {
      return CapabilityDecision.ALLOW;
    }
    if (organizationCapability === OrganizationCapability.APPOINTMENT_MANAGE) {
      return CapabilityDecision.CONDITIONAL;
    }
  }

  return CapabilityDecision.DENY;
}

function scope(
  organizationRole: MembershipRole,
  userId = 'psychologist-a-id',
): ClinicalAccessScope {
  return {
    organizationId: 'organization-a-id',
    membershipId: 'membership-a-id',
    organizationRole,
    userId,
    legacyUserRole: UserRole.PSYCHOLOGIST,
    resolutionMode: TenantResolutionMode.EXPLICIT,
  };
}

function appointment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'appointment-a-id',
    organizationId: 'organization-a-id',
    patientId: 'patient-a-id',
    psychologistId: 'psychologist-a-id',
    scheduledAt: new Date(),
    durationMinutes: 50,
    status: 'SCHEDULED',
    notes: null,
    patient: {
      id: 'patient-a-id',
      psychologistId: 'psychologist-a-id',
    },
    ...overrides,
  };
}

function firstMockArg<T>(mock: jest.Mock): T {
  const [firstCall] = mock.mock.calls as [unknown[]];
  return firstCall[0] as T;
}
