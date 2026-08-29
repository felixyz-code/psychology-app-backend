import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  CapabilityDecision,
  OrganizationCapability,
} from '../tenant-context/authorization/organization-capability';
import {
  MembershipRole,
  PatientAssignmentStatus,
  UserRole,
} from '@prisma/client';
import { DocumentsService } from '../documents/documents.service';
import { PrismaService } from '../prisma/prisma.service';
import { OrganizationPolicyService } from '../tenant-context/authorization/organization-policy.service';
import { TenantResolutionMode } from '../common/request-context/request-context.service';
import { TenantObservabilityService } from '../tenant-context/tenant-observability.service';
import { PatientsService } from './patients.service';
import { PatientAccessScope } from './types/patient-access-scope.type';

type PrismaMock = {
  patient: {
    create: jest.Mock;
    deleteMany: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
  document: { findMany: jest.Mock };
  patientAssignment: {
    create: jest.Mock;
    deleteMany: jest.Mock;
    findFirst: jest.Mock;
    updateMany: jest.Mock;
  };
  branch: { findFirst: jest.Mock };
  userBranchAccess: { findMany: jest.Mock; findUnique: jest.Mock };
  organizationMembership: { findFirst: jest.Mock };
  $transaction: jest.Mock;
};

const scopeA: PatientAccessScope = {
  organizationId: 'organization-a-id',
  membershipId: 'membership-a-id',
  organizationRole: MembershipRole.OWNER,
  userId: 'psychologist-a-id',
  legacyUserRole: UserRole.PSYCHOLOGIST,
  resolutionMode: TenantResolutionMode.EXPLICIT,
};
const psychologistScope: PatientAccessScope = {
  ...scopeA,
  organizationRole: MembershipRole.PSYCHOLOGIST,
};
const receptionistScope: PatientAccessScope = {
  ...scopeA,
  organizationRole: MembershipRole.RECEPTIONIST,
  userId: 'receptionist-a-id',
  membershipId: 'receptionist-mem-id',
};
const auditorScope: PatientAccessScope = {
  ...scopeA,
  organizationRole: MembershipRole.AUDITOR,
};
const scopeSameOrganizationOtherPsychologist: PatientAccessScope = {
  ...psychologistScope,
  userId: 'psychologist-b-id',
  membershipId: 'membership-b-id',
};
const scopeSamePsychologistOtherOrganization: PatientAccessScope = {
  ...psychologistScope,
  organizationId: 'organization-b-id',
  membershipId: 'membership-c-id',
};

describe('PatientsService D1 tenant-aware policy', () => {
  let service: PatientsService;
  let prisma: PrismaMock;
  let documentsService: Pick<DocumentsService, 'cleanupDocumentFiles'>;
  let policy: Pick<OrganizationPolicyService, 'decisionFor'>;
  let observability: Pick<TenantObservabilityService, 'capabilityDenied'>;

  beforeEach(() => {
    prisma = {
      patient: {
        create: jest.fn(),
        deleteMany: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      document: { findMany: jest.fn() },
      patientAssignment: {
        create: jest.fn(),
        deleteMany: jest.fn(),
        findFirst: jest.fn(),
        updateMany: jest.fn(),
      },
      branch: { findFirst: jest.fn() },
      userBranchAccess: { findMany: jest.fn(), findUnique: jest.fn() },
      organizationMembership: { findFirst: jest.fn() },
      $transaction: jest.fn((callback) => callback(prisma)),
    };
    documentsService = { cleanupDocumentFiles: jest.fn() };
    policy = {
      decisionFor: jest.fn().mockReturnValue(CapabilityDecision.ALLOW),
    };
    observability = { capabilityDenied: jest.fn() };
    service = new PatientsService(
      prisma as unknown as PrismaService,
      documentsService as DocumentsService,
      policy as OrganizationPolicyService,
      observability as TenantObservabilityService,
    );
  });

  it('lists only patients matching tenant, legacy owner, and active assignment', async () => {
    prisma.patient.findMany.mockResolvedValue([]);

    await service.findAll(psychologistScope);

    expect(policy.decisionFor).toHaveBeenCalledWith(
      psychologistScope,
      OrganizationCapability.PATIENT_READ,
    );
    expect(prisma.patient.findMany).toHaveBeenCalledWith({
      where: assignedScopeWhere(psychologistScope),
      orderBy: { createdAt: 'desc' },
    });
  });

  it.each([
    ['a missing patient', psychologistScope],
    [
      'a patient from another psychologist in the same organization',
      psychologistScope,
    ],
    [
      'a patient from another organization for the same psychologist',
      psychologistScope,
    ],
    ['a legacy patient with a null organizationId', psychologistScope],
  ])('returns the same 404 for %s', async (_, scope) => {
    prisma.patient.findFirst.mockResolvedValue(null);

    await expect(service.findOne('patient-id', scope)).rejects.toEqual(
      new NotFoundException('Patient not found'),
    );
    expect(prisma.patient.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'patient-id',
        organizationId: scope.organizationId,
        psychologistId: scope.userId,
      },
    });
    expect(policy.decisionFor).not.toHaveBeenCalled();
  });

  it('allows OWNER to list all patients in the tenant when branch is null or ALL', async () => {
    prisma.patient.findMany.mockResolvedValue([]);

    await service.findAll(scopeA);

    expect(prisma.patient.findMany).toHaveBeenCalledWith({
      where: { organizationId: scopeA.organizationId },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('filters patients by branch for OWNER when specific branchId is provided', async () => {
    prisma.patient.findMany.mockResolvedValue([]);

    await service.findAll({ ...scopeA, branchId: 'branch-1' });

    expect(prisma.patient.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: scopeA.organizationId,
        OR: [
          { branchId: 'branch-1' },
          {
            psychologist: {
              branchAccesses: {
                some: {
                  branchId: 'branch-1',
                  organizationId: scopeA.organizationId,
                },
              },
            },
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('keeps same-organization and same-psychologist scope variants distinct', async () => {
    prisma.patient.findMany.mockResolvedValue([]);

    await service.findAll(scopeSameOrganizationOtherPsychologist);
    await service.findAll(scopeSamePsychologistOtherOrganization);

    expect(prisma.patient.findMany).toHaveBeenNthCalledWith(1, {
      where: assignedScopeWhere(scopeSameOrganizationOtherPsychologist),
      orderBy: { createdAt: 'desc' },
    });
    expect(prisma.patient.findMany).toHaveBeenNthCalledWith(2, {
      where: assignedScopeWhere(scopeSamePsychologistOtherOrganization),
      orderBy: { createdAt: 'desc' },
    });
  });

  it('forces tenant ownership and creates a self-assignment on create', async () => {
    prisma.patient.create.mockResolvedValue({ id: 'patient-a-id' });
    const unsafeDto = {
      firstName: 'A',
      lastName: 'Patient',
      organizationId: 'organization-b-id',
      psychologistId: 'psychologist-b-id',
    };

    await service.create(unsafeDto, scopeA);

    expect(policy.decisionFor).toHaveBeenCalledWith(
      scopeA,
      OrganizationCapability.PATIENT_CREATE,
    );
    expect(prisma.patient.create).toHaveBeenCalledWith({
      data: {
        firstName: 'A',
        lastName: 'Patient',
        organizationId: scopeA.organizationId,
        psychologistId: scopeA.userId,
        assignments: {
          create: {
            organizationId: scopeA.organizationId,
            membershipId: scopeA.membershipId,
            role: 'PRIMARY',
            status: 'ACTIVE',
            createdByMembershipId: scopeA.membershipId,
            creationReason: 'PATIENT_CREATED_BY_ASSIGNED_PROFESSIONAL',
          },
        },
      },
    });
  });

  it('allows a conditional psychologist capability only with assignment policy', async () => {
    policy.decisionFor = jest
      .fn()
      .mockReturnValue(CapabilityDecision.CONDITIONAL);
    prisma.patient.findMany.mockResolvedValue([]);

    await service.findAll(psychologistScope);

    expect(prisma.patient.findMany).toHaveBeenCalledWith({
      where: assignedScopeWhere(psychologistScope),
      orderBy: { createdAt: 'desc' },
    });
  });

  it('denies conditional non-clinical roles instead of returning a projection', async () => {
    policy.decisionFor = jest
      .fn()
      .mockReturnValue(CapabilityDecision.CONDITIONAL);

    await expect(service.findAll(auditorScope)).rejects.toEqual(
      new ForbiddenException('Organization capability is required'),
    );
    expect(observability.capabilityDenied).toHaveBeenCalledWith(
      auditorScope,
      OrganizationCapability.PATIENT_READ,
      'patients.find_all',
    );
    expect(prisma.patient.findMany).not.toHaveBeenCalled();
  });

  it('denies missing capability before reads or mutations', async () => {
    policy.decisionFor = jest.fn().mockReturnValue(CapabilityDecision.DENY);

    await expect(service.findAll(scopeA)).rejects.toEqual(
      new ForbiddenException('Organization capability is required'),
    );
    expect(observability.capabilityDenied).toHaveBeenCalledWith(
      scopeA,
      OrganizationCapability.PATIENT_READ,
      'patients.find_all',
    );
    expect(prisma.patient.findMany).not.toHaveBeenCalled();
  });

  it('updates only a fully scoped and assigned patient', async () => {
    prisma.patient.findFirst.mockResolvedValue({ id: 'patient-a-id' });
    prisma.patientAssignment.findFirst.mockResolvedValue({
      id: 'assignment-id',
    });
    prisma.patient.updateMany.mockResolvedValue({ count: 1 });
    const unsafeDto = {
      firstName: 'Updated',
      organizationId: 'organization-b-id',
      psychologistId: 'psychologist-b-id',
    };

    await service.update('patient-a-id', unsafeDto, scopeA);

    expect(prisma.patient.updateMany).toHaveBeenCalledWith({
      where: { id: 'patient-a-id', ...assignedScopeWhere(scopeA) },
      data: { firstName: 'Updated' },
    });
    expect(prisma.patient.findFirst).toHaveBeenLastCalledWith({
      where: { id: 'patient-a-id', ...assignedScopeWhere(scopeA) },
    });
  });

  it('returns 403 and does not mutate when assignment is missing for a visible patient', async () => {
    prisma.patient.findFirst.mockResolvedValue({ id: 'patient-a-id' });
    prisma.patientAssignment.findFirst.mockResolvedValue(null);

    await expect(
      service.update('patient-a-id', { firstName: 'Updated' }, scopeA),
    ).rejects.toEqual(new ForbiddenException('Patient assignment is required'));
    expect(prisma.patient.updateMany).not.toHaveBeenCalled();
  });

  it('returns 404 and does not reread when scoped update affects no patient', async () => {
    prisma.patient.findFirst.mockResolvedValue({ id: 'patient-id' });
    prisma.patientAssignment.findFirst.mockResolvedValue({
      id: 'assignment-id',
    });
    prisma.patient.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.update('patient-id', { firstName: 'Updated' }, scopeA),
    ).rejects.toEqual(new NotFoundException('Patient not found'));
    expect(prisma.patient.updateMany).toHaveBeenCalledWith({
      where: { id: 'patient-id', ...assignedScopeWhere(scopeA) },
      data: { firstName: 'Updated' },
    });
    expect(prisma.patient.findFirst).toHaveBeenCalledTimes(1);
  });

  it('checks assignment before loading document metadata and cleans files only after delete', async () => {
    prisma.patient.findFirst.mockResolvedValue({ id: 'patient-a-id' });
    prisma.patientAssignment.findFirst.mockResolvedValue({
      id: 'assignment-id',
    });
    prisma.document.findMany.mockResolvedValue([
      { filePath: 'uploads/patients/patient-a-id/one.pdf' },
    ]);
    prisma.patientAssignment.deleteMany.mockResolvedValue({ count: 1 });
    prisma.patient.deleteMany.mockResolvedValue({ count: 1 });

    await service.remove('patient-a-id', scopeA);

    expect(prisma.document.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: scopeA.organizationId,
        caseFile: {
          patient: { id: 'patient-a-id', ...assignedScopeWhere(scopeA) },
        },
      },
      select: { filePath: true },
    });
    expect(prisma.patientAssignment.deleteMany).toHaveBeenCalledWith({
      where: {
        organizationId: scopeA.organizationId,
        patientId: 'patient-a-id',
        patient: assignedScopeWhere(scopeA),
      },
    });
    expect(prisma.patient.deleteMany).toHaveBeenCalledWith({
      where: {
        id: 'patient-a-id',
        organizationId: scopeA.organizationId,
        psychologistId: scopeA.userId,
      },
    });
    expect(documentsService.cleanupDocumentFiles).toHaveBeenCalledWith([
      'uploads/patients/patient-a-id/one.pdf',
    ]);
  });

  describe('transferBranch', () => {
    it('transfers patient and reassigns primary assignment to target psychologist', async () => {
      prisma.patient.findFirst.mockResolvedValue({
        id: 'patient-a-id',
        branchId: 'branch-old-id',
        psychologistId: 'psychologist-a-id',
      });
      prisma.branch.findFirst.mockResolvedValue({
        id: 'branch-target-id',
        name: 'Sucursal Norte',
        isActive: true,
      });
      prisma.organizationMembership.findFirst.mockResolvedValue({
        id: 'membership-b-id',
      });
      prisma.userBranchAccess.findUnique.mockResolvedValue({
        id: 'access-id',
        userId: 'psychologist-b-id',
        branchId: 'branch-target-id',
      });
      prisma.patientAssignment.updateMany.mockResolvedValue({ count: 1 });
      prisma.patientAssignment.create.mockResolvedValue({
        id: 'new-assignment-id',
      });
      prisma.patient.update.mockResolvedValue({
        id: 'patient-a-id',
        branchId: 'branch-target-id',
        psychologistId: 'psychologist-b-id',
      });

      const result = await service.transferBranch(
        'patient-a-id',
        {
          targetBranchId: 'branch-target-id',
          targetPsychologistId: 'psychologist-b-id',
          reason: 'Cambio de domicilio del paciente',
        },
        scopeA,
      );

      expect(prisma.branch.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'branch-target-id',
          organizationId: scopeA.organizationId,
          deletedAt: null,
          isActive: true,
        },
      });
      expect(prisma.userBranchAccess.findUnique).toHaveBeenCalledWith({
        where: {
          userId_branchId: {
            userId: 'psychologist-b-id',
            branchId: 'branch-target-id',
          },
        },
      });
      expect(prisma.patientAssignment.updateMany).toHaveBeenCalledWith({
        where: {
          patientId: 'patient-a-id',
          organizationId: scopeA.organizationId,
          status: PatientAssignmentStatus.ACTIVE,
        },
        data: expect.objectContaining({
          status: PatientAssignmentStatus.ENDED,
          closureReason: expect.stringContaining('Cambio de domicilio'),
        }),
      });
      expect(prisma.patientAssignment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          patientId: 'patient-a-id',
          membershipId: 'membership-b-id',
          role: 'PRIMARY',
          status: PatientAssignmentStatus.ACTIVE,
          creationReason: expect.stringContaining('Cambio de domicilio'),
        }),
      });
      expect(prisma.patient.update).toHaveBeenCalledWith({
        where: { id: 'patient-a-id' },
        data: {
          branchId: 'branch-target-id',
          psychologistId: 'psychologist-b-id',
        },
      });
      expect(result.branchId).toBe('branch-target-id');
    });

    it('rejects transfer when target branch is not found or inactive', async () => {
      prisma.patient.findFirst.mockResolvedValue({
        id: 'patient-a-id',
        branchId: 'branch-old-id',
        psychologistId: 'psychologist-a-id',
      });
      prisma.branch.findFirst.mockResolvedValue(null);

      await expect(
        service.transferBranch(
          'patient-a-id',
          {
            targetBranchId: 'branch-nonexistent',
            reason: 'Transfer test',
          },
          scopeA,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects transfer when target psychologist lacks UserBranchAccess to target branch', async () => {
      prisma.patient.findFirst.mockResolvedValue({
        id: 'patient-a-id',
        branchId: 'branch-old-id',
        psychologistId: 'psychologist-a-id',
      });
      prisma.branch.findFirst.mockResolvedValue({
        id: 'branch-target-id',
        isActive: true,
      });
      prisma.organizationMembership.findFirst.mockResolvedValue({
        id: 'membership-b-id',
      });
      prisma.userBranchAccess.findUnique.mockResolvedValue(null);

      await expect(
        service.transferBranch(
          'patient-a-id',
          {
            targetBranchId: 'branch-target-id',
            targetPsychologistId: 'psychologist-b-id',
            reason: 'Transfer without branch access',
          },
          scopeA,
        ),
      ).rejects.toThrow(
        'El profesional asignado no tiene acceso a la sede destino.',
      );
    });
  });

  describe('receptionist branch isolation', () => {
    it('scopes patient directory to branches assigned in UserBranchAccess for RECEPTIONIST', async () => {
      policy.decisionFor = jest
        .fn()
        .mockReturnValue(CapabilityDecision.CONDITIONAL);
      prisma.userBranchAccess.findMany.mockResolvedValue([
        { branchId: 'branch-assigned-1' },
      ]);
      prisma.patient.findMany.mockResolvedValue([
        { id: 'p-1', firstName: 'Paciente', lastName: 'Uno' },
      ]);

      const result = await service.findAll(receptionistScope);

      expect(prisma.patient.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: receptionistScope.organizationId,
          OR: [
            { branchId: { in: ['branch-assigned-1'] } },
            {
              psychologist: {
                branchAccesses: {
                  some: {
                    branchId: { in: ['branch-assigned-1'] },
                    organizationId: receptionistScope.organizationId,
                  },
                },
              },
            },
          ],
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(result.length).toBe(1);
    });

    it('returns empty list when RECEPTIONIST has no assigned branches', async () => {
      policy.decisionFor = jest
        .fn()
        .mockReturnValue(CapabilityDecision.CONDITIONAL);
      prisma.userBranchAccess.findMany.mockResolvedValue([]);

      const result = await service.findAll(receptionistScope);

      expect(result).toEqual([]);
      expect(prisma.patient.findMany).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when RECEPTIONIST requests branch they lack access to', async () => {
      policy.decisionFor = jest
        .fn()
        .mockReturnValue(CapabilityDecision.CONDITIONAL);
      prisma.userBranchAccess.findMany.mockResolvedValue([
        { branchId: 'branch-1' },
      ]);

      await expect(
        service.findAll({
          ...receptionistScope,
          branchId: 'branch-unauthorized',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});

function assignmentWhere(scope: PatientAccessScope) {
  return {
    organizationId: scope.organizationId,
    membershipId: scope.membershipId,
    status: PatientAssignmentStatus.ACTIVE,
    membership: {
      organizationId: scope.organizationId,
      userId: scope.userId,
      status: 'ACTIVE',
      organization: { status: 'ACTIVE' },
    },
  };
}

function assignedScopeWhere(scope: PatientAccessScope) {
  return {
    organizationId: scope.organizationId,
    psychologistId: scope.userId,
    assignments: { some: assignmentWhere(scope) },
  };
}
