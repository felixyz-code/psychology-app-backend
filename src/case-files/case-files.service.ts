import { existsSync, promises as fs } from 'node:fs';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { AppointmentStatus, Prisma } from '@prisma/client';
import { OrganizationLogoStorageService } from '../organization-logo-assets/organization-logo-storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { ClinicalAccessPolicyService } from '../tenant-context/clinical-access-policy.service';
import type { ClinicalAccessScope } from '../tenant-context/clinical-access.types';
import { OrganizationCapability } from '../tenant-context/authorization/organization-capability';
import { UserProfileStorageService } from '../user-profile/user-profile-storage.service';
import {
  ClinicalDocumentType,
  ClinicalPdfExportPayloadDto,
} from './dto/clinical-pdf-data.dto';
import {
  CaseFileWorkspaceTimelineEventType,
  CaseFileWorkspaceTimelineSourceType,
} from './dto/case-file-workspace-response.dto';
import { CreateCaseFileDto } from './dto/create-case-file.dto';
import { UpdateCaseFileDto } from './dto/update-case-file.dto';

const baseWorkspaceSelect = {
  id: true,
  patientId: true,
  diagnosis: true,
  treatmentPlan: true,
  createdAt: true,
  updatedAt: true,
  patient: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phoneNumber: true,
      birthDate: true,
      createdAt: true,
      updatedAt: true,
      appointments: {
        select: {
          id: true,
          patientId: true,
          psychologistId: true,
          scheduledAt: true,
          durationMinutes: true,
          status: true,
          notes: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: {
          scheduledAt: 'desc',
        },
      },
    },
  },
  sessionNotes: {
    select: {
      id: true,
      caseFileId: true,
      authorId: true,
      sessionDate: true,
      title: true,
      content: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: {
      sessionDate: 'desc',
    },
  },
  documents: {
    select: {
      id: true,
      caseFileId: true,
      uploadedById: true,
      fileName: true,
      filePath: true,
      mimeType: true,
      uploadedAt: true,
      updatedAt: true,
    },
    orderBy: {
      uploadedAt: 'desc',
    },
  },
} satisfies Prisma.CaseFileSelect;

function tenantWorkspaceSelect(organizationId: string) {
  return {
    ...baseWorkspaceSelect,
    patient: {
      select: {
        ...baseWorkspaceSelect.patient.select,
        appointments: {
          ...baseWorkspaceSelect.patient.select.appointments,
          where: { organizationId },
        },
      },
    },
    sessionNotes: {
      ...baseWorkspaceSelect.sessionNotes,
      where: { organizationId },
    },
    documents: {
      ...baseWorkspaceSelect.documents,
      where: { organizationId },
    },
  };
}

type CaseFileWorkspaceData = Prisma.CaseFileGetPayload<{
  select: typeof baseWorkspaceSelect;
}>;

type CaseFileWorkspaceTimelineItem = {
  id: string;
  type: CaseFileWorkspaceTimelineEventType;
  title: string;
  description: string | null;
  occurredAt: Date;
  sourceId: string;
  sourceType: CaseFileWorkspaceTimelineSourceType;
};

@Injectable()
export class CaseFilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clinicalPolicy: ClinicalAccessPolicyService,
    @Optional()
    private readonly userProfileStorage?: UserProfileStorageService,
    @Optional()
    private readonly organizationLogoStorage?: OrganizationLogoStorageService,
  ) {}

  async create(
    createCaseFileDto: CreateCaseFileDto,
    scope: ClinicalAccessScope,
  ) {
    this.clinicalPolicy.requireCapability(
      scope,
      OrganizationCapability.CASE_FILE_CREATE,
      'case_files.create',
    );
    await this.getAssignedPatientOrThrow(createCaseFileDto.patientId, scope);

    const existingCaseFile = await this.prisma.caseFile.findFirst({
      where: {
        patientId: createCaseFileDto.patientId,
        organizationId: scope.organizationId,
      },
      select: { id: true },
    });

    if (existingCaseFile) {
      throw new ConflictException('Patient already has a case file');
    }

    return this.prisma.caseFile.create({
      data: {
        ...createCaseFileDto,
        organizationId: scope.organizationId,
      },
    });
  }

  findAll(scope: ClinicalAccessScope) {
    this.clinicalPolicy.requireCapability(
      scope,
      OrganizationCapability.CASE_FILE_READ,
      'case_files.find_all',
    );

    return this.prisma.caseFile.findMany({
      where: {
        organizationId: scope.organizationId,
        patient: this.clinicalPolicy.assignedPatientWhere(scope),
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string, scope: ClinicalAccessScope) {
    const caseFile = await this.getVisibleCaseFileOrThrow(id, scope);
    this.clinicalPolicy.requireCapability(
      scope,
      OrganizationCapability.CASE_FILE_READ,
      'case_files.find_one',
    );
    await this.requireAssignment(caseFile.patientId, scope);

    return caseFile;
  }

  async findWorkspace(id: string, scope: ClinicalAccessScope) {
    const visibleCaseFile = await this.getVisibleCaseFileOrThrow(id, scope);
    this.clinicalPolicy.requireCapability(
      scope,
      OrganizationCapability.WORKSPACE_READ,
      'case_files.workspace',
    );
    await this.requireAssignment(visibleCaseFile.patientId, scope);

    const workspaceData = await this.getAssignedCaseFileWorkspaceOrThrow(
      id,
      scope,
    );
    const {
      patient: patientWithAppointments,
      sessionNotes,
      documents,
      ...caseFile
    } = workspaceData;
    const { appointments, ...patient } = patientWithAppointments;
    const timeline = this.buildWorkspaceTimeline(workspaceData);
    const now = new Date();
    const nextAppointment =
      appointments
        .filter(
          (appointment) =>
            appointment.status === AppointmentStatus.SCHEDULED &&
            appointment.scheduledAt > now,
        )
        .sort(
          (left, right) =>
            left.scheduledAt.getTime() - right.scheduledAt.getTime(),
        )[0] ?? null;
    const lastAppointment =
      appointments
        .filter(
          (appointment) =>
            appointment.status === AppointmentStatus.COMPLETED &&
            appointment.scheduledAt <= now,
        )
        .sort(
          (left, right) =>
            right.scheduledAt.getTime() - left.scheduledAt.getTime(),
        )[0] ?? null;

    return {
      caseFile,
      patient,
      summary: {
        appointmentsCount: appointments.length,
        sessionNotesCount: sessionNotes.length,
        documentsCount: documents.length,
        lastActivityAt: timeline[0]?.occurredAt ?? null,
        nextAppointmentAt: nextAppointment?.scheduledAt ?? null,
        lastAppointmentAt: lastAppointment?.scheduledAt ?? null,
      },
      appointments,
      sessionNotes,
      documents,
      timeline,
    };
  }

  async findByPatientId(patientId: string, scope: ClinicalAccessScope) {
    this.clinicalPolicy.requireCapability(
      scope,
      OrganizationCapability.CASE_FILE_READ,
      'case_files.find_by_patient',
    );
    await this.getAssignedPatientOrThrow(patientId, scope);

    const caseFile = await this.prisma.caseFile.findFirst({
      where: {
        patientId,
        organizationId: scope.organizationId,
      },
    });

    if (!caseFile) {
      throw this.caseFileNotFound();
    }

    return caseFile;
  }

  async update(
    id: string,
    updateCaseFileDto: UpdateCaseFileDto,
    scope: ClinicalAccessScope,
  ) {
    const caseFile = await this.getVisibleCaseFileOrThrow(id, scope);
    this.clinicalPolicy.requireCapability(
      scope,
      OrganizationCapability.CASE_FILE_UPDATE,
      'case_files.update',
    );
    await this.requireAssignment(caseFile.patientId, scope);

    const result = await this.prisma.caseFile.updateMany({
      where: {
        id,
        organizationId: scope.organizationId,
        patient: this.clinicalPolicy.assignedPatientWhere(scope),
      },
      data: updateCaseFileDto,
    });

    if (result.count !== 1) {
      throw this.caseFileNotFound();
    }

    return this.getAssignedCaseFileOrThrow(id, scope);
  }

  private async getAssignedPatientOrThrow(
    patientId: string,
    scope: ClinicalAccessScope,
  ) {
    const patient = await this.prisma.patient.findFirst({
      where: {
        id: patientId,
        ...this.clinicalPolicy.assignedPatientWhere(scope),
      },
      select: { id: true },
    });

    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    return patient;
  }

  private async getVisibleCaseFileOrThrow(
    id: string,
    scope: ClinicalAccessScope,
  ) {
    const caseFile = await this.prisma.caseFile.findFirst({
      where: {
        id,
        organizationId: scope.organizationId,
        patient: this.clinicalPolicy.tenantPatientWhere(scope),
      },
    });

    if (!caseFile) {
      throw this.caseFileNotFound();
    }

    return caseFile;
  }

  private async getAssignedCaseFileOrThrow(
    id: string,
    scope: ClinicalAccessScope,
  ) {
    const caseFile = await this.prisma.caseFile.findFirst({
      where: {
        id,
        organizationId: scope.organizationId,
        patient: this.clinicalPolicy.assignedPatientWhere(scope),
      },
    });

    if (!caseFile) {
      throw this.caseFileNotFound();
    }

    return caseFile;
  }

  private async getAssignedCaseFileWorkspaceOrThrow(
    id: string,
    scope: ClinicalAccessScope,
  ) {
    const caseFile = await this.prisma.caseFile.findFirst({
      where: {
        id,
        organizationId: scope.organizationId,
        patient: this.clinicalPolicy.assignedPatientWhere(scope),
      },
      select: tenantWorkspaceSelect(scope.organizationId),
    });

    if (!caseFile) {
      throw this.caseFileNotFound();
    }

    return caseFile;
  }

  private async requireAssignment(
    patientId: string,
    scope: ClinicalAccessScope,
  ) {
    const assignment = await this.prisma.patientAssignment.findFirst({
      where: {
        ...this.clinicalPolicy.assignmentWhere(scope),
        patientId,
        patient: this.clinicalPolicy.tenantPatientWhere(scope),
      },
      select: { id: true },
    });

    if (!assignment) {
      throw new ForbiddenException('Clinical assignment is required');
    }
  }

  private caseFileNotFound() {
    return new NotFoundException('Case file not found');
  }

  private buildWorkspaceTimeline(
    workspaceData: CaseFileWorkspaceData,
  ): CaseFileWorkspaceTimelineItem[] {
    const timeline: CaseFileWorkspaceTimelineItem[] = [
      {
        id: `case-file-created-${workspaceData.id}`,
        type: CaseFileWorkspaceTimelineEventType.CASE_FILE_CREATED,
        title: 'Case file created',
        description: null,
        occurredAt: workspaceData.createdAt,
        sourceId: workspaceData.id,
        sourceType: CaseFileWorkspaceTimelineSourceType.CASE_FILE,
      },
    ];

    for (const appointment of workspaceData.patient.appointments) {
      if (appointment.status !== AppointmentStatus.COMPLETED) {
        continue;
      }

      timeline.push({
        id: `appointment-completed-${appointment.id}`,
        type: CaseFileWorkspaceTimelineEventType.APPOINTMENT_COMPLETED,
        title: 'Appointment completed',
        description: appointment.notes,
        occurredAt: appointment.scheduledAt,
        sourceId: appointment.id,
        sourceType: CaseFileWorkspaceTimelineSourceType.APPOINTMENT,
      });
    }

    for (const sessionNote of workspaceData.sessionNotes) {
      timeline.push({
        id: `session-note-created-${sessionNote.id}`,
        type: CaseFileWorkspaceTimelineEventType.SESSION_NOTE_CREATED,
        title: sessionNote.title ?? 'Session note created',
        description: sessionNote.title,
        occurredAt: sessionNote.sessionDate,
        sourceId: sessionNote.id,
        sourceType: CaseFileWorkspaceTimelineSourceType.SESSION_NOTE,
      });
    }

    for (const document of workspaceData.documents) {
      timeline.push({
        id: `document-uploaded-${document.id}`,
        type: CaseFileWorkspaceTimelineEventType.DOCUMENT_UPLOADED,
        title: document.fileName,
        description: document.mimeType,
        occurredAt: document.uploadedAt,
        sourceId: document.id,
        sourceType: CaseFileWorkspaceTimelineSourceType.DOCUMENT,
      });
    }

    return timeline.sort(
      (left, right) => right.occurredAt.getTime() - left.occurredAt.getTime(),
    );
  }

  async getClinicalPdfData(
    caseFileId: string,
    scope: ClinicalAccessScope,
    noteId?: string,
    documentType: ClinicalDocumentType = ClinicalDocumentType.NOM_004_EVOLUTION_NOTE,
  ): Promise<ClinicalPdfExportPayloadDto> {
    this.clinicalPolicy.requireCapability(
      scope,
      OrganizationCapability.CASE_FILE_READ,
      'case_files.pdf_data',
    );

    const caseFile = await this.prisma.caseFile.findFirst({
      where: {
        id: caseFileId,
        organizationId: scope.organizationId,
        patient: this.clinicalPolicy.tenantPatientWhere(scope),
      },
      include: {
        patient: {
          include: {
            psychologist: true,
            appointments: {
              where: { organizationId: scope.organizationId },
              orderBy: { scheduledAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    if (!caseFile) {
      throw this.caseFileNotFound();
    }

    await this.requireAssignment(caseFile.patientId, scope);

    let sessionNoteRecord: {
      id: string;
      sessionDate: Date;
      title: string | null;
      content: string;
      authorId: string;
      createdAt: Date;
      updatedAt: Date;
    } | null = null;
    let targetTherapistId = scope.userId;

    if (noteId) {
      const note = await this.prisma.sessionNote.findFirst({
        where: {
          id: noteId,
          caseFileId,
          organizationId: scope.organizationId,
        },
      });

      if (!note) {
        throw new NotFoundException('Session note not found');
      }

      sessionNoteRecord = note;
      targetTherapistId = note.authorId;
    } else if (caseFile.patient.psychologistId) {
      targetTherapistId = caseFile.patient.psychologistId;
    }

    // Retrieve therapist profile and signature asset
    const therapistUser = await this.prisma.user.findUnique({
      where: { id: targetTherapistId },
      include: {
        psychologistProfile: {
          include: {
            signatureAsset: true,
          },
        },
      },
    });

    let signatureDataUri: string | null = null;
    if (
      therapistUser?.psychologistProfile?.signatureAsset &&
      this.userProfileStorage
    ) {
      const sigAsset = therapistUser.psychologistProfile.signatureAsset;
      signatureDataUri = await this.loadAssetDataUri(
        () => this.userProfileStorage!.resolveSignaturePath(sigAsset.storageKey),
        sigAsset.mimeType,
      );
    }

    // Retrieve tenant details, branding and logo asset
    const organization = await this.prisma.organization.findUnique({
      where: { id: scope.organizationId },
      include: {
        branding: true,
        logoAsset: true,
      },
    });

    let logoDataUri: string | null = null;
    if (organization?.logoAsset && this.organizationLogoStorage) {
      const logoAsset = organization.logoAsset;
      logoDataUri = await this.loadAssetDataUri(
        () =>
          this.organizationLogoStorage!.resolveExistingFile(
            organization.id,
            logoAsset.storageKey,
          ),
        logoAsset.mimeType,
      );
    }

    const patient = caseFile.patient;
    const profile = therapistUser?.psychologistProfile;
    const latestAppointment = patient.appointments[0];

    const patientBirthDate = patient.birthDate
      ? new Date(patient.birthDate)
      : null;

    return {
      documentType,
      generatedAt: new Date().toISOString(),
      tenant: {
        organizationId: organization?.id ?? scope.organizationId,
        legalName: organization?.legalName ?? 'Centro Psicológico',
        displayName:
          organization?.displayName ??
          organization?.legalName ??
          'Clínica de Psicología',
        tradeName: organization?.tradeName ?? null,
        taxId: organization?.taxId ?? null,
        phone: organization?.phone ?? null,
        email: organization?.email ?? null,
        address: organization?.address ?? null,
        primaryColor: organization?.branding?.primaryColor ?? null,
        accentColor: organization?.branding?.accentColor ?? null,
        logoDataUri,
      },
      therapist: {
        id: therapistUser?.id ?? scope.userId,
        name: therapistUser?.name ?? 'Especialista',
        professionalName:
          profile?.professionalName ??
          therapistUser?.name ??
          'Especialista en Psicología',
        licenseNumber: profile?.licenseNumber ?? null,
        specialties: profile?.specialties ?? [],
        phone: profile?.phone ?? null,
        email: therapistUser?.email ?? null,
        signatureDataUri,
      },
      patient: {
        id: patient.id,
        fullName: `${patient.firstName} ${patient.lastName}`.trim(),
        firstName: patient.firstName,
        lastName: patient.lastName,
        birthDate: patient.birthDate
          ? patient.birthDate.toISOString().split('T')[0]
          : null,
        age: this.calculateAge(patientBirthDate),
        phoneNumber: patient.phoneNumber ?? null,
        email: patient.email ?? null,
      },
      caseFile: {
        id: caseFile.id,
        diagnosis: caseFile.diagnosis ?? null,
        treatmentPlan: caseFile.treatmentPlan ?? null,
        createdAt: caseFile.createdAt.toISOString(),
        updatedAt: caseFile.updatedAt.toISOString(),
      },
      sessionNote: sessionNoteRecord
        ? {
            id: sessionNoteRecord.id,
            sessionDate: sessionNoteRecord.sessionDate.toISOString(),
            title: sessionNoteRecord.title ?? null,
            content: sessionNoteRecord.content,
            createdAt: sessionNoteRecord.createdAt.toISOString(),
            updatedAt: sessionNoteRecord.updatedAt.toISOString(),
          }
        : null,
      appointment: latestAppointment
        ? {
            id: latestAppointment.id,
            scheduledAt: latestAppointment.scheduledAt.toISOString(),
            durationMinutes: latestAppointment.durationMinutes,
            notes: latestAppointment.notes ?? null,
          }
        : null,
    };
  }

  async getConsentPdfData(
    caseFileId: string,
    scope: ClinicalAccessScope,
  ): Promise<ClinicalPdfExportPayloadDto> {
    return this.getClinicalPdfData(
      caseFileId,
      scope,
      undefined,
      ClinicalDocumentType.INFORMED_CONSENT,
    );
  }

  private async loadAssetDataUri(
    resolver: () => Promise<string>,
    mimeType?: string,
  ): Promise<string | null> {
    try {
      const absolutePath = await resolver();
      if (!absolutePath || !existsSync(absolutePath)) {
        return null;
      }
      const buffer = await fs.readFile(absolutePath);
      const resolvedMime = mimeType || 'image/png';
      return `data:${resolvedMime};base64,${buffer.toString('base64')}`;
    } catch {
      return null;
    }
  }

  private calculateAge(birthDate: Date | null): number | null {
    if (!birthDate || Number.isNaN(birthDate.getTime())) {
      return null;
    }
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birthDate.getDate())
    ) {
      age--;
    }
    return age >= 0 ? age : null;
  }
}
