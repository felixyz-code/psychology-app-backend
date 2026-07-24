import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AppointmentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ClinicalAccessPolicyService } from '../tenant-context/clinical-access-policy.service';
import type { ClinicalAccessScope } from '../tenant-context/clinical-access.types';
import { OrganizationCapability } from '../tenant-context/authorization/organization-capability';
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
}
