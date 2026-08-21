import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  MembershipRole,
  MembershipStatus,
  OrganizationStatus,
  PatientAssignmentStatus,
  UserRole,
} from '@prisma/client';
import { TenantResolutionMode } from '../common/request-context/request-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { ClinicalAccessPolicyService } from '../tenant-context/clinical-access-policy.service';
import type { ClinicalAccessScope } from '../tenant-context/clinical-access.types';
import { OrganizationCapability } from '../tenant-context/authorization/organization-capability';
import { SessionNotesService } from './session-notes.service';

type PrismaMock = {
  caseFile: { findFirst: jest.Mock };
  patientAssignment: { findFirst: jest.Mock };
  sessionNote: {
    create: jest.Mock;
    deleteMany: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    updateMany: jest.Mock;
  };
};

const scope: ClinicalAccessScope = {
  organizationId: 'organization-a-id',
  membershipId: 'membership-a-id',
  organizationRole: MembershipRole.PSYCHOLOGIST,
  userId: 'psychologist-a-id',
  legacyUserRole: UserRole.PSYCHOLOGIST,
  resolutionMode: TenantResolutionMode.EXPLICIT,
};

describe('SessionNotesService D2 tenant-aware policy', () => {
  let service: SessionNotesService;
  let prisma: PrismaMock;
  let clinicalPolicy: jest.Mocked<
    Pick<
      ClinicalAccessPolicyService,
      | 'requireCapability'
      | 'tenantPatientWhere'
      | 'assignedPatientWhere'
      | 'assignmentWhere'
    >
  >;

  beforeEach(() => {
    prisma = {
      caseFile: { findFirst: jest.fn() },
      patientAssignment: { findFirst: jest.fn() },
      sessionNote: {
        create: jest.fn(),
        deleteMany: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    clinicalPolicy = {
      requireCapability: jest.fn(),
      tenantPatientWhere: jest.fn(tenantPatientWhere),
      assignedPatientWhere: jest.fn(assignedPatientWhere),
      assignmentWhere: jest.fn(assignmentWhere),
    };
    service = new SessionNotesService(
      prisma as unknown as PrismaService,
      clinicalPolicy as unknown as ClinicalAccessPolicyService,
    );
  });

  it('lists only notes attached to assigned case files in the active tenant', async () => {
    prisma.sessionNote.findMany.mockResolvedValue([]);

    await service.findAll(scope);

    expect(clinicalPolicy.requireCapability).toHaveBeenCalledWith(
      scope,
      OrganizationCapability.SESSION_NOTE_READ,
      'session_notes.find_all',
    );
    expect(prisma.sessionNote.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: scope.organizationId,
        caseFile: {
          organizationId: scope.organizationId,
          patient: assignedPatientWhere(scope),
        },
      },
      orderBy: { sessionDate: 'desc' },
    });
  });

  it('creates with server-side organizationId and authorId after assignment', async () => {
    const sessionDate = new Date('2026-01-01T00:00:00.000Z');
    prisma.caseFile.findFirst.mockResolvedValue({
      id: 'case-file-id',
      patientId: 'patient-a-id',
    });
    prisma.patientAssignment.findFirst.mockResolvedValue({
      id: 'assignment-id',
    });
    prisma.sessionNote.create.mockResolvedValue({ id: 'note-id' });

    await service.create(
      {
        caseFileId: 'case-file-id',
        authorId: 'attacker-id',
        organizationId: 'organization-b-id',
        content: 'Clinical content',
        sessionDate,
      } as never,
      scope,
    );

    expect(prisma.caseFile.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'case-file-id',
        organizationId: scope.organizationId,
        patient: tenantPatientWhere(scope),
      },
      select: { id: true, patientId: true },
    });
    expect(prisma.sessionNote.create).toHaveBeenCalledWith({
      data: {
        caseFileId: 'case-file-id',
        content: 'Clinical content',
        sessionDate,
        organizationId: scope.organizationId,
        authorId: scope.userId,
      },
    });
  });

  it('returns redacted 404 for cross-tenant direct note access before capability checks', async () => {
    prisma.sessionNote.findFirst.mockResolvedValue(null);

    await expect(service.findOne('note-b-id', scope)).rejects.toEqual(
      new NotFoundException('Session note not found'),
    );
    expect(clinicalPolicy.requireCapability).not.toHaveBeenCalled();
  });

  it('returns 403 when a visible note lacks active assignment', async () => {
    prisma.sessionNote.findFirst.mockResolvedValue(noteWithRelation());
    prisma.patientAssignment.findFirst.mockResolvedValue(null);

    await expect(service.findOne('note-id', scope)).rejects.toEqual(
      new ForbiddenException('Clinical assignment is required'),
    );
  });

  it('updates only scoped and assigned notes and strips server fields', async () => {
    prisma.sessionNote.findFirst
      .mockResolvedValueOnce(noteWithRelation())
      .mockResolvedValueOnce({ id: 'note-id', title: 'Updated' });
    prisma.patientAssignment.findFirst.mockResolvedValue({
      id: 'assignment-id',
    });
    prisma.sessionNote.updateMany.mockResolvedValue({ count: 1 });

    await service.update(
      'note-id',
      {
        title: 'Updated',
        authorId: 'attacker-id',
        organizationId: 'organization-b-id',
      } as never,
      scope,
    );

    expect(prisma.sessionNote.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'note-id',
        organizationId: scope.organizationId,
        caseFile: {
          organizationId: scope.organizationId,
          patient: assignedPatientWhere(scope),
        },
      },
      data: { title: 'Updated' },
    });
  });

  it('deletes by organizationId and assignment and returns metadata only', async () => {
    prisma.sessionNote.findFirst.mockResolvedValue(noteWithRelation());
    prisma.patientAssignment.findFirst.mockResolvedValue({
      id: 'assignment-id',
    });
    prisma.sessionNote.deleteMany.mockResolvedValue({ count: 1 });

    await expect(service.remove('note-id', scope)).resolves.toEqual({
      id: 'note-id',
      caseFileId: 'case-file-id',
      organizationId: scope.organizationId,
      authorId: scope.userId,
      content: 'Clinical content',
    });
    expect(prisma.sessionNote.deleteMany).toHaveBeenCalledWith({
      where: {
        id: 'note-id',
        organizationId: scope.organizationId,
        caseFile: {
          organizationId: scope.organizationId,
          patient: assignedPatientWhere(scope),
        },
      },
    });
  });

  describe('getPdfData', () => {
    it('delegates to CaseFilesService when available and assigned', async () => {
      const mockCaseFilesService = {
        getClinicalPdfData: jest.fn().mockResolvedValue({
          documentType: 'NOM_004_EVOLUTION_NOTE',
          patient: { fullName: 'Juan Pérez' },
        }),
      };
      const customService = new SessionNotesService(
        prisma as unknown as PrismaService,
        clinicalPolicy as unknown as ClinicalAccessPolicyService,
        mockCaseFilesService as any,
      );

      prisma.sessionNote.findFirst.mockResolvedValue(noteWithRelation());
      prisma.patientAssignment.findFirst.mockResolvedValue({ id: 'assignment-id' });

      const result = await customService.getPdfData('note-id', scope);

      expect(mockCaseFilesService.getClinicalPdfData).toHaveBeenCalledWith(
        'case-file-id',
        scope,
        'note-id',
      );
      expect(result.documentType).toBe('NOM_004_EVOLUTION_NOTE');
    });
  });
});

function noteWithRelation() {
  return {
    id: 'note-id',
    caseFileId: 'case-file-id',
    organizationId: scope.organizationId,
    authorId: scope.userId,
    content: 'Clinical content',
    caseFile: { patientId: 'patient-a-id' },
  };
}

function tenantPatientWhere(activeScope: ClinicalAccessScope) {
  return {
    organizationId: activeScope.organizationId,
    psychologistId: activeScope.userId,
  };
}

function assignmentWhere(activeScope: ClinicalAccessScope) {
  return {
    organizationId: activeScope.organizationId,
    membershipId: activeScope.membershipId,
    status: PatientAssignmentStatus.ACTIVE,
    membership: {
      organizationId: activeScope.organizationId,
      userId: activeScope.userId,
      status: MembershipStatus.ACTIVE,
      organization: { status: OrganizationStatus.ACTIVE },
    },
  };
}

function assignedPatientWhere(activeScope: ClinicalAccessScope) {
  return {
    ...tenantPatientWhere(activeScope),
    assignments: { some: assignmentWhere(activeScope) },
  };
}
