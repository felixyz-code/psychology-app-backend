import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MembershipRole, UserRole } from '@prisma/client';
import { TenantResolutionMode } from '../common/request-context/request-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { CapabilityDecision } from '../tenant-context/authorization/organization-capability';
import { OrganizationPolicyService } from '../tenant-context/authorization/organization-policy.service';
import type { ClinicalAccessScope } from '../tenant-context/clinical-access.types';
import { TenantObservabilityService } from '../tenant-context/tenant-observability.service';
import { ScheduleBlocksService } from './schedule-blocks.service';

type PrismaMock = {
  scheduleBlock: {
    create: jest.Mock;
    delete: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
  };
  appointment: {
    findMany: jest.Mock;
  };
  organizationMembership: {
    findFirst: jest.Mock;
  };
};

describe('ScheduleBlocksService', () => {
  let service: ScheduleBlocksService;
  let prisma: PrismaMock;
  let policy: { decisionFor: jest.Mock };
  let observability: { capabilityDenied: jest.Mock };

  beforeEach(() => {
    prisma = {
      scheduleBlock: {
        create: jest.fn(),
        delete: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      appointment: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      organizationMembership: {
        findFirst: jest.fn().mockResolvedValue({ id: 'mem-1' }),
      },
    };
    policy = {
      decisionFor: jest.fn((scope: ClinicalAccessScope) =>
        decisionFor(scope.organizationRole),
      ),
    };
    observability = { capabilityDenied: jest.fn() };
    service = new ScheduleBlocksService(
      prisma as unknown as PrismaService,
      policy as unknown as OrganizationPolicyService,
      observability as unknown as TenantObservabilityService,
    );
  });

  it('creates a schedule block successfully when no overlap exists', async () => {
    prisma.scheduleBlock.findFirst.mockResolvedValue(null);
    prisma.appointment.findMany.mockResolvedValue([]);
    prisma.scheduleBlock.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: 'block-id', ...data }),
    );

    const dto = {
      therapistId: 'psychologist-a-id',
      title: 'Clinical Supervision',
      reason: 'Bi-weekly case discussion',
      startTime: '2026-08-25T14:00:00.000Z',
      endTime: '2026-08-25T16:00:00.000Z',
    };

    const result = await service.create(dto, scope(MembershipRole.ADMIN));

    expect(prisma.scheduleBlock.create).toHaveBeenCalledWith({
      data: {
        organizationId: 'organization-a-id',
        therapistId: 'psychologist-a-id',
        title: 'Clinical Supervision',
        reason: 'Bi-weekly case discussion',
        startTime: new Date('2026-08-25T14:00:00.000Z'),
        endTime: new Date('2026-08-25T16:00:00.000Z'),
      },
    });
    expect(result.id).toBe('block-id');
  });

  it('rejects schedule block creation with invalid time range (start >= end)', async () => {
    const dto = {
      therapistId: 'psychologist-a-id',
      title: 'Invalid Block',
      startTime: '2026-08-25T16:00:00.000Z',
      endTime: '2026-08-25T14:00:00.000Z',
    };

    await expect(
      service.create(dto, scope(MembershipRole.ADMIN)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects schedule block creation when overlapping with another schedule block', async () => {
    prisma.scheduleBlock.findFirst.mockResolvedValue({
      id: 'existing-block',
      title: 'Supervision Session',
    });

    const dto = {
      therapistId: 'psychologist-a-id',
      title: 'Vacation',
      startTime: '2026-08-25T14:00:00.000Z',
      endTime: '2026-08-25T16:00:00.000Z',
    };

    await expect(
      service.create(dto, scope(MembershipRole.ADMIN)),
    ).rejects.toThrow(
      'El horario seleccionado coincide con un bloqueo de agenda del terapeuta: "Supervision Session".',
    );
  });

  it('rejects schedule block creation when overlapping with an active appointment', async () => {
    prisma.scheduleBlock.findFirst.mockResolvedValue(null);
    prisma.appointment.findMany.mockResolvedValue([
      {
        id: 'appt-1',
        scheduledAt: new Date('2026-08-25T14:30:00.000Z'),
        durationMinutes: 50,
      },
    ]);

    const dto = {
      therapistId: 'psychologist-a-id',
      title: 'Emergency Medical',
      startTime: '2026-08-25T14:00:00.000Z',
      endTime: '2026-08-25T16:00:00.000Z',
    };

    await expect(
      service.create(dto, scope(MembershipRole.ADMIN)),
    ).rejects.toThrow(
      'Existe un conflicto de horario con otra cita ya programada.',
    );
  });

  it('lists schedule blocks with optional date filters', async () => {
    prisma.scheduleBlock.findMany.mockResolvedValue([
      {
        id: 'block-1',
        title: 'Block 1',
        startTime: new Date('2026-08-25T10:00:00.000Z'),
        endTime: new Date('2026-08-25T12:00:00.000Z'),
      },
    ]);

    const blocks = await service.findAll(
      {
        therapistId: 'psychologist-a-id',
        startDate: '2026-08-20T00:00:00.000Z',
        endDate: '2026-08-30T23:59:59.000Z',
      },
      scope(MembershipRole.ADMIN),
    );

    expect(blocks.length).toBe(1);
    expect(prisma.scheduleBlock.findMany).toHaveBeenCalled();
  });

  it('deletes a schedule block if found within tenant', async () => {
    const block = {
      id: 'block-1',
      organizationId: 'organization-a-id',
      therapistId: 'psychologist-a-id',
    };
    prisma.scheduleBlock.findFirst.mockResolvedValue(block);
    prisma.scheduleBlock.delete.mockResolvedValue(block);

    const deleted = await service.remove(
      'block-1',
      scope(MembershipRole.ADMIN),
    );
    expect(deleted.id).toBe('block-1');
    expect(prisma.scheduleBlock.delete).toHaveBeenCalledWith({
      where: { id: 'block-1' },
    });
  });

  it('throws 404 when deleting a non-existent schedule block', async () => {
    prisma.scheduleBlock.findFirst.mockResolvedValue(null);

    await expect(
      service.remove('block-99', scope(MembershipRole.ADMIN)),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

function decisionFor(role: MembershipRole) {
  if (role === MembershipRole.OWNER || role === MembershipRole.ADMIN) {
    return CapabilityDecision.ALLOW;
  }
  if (role === MembershipRole.PSYCHOLOGIST) {
    return CapabilityDecision.CONDITIONAL;
  }
  if (role === MembershipRole.RECEPTIONIST) {
    return CapabilityDecision.ALLOW;
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
