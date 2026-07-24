import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  AppointmentStatus,
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
import { CaseFilesService } from './case-files.service';
import { CaseFileWorkspaceTimelineEventType } from './dto/case-file-workspace-response.dto';

type PrismaMock = {
  caseFile: {
    create: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    updateMany: jest.Mock;
  };
  patient: { findFirst: jest.Mock };
  patientAssignment: { findFirst: jest.Mock };
};

const scope: ClinicalAccessScope = {
  organizationId: 'organization-a-id',
  membershipId: 'membership-a-id',
  organizationRole: MembershipRole.PSYCHOLOGIST,
  userId: 'psychologist-a-id',
  legacyUserRole: UserRole.PSYCHOLOGIST,
  resolutionMode: TenantResolutionMode.EXPLICIT,
};

describe('CaseFilesService D2 tenant-aware policy', () => {
  let service: CaseFilesService;
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
      caseFile: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
      patient: { findFirst: jest.fn() },
      patientAssignment: { findFirst: jest.fn() },
    };
    clinicalPolicy = {
      requireCapability: jest.fn(),
      tenantPatientWhere: jest.fn(tenantPatientWhere),
      assignedPatientWhere: jest.fn(assignedPatientWhere),
      assignmentWhere: jest.fn(assignmentWhere),
    };
    service = new CaseFilesService(
      prisma as unknown as PrismaService,
      clinicalPolicy as unknown as ClinicalAccessPolicyService,
    );
  });

  it('lists only assigned case files inside the active tenant', async () => {
    prisma.caseFile.findMany.mockResolvedValue([]);

    await service.findAll(scope);

    expect(clinicalPolicy.requireCapability).toHaveBeenCalledWith(
      scope,
      OrganizationCapability.CASE_FILE_READ,
      'case_files.find_all',
    );
    expect(prisma.caseFile.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: scope.organizationId,
        patient: assignedPatientWhere(scope),
      },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('creates only for an assigned in-tenant patient and stamps organizationId', async () => {
    prisma.patient.findFirst.mockResolvedValue({ id: 'patient-a-id' });
    prisma.caseFile.findFirst.mockResolvedValue(null);
    prisma.caseFile.create.mockResolvedValue({ id: 'case-file-id' });

    await service.create({ patientId: 'patient-a-id' }, scope);

    expect(prisma.patient.findFirst).toHaveBeenCalledWith({
      where: { id: 'patient-a-id', ...assignedPatientWhere(scope) },
      select: { id: true },
    });
    expect(prisma.caseFile.create).toHaveBeenCalledWith({
      data: {
        patientId: 'patient-a-id',
        organizationId: scope.organizationId,
      },
    });
  });

  it('returns redacted 404 before capability checks for cross-tenant case files', async () => {
    prisma.caseFile.findFirst.mockResolvedValue(null);

    await expect(service.findOne('case-file-b-id', scope)).rejects.toEqual(
      new NotFoundException('Case file not found'),
    );
    expect(clinicalPolicy.requireCapability).not.toHaveBeenCalled();
  });

  it('returns 403 when a visible case file has no active assignment', async () => {
    prisma.caseFile.findFirst.mockResolvedValue({
      id: 'case-file-id',
      patientId: 'patient-a-id',
    });
    prisma.patientAssignment.findFirst.mockResolvedValue(null);

    await expect(service.findOne('case-file-id', scope)).rejects.toEqual(
      new ForbiddenException('Clinical assignment is required'),
    );
  });

  it('updates through organizationId and active assignment predicates', async () => {
    prisma.caseFile.findFirst
      .mockResolvedValueOnce({ id: 'case-file-id', patientId: 'patient-a-id' })
      .mockResolvedValueOnce({ id: 'case-file-id', diagnosis: 'Updated' });
    prisma.patientAssignment.findFirst.mockResolvedValue({
      id: 'assignment-id',
    });
    prisma.caseFile.updateMany.mockResolvedValue({ count: 1 });

    await service.update('case-file-id', { diagnosis: 'Updated' }, scope);

    expect(prisma.caseFile.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'case-file-id',
        organizationId: scope.organizationId,
        patient: assignedPatientWhere(scope),
      },
      data: { diagnosis: 'Updated' },
    });
  });

  it('scopes workspace relations and builds the tenant-local timeline', async () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const appointmentAt = new Date('2026-01-02T00:00:00.000Z');
    const noteAt = new Date('2026-01-03T00:00:00.000Z');
    const documentAt = new Date('2026-01-04T00:00:00.000Z');
    prisma.caseFile.findFirst
      .mockResolvedValueOnce({ id: 'case-file-id', patientId: 'patient-a-id' })
      .mockResolvedValueOnce({
        id: 'case-file-id',
        patientId: 'patient-a-id',
        diagnosis: null,
        treatmentPlan: null,
        createdAt,
        updatedAt: createdAt,
        patient: {
          id: 'patient-a-id',
          firstName: 'Ana',
          lastName: 'Martinez',
          email: null,
          phoneNumber: null,
          birthDate: null,
          createdAt,
          updatedAt: createdAt,
          appointments: [
            {
              id: 'appointment-id',
              patientId: 'patient-a-id',
              psychologistId: scope.userId,
              scheduledAt: appointmentAt,
              durationMinutes: 50,
              status: AppointmentStatus.COMPLETED,
              notes: 'Completed',
              createdAt,
              updatedAt: createdAt,
            },
          ],
        },
        sessionNotes: [
          {
            id: 'note-id',
            caseFileId: 'case-file-id',
            authorId: scope.userId,
            sessionDate: noteAt,
            title: 'Session',
            content: 'Content',
            createdAt,
            updatedAt: createdAt,
          },
        ],
        documents: [
          {
            id: 'document-id',
            caseFileId: 'case-file-id',
            uploadedById: scope.userId,
            fileName: 'consent.pdf',
            filePath: 'uploads/patients/patient-a-id/consent.pdf',
            mimeType: 'application/pdf',
            uploadedAt: documentAt,
            updatedAt: createdAt,
          },
        ],
      });
    prisma.patientAssignment.findFirst.mockResolvedValue({
      id: 'assignment-id',
    });

    const result = await service.findWorkspace('case-file-id', scope);

    expect(prisma.caseFile.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          id: 'case-file-id',
          organizationId: scope.organizationId,
          patient: assignedPatientWhere(scope),
        },
      }),
    );
    const caseFileFindFirstCalls = prisma.caseFile.findFirst.mock
      .calls as Array<[unknown]>;
    const workspaceQuery = caseFileFindFirstCalls.at(-1)?.[0] as
      | {
          select: {
            patient: { select: { appointments: { where: object } } };
            sessionNotes: { where: object };
            documents: { where: object };
          };
        }
      | undefined;
    expect(workspaceQuery?.select.patient.select.appointments.where).toEqual({
      organizationId: scope.organizationId,
    });
    expect(workspaceQuery?.select.sessionNotes.where).toEqual({
      organizationId: scope.organizationId,
    });
    expect(workspaceQuery?.select.documents.where).toEqual({
      organizationId: scope.organizationId,
    });
    expect(result.summary).toMatchObject({
      appointmentsCount: 1,
      sessionNotesCount: 1,
      documentsCount: 1,
      lastActivityAt: documentAt,
      lastAppointmentAt: appointmentAt,
    });
    expect(result.timeline.map((event) => event.type)).toEqual([
      CaseFileWorkspaceTimelineEventType.DOCUMENT_UPLOADED,
      CaseFileWorkspaceTimelineEventType.SESSION_NOTE_CREATED,
      CaseFileWorkspaceTimelineEventType.APPOINTMENT_COMPLETED,
      CaseFileWorkspaceTimelineEventType.CASE_FILE_CREATED,
    ]);
  });
});

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
