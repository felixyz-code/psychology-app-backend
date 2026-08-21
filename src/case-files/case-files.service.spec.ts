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
  user: { findUnique: jest.Mock };
  organization: { findUnique: jest.Mock };
  sessionNote: { findFirst: jest.Mock };
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
      user: { findUnique: jest.fn() },
      organization: { findUnique: jest.fn() },
      sessionNote: { findFirst: jest.fn() },
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

  describe('getClinicalPdfData & getConsentPdfData', () => {
    const mockCaseFile = {
      id: 'case-file-1',
      patientId: 'patient-1',
      diagnosis: 'F41.1 Trastorno de ansiedad generalizada',
      treatmentPlan: 'Terapia cognitivo-conductual 12 sesiones',
      createdAt: new Date('2026-01-10T10:00:00Z'),
      updatedAt: new Date('2026-01-15T10:00:00Z'),
      patient: {
        id: 'patient-1',
        firstName: 'Juan',
        lastName: 'Pérez',
        birthDate: new Date('1990-05-15T00:00:00Z'),
        phoneNumber: '5551234567',
        email: 'juan.perez@example.com',
        psychologistId: 'psychologist-a-id',
        appointments: [
          {
            id: 'appt-1',
            scheduledAt: new Date('2026-02-01T16:00:00Z'),
            durationMinutes: 50,
            notes: 'Sesión inicial',
          },
        ],
      },
    };

    const mockTherapist = {
      id: 'psychologist-a-id',
      name: 'Dra. María Psicóloga',
      email: 'dra.maria@clinica.com',
      psychologistProfile: {
        professionalName: 'Dra. María Elena Ramos',
        licenseNumber: 'CED-1234567',
        specialties: ['Psicología Clínica', 'Terapia Breve'],
        phone: '5559876543',
        signatureAsset: null,
      },
    };

    const mockOrganization = {
      id: 'organization-a-id',
      legalName: 'Psicología Integral S.A. de C.V.',
      displayName: 'Centro PsiqueOS',
      tradeName: 'PsiqueOS Polanco',
      taxId: 'PSI123456ABC',
      phone: '5550001122',
      email: 'contacto@psiqueos.com',
      address: 'Av. Paseo de la Reforma 100, CDMX',
      branding: {
        primaryColor: '#1976d2',
        accentColor: '#42a5f5',
      },
      logoAsset: null,
    };

    it('compiles clinical pdf export payload for a case file note', async () => {
      prisma.caseFile.findFirst.mockResolvedValue(mockCaseFile);
      prisma.patientAssignment.findFirst.mockResolvedValue({ id: 'assign-1' });
      prisma.sessionNote.findFirst.mockResolvedValue({
        id: 'note-1',
        sessionDate: new Date('2026-02-01T16:00:00Z'),
        title: 'Sesión 1 - Evaluación',
        content: 'Paciente refiere síntomas de ansiedad.',
        authorId: 'psychologist-a-id',
        createdAt: new Date('2026-02-01T17:00:00Z'),
        updatedAt: new Date('2026-02-01T17:00:00Z'),
      });
      prisma.user.findUnique.mockResolvedValue(mockTherapist);
      prisma.organization.findUnique.mockResolvedValue(mockOrganization);

      const result = await service.getClinicalPdfData(
        'case-file-1',
        scope,
        'note-1',
      );

      expect(result.documentType).toBe('NOM_004_EVOLUTION_NOTE');
      expect(result.patient.fullName).toBe('Juan Pérez');
      expect(result.patient.age).toBeGreaterThan(0);
      expect(result.therapist.professionalName).toBe('Dra. María Elena Ramos');
      expect(result.therapist.licenseNumber).toBe('CED-1234567');
      expect(result.tenant.displayName).toBe('Centro PsiqueOS');
      expect(result.sessionNote?.content).toBe(
        'Paciente refiere síntomas de ansiedad.',
      );
      expect(result.appointment?.id).toBe('appt-1');
    });

    it('compiles informed consent export payload', async () => {
      prisma.caseFile.findFirst.mockResolvedValue(mockCaseFile);
      prisma.patientAssignment.findFirst.mockResolvedValue({ id: 'assign-1' });
      prisma.user.findUnique.mockResolvedValue(mockTherapist);
      prisma.organization.findUnique.mockResolvedValue(mockOrganization);

      const result = await service.getConsentPdfData('case-file-1', scope);

      expect(result.documentType).toBe('INFORMED_CONSENT');
      expect(result.caseFile.id).toBe('case-file-1');
      expect(result.patient.id).toBe('patient-1');
      expect(result.therapist.id).toBe('psychologist-a-id');
    });
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
