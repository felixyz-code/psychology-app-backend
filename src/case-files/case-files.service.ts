import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AppointmentStatus, Prisma, UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PrismaService } from '../prisma/prisma.service';
import {
  CaseFileWorkspaceTimelineEventType,
  CaseFileWorkspaceTimelineSourceType,
} from './dto/case-file-workspace-response.dto';
import { CreateCaseFileDto } from './dto/create-case-file.dto';
import { UpdateCaseFileDto } from './dto/update-case-file.dto';

const caseFileWorkspaceSelect = {
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

type CaseFileWorkspaceData = Prisma.CaseFileGetPayload<{
  select: typeof caseFileWorkspaceSelect;
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
  constructor(private readonly prisma: PrismaService) {}

  async create(createCaseFileDto: CreateCaseFileDto, user: AuthenticatedUser) {
    await this.getAccessiblePatientOrThrow(createCaseFileDto.patientId, user);

    const existingCaseFile = await this.prisma.caseFile.findUnique({
      where: { patientId: createCaseFileDto.patientId },
    });

    if (existingCaseFile) {
      throw new ConflictException(
        `Patient with id "${createCaseFileDto.patientId}" already has a case file`,
      );
    }

    return this.prisma.caseFile.create({
      data: createCaseFileDto,
    });
  }

  findAll(user: AuthenticatedUser) {
    return this.prisma.caseFile.findMany({
      where: this.isAdmin(user)
        ? undefined
        : {
            patient: {
              psychologistId: user.id,
            },
          },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const caseFile = await this.getAccessibleCaseFileOrThrow(id, user);

    return caseFile;
  }

  async findWorkspace(id: string, user: AuthenticatedUser) {
    const workspaceData = await this.getAccessibleCaseFileWorkspaceOrThrow(
      id,
      user,
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

  async findByPatientId(patientId: string, user: AuthenticatedUser) {
    await this.getAccessiblePatientOrThrow(patientId, user);

    const caseFile = await this.prisma.caseFile.findUnique({
      where: { patientId },
    });

    if (!caseFile) {
      throw new NotFoundException(
        `Case file for patient with id "${patientId}" not found`,
      );
    }

    return caseFile;
  }

  async update(
    id: string,
    updateCaseFileDto: UpdateCaseFileDto,
    user: AuthenticatedUser,
  ) {
    await this.getAccessibleCaseFileOrThrow(id, user);

    return this.prisma.caseFile.update({
      where: { id },
      data: updateCaseFileDto,
    });
  }

  private isAdmin(user: AuthenticatedUser) {
    return user.role === UserRole.ADMIN;
  }

  private async getAccessiblePatientOrThrow(
    patientId: string,
    user: AuthenticatedUser,
  ) {
    const patient = this.isAdmin(user)
      ? await this.prisma.patient.findUnique({ where: { id: patientId } })
      : await this.prisma.patient.findFirst({
          where: {
            id: patientId,
            psychologistId: user.id,
          },
        });

    if (!patient) {
      throw new NotFoundException(`Patient with id "${patientId}" not found`);
    }

    return patient;
  }

  private async getAccessibleCaseFileOrThrow(
    id: string,
    user: AuthenticatedUser,
  ) {
    const caseFile = this.isAdmin(user)
      ? await this.prisma.caseFile.findUnique({ where: { id } })
      : await this.prisma.caseFile.findFirst({
          where: {
            id,
            patient: {
              psychologistId: user.id,
            },
          },
        });

    if (!caseFile) {
      throw new NotFoundException(`Case file with id "${id}" not found`);
    }

    return caseFile;
  }

  private async getAccessibleCaseFileWorkspaceOrThrow(
    id: string,
    user: AuthenticatedUser,
  ) {
    const caseFile = this.isAdmin(user)
      ? await this.prisma.caseFile.findUnique({
          where: { id },
          select: caseFileWorkspaceSelect,
        })
      : await this.prisma.caseFile.findFirst({
          where: {
            id,
            patient: {
              psychologistId: user.id,
            },
          },
          select: caseFileWorkspaceSelect,
        });

    if (!caseFile) {
      throw new NotFoundException(`Case file with id "${id}" not found`);
    }

    return caseFile;
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
