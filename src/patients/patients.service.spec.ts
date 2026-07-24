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
    updateMany: jest.Mock;
  };
  document: { findMany: jest.Mock };
  patientAssignment: { deleteMany: jest.Mock; findFirst: jest.Mock };
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
const auditorScope: PatientAccessScope = {
  ...scopeA,
  organizationRole: MembershipRole.AUDITOR,
};
const scopeSameOrganizationOtherPsychologist: PatientAccessScope = {
  ...scopeA,
  userId: 'psychologist-b-id',
  membershipId: 'membership-b-id',
};
const scopeSamePsychologistOtherOrganization: PatientAccessScope = {
  ...scopeA,
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
        updateMany: jest.fn(),
      },
      document: { findMany: jest.fn() },
      patientAssignment: { deleteMany: jest.fn(), findFirst: jest.fn() },
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

    await service.findAll(scopeA);

    expect(policy.decisionFor).toHaveBeenCalledWith(
      scopeA,
      OrganizationCapability.PATIENT_READ,
    );
    expect(prisma.patient.findMany).toHaveBeenCalledWith({
      where: assignedScopeWhere(scopeA),
      orderBy: { createdAt: 'desc' },
    });
  });

  it.each([
    ['a missing patient', scopeA],
    ['a patient from another psychologist in the same organization', scopeA],
    ['a patient from another organization for the same psychologist', scopeA],
    ['a legacy patient with a null organizationId', scopeA],
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

  it('denies conditional non-clinical roles instead of returning a projection', () => {
    policy.decisionFor = jest
      .fn()
      .mockReturnValue(CapabilityDecision.CONDITIONAL);

    expect(() => service.findAll(auditorScope)).toThrow(
      new ForbiddenException('Organization capability is required'),
    );
    expect(observability.capabilityDenied).toHaveBeenCalledWith(
      auditorScope,
      OrganizationCapability.PATIENT_READ,
      'patients.find_all',
    );
    expect(prisma.patient.findMany).not.toHaveBeenCalled();
  });

  it('denies missing capability before reads or mutations', () => {
    policy.decisionFor = jest.fn().mockReturnValue(CapabilityDecision.DENY);

    expect(() => service.findAll(scopeA)).toThrow(
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
