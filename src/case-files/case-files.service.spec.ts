import { NotFoundException } from '@nestjs/common';
import { AppointmentStatus, UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { CaseFilesService } from './case-files.service';
import { CaseFileWorkspaceTimelineEventType } from './dto/case-file-workspace-response.dto';

type PrismaMock = {
  caseFile: {
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  patient: {
    findFirst: jest.Mock;
    findUnique: jest.Mock;
  };
};

const psychologist: AuthenticatedUser = {
  id: 'psychologist-id',
  name: 'Psychologist',
  email: 'psychologist@example.com',
  role: UserRole.PSYCHOLOGIST,
};

const admin: AuthenticatedUser = {
  id: 'admin-id',
  name: 'Admin',
  email: 'admin@example.com',
  role: UserRole.ADMIN,
};

function daysFromNow(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

describe('CaseFilesService', () => {
  let service: CaseFilesService;
  let prisma: PrismaMock;

  beforeEach(() => {
    prisma = {
      caseFile: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      patient: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
      },
    };

    service = new CaseFilesService(prisma as unknown as PrismaService);
  });

  it('returns an accessible clinical workspace with summary and timeline', async () => {
    const caseFileCreatedAt = daysFromNow(-30);
    const completedAppointmentAt = daysFromNow(-10);
    const cancelledAppointmentAt = daysFromNow(-2);
    const futureAppointmentAt = daysFromNow(5);
    const sessionDate = daysFromNow(-3);
    const documentUploadedAt = daysFromNow(-1);
    const updatedAt = daysFromNow(-1);

    prisma.caseFile.findFirst.mockResolvedValue({
      id: 'case-file-id',
      patientId: 'patient-id',
      diagnosis: 'Diagnosis',
      treatmentPlan: 'Treatment plan',
      createdAt: caseFileCreatedAt,
      updatedAt,
      patient: {
        id: 'patient-id',
        firstName: 'Ana',
        lastName: 'Martinez',
        email: 'ana@example.com',
        phoneNumber: '+526621234567',
        birthDate: null,
        createdAt: caseFileCreatedAt,
        updatedAt,
        appointments: [
          {
            id: 'future-appointment-id',
            patientId: 'patient-id',
            psychologistId: psychologist.id,
            scheduledAt: futureAppointmentAt,
            durationMinutes: 50,
            status: AppointmentStatus.SCHEDULED,
            notes: 'Next appointment',
            createdAt: caseFileCreatedAt,
            updatedAt,
          },
          {
            id: 'cancelled-appointment-id',
            patientId: 'patient-id',
            psychologistId: psychologist.id,
            scheduledAt: cancelledAppointmentAt,
            durationMinutes: 50,
            status: AppointmentStatus.CANCELLED,
            notes: 'Cancelled appointment',
            createdAt: caseFileCreatedAt,
            updatedAt,
          },
          {
            id: 'completed-appointment-id',
            patientId: 'patient-id',
            psychologistId: psychologist.id,
            scheduledAt: completedAppointmentAt,
            durationMinutes: 50,
            status: AppointmentStatus.COMPLETED,
            notes: 'Completed appointment',
            createdAt: caseFileCreatedAt,
            updatedAt,
          },
        ],
      },
      sessionNotes: [
        {
          id: 'session-note-id',
          caseFileId: 'case-file-id',
          authorId: psychologist.id,
          sessionDate,
          title: 'Clinical session',
          content: 'Session content',
          createdAt: daysFromNow(-20),
          updatedAt,
        },
      ],
      documents: [
        {
          id: 'document-id',
          caseFileId: 'case-file-id',
          uploadedById: psychologist.id,
          fileName: 'consent.pdf',
          filePath: 'uploads/patients/patient-id/consent.pdf',
          mimeType: 'application/pdf',
          uploadedAt: documentUploadedAt,
          updatedAt,
        },
      ],
    });

    const result = await service.findWorkspace('case-file-id', psychologist);

    expect(prisma.caseFile.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'case-file-id',
          patient: {
            psychologistId: psychologist.id,
          },
        },
      }),
    );
    expect(result.caseFile).toEqual({
      id: 'case-file-id',
      patientId: 'patient-id',
      diagnosis: 'Diagnosis',
      treatmentPlan: 'Treatment plan',
      createdAt: caseFileCreatedAt,
      updatedAt,
    });
    expect(result.patient).toEqual({
      id: 'patient-id',
      firstName: 'Ana',
      lastName: 'Martinez',
      email: 'ana@example.com',
      phoneNumber: '+526621234567',
      birthDate: null,
      createdAt: caseFileCreatedAt,
      updatedAt,
    });
    expect(result.summary).toEqual({
      appointmentsCount: 3,
      sessionNotesCount: 1,
      documentsCount: 1,
      lastActivityAt: documentUploadedAt,
      nextAppointmentAt: futureAppointmentAt,
      lastAppointmentAt: completedAppointmentAt,
    });
    expect(result.timeline.map((event) => event.type)).toEqual([
      CaseFileWorkspaceTimelineEventType.DOCUMENT_UPLOADED,
      CaseFileWorkspaceTimelineEventType.SESSION_NOTE_CREATED,
      CaseFileWorkspaceTimelineEventType.APPOINTMENT_COMPLETED,
      CaseFileWorkspaceTimelineEventType.CASE_FILE_CREATED,
    ]);
  });

  it('returns 404 for an inaccessible psychologist workspace', async () => {
    prisma.caseFile.findFirst.mockResolvedValue(null);

    await expect(
      service.findWorkspace('foreign-case-file-id', psychologist),
    ).rejects.toThrow(NotFoundException);
  });

  it('uses admin-wide access for workspace lookup', async () => {
    prisma.caseFile.findUnique.mockResolvedValue({
      id: 'case-file-id',
      patientId: 'patient-id',
      diagnosis: null,
      treatmentPlan: null,
      createdAt: daysFromNow(-1),
      updatedAt: daysFromNow(-1),
      patient: {
        id: 'patient-id',
        firstName: 'Ana',
        lastName: 'Martinez',
        email: null,
        phoneNumber: null,
        birthDate: null,
        createdAt: daysFromNow(-1),
        updatedAt: daysFromNow(-1),
        appointments: [],
      },
      sessionNotes: [],
      documents: [],
    });

    await service.findWorkspace('case-file-id', admin);

    expect(prisma.caseFile.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'case-file-id' },
      }),
    );
    expect(prisma.caseFile.findFirst).not.toHaveBeenCalled();
  });

  it('prevents psychologist A from creating a case file for patient B', async () => {
    prisma.patient.findFirst.mockResolvedValue(null);

    await expect(
      service.create({ patientId: 'patient-b-id' }, psychologist),
    ).rejects.toThrow(NotFoundException);

    expect(prisma.patient.findFirst).toHaveBeenCalledWith({
      where: { id: 'patient-b-id', psychologistId: psychologist.id },
    });
    expect(prisma.caseFile.create).not.toHaveBeenCalled();
  });

  it('filters lists through the owning patient relation', async () => {
    prisma.caseFile.findMany.mockResolvedValue([]);

    await service.findAll(psychologist);

    expect(prisma.caseFile.findMany).toHaveBeenCalledWith({
      where: { patient: { psychologistId: psychologist.id } },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('returns 404 and does not update a case file B', async () => {
    prisma.caseFile.findFirst.mockResolvedValue(null);

    await expect(
      service.findOne('case-file-b-id', psychologist),
    ).rejects.toThrow(NotFoundException);
    await expect(
      service.update('case-file-b-id', { diagnosis: 'changed' }, psychologist),
    ).rejects.toThrow(NotFoundException);

    expect(prisma.caseFile.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'case-file-b-id',
        patient: { psychologistId: psychologist.id },
      },
    });
    expect(prisma.caseFile.update).not.toHaveBeenCalled();
  });

  it('validates patient ownership before resolving the case file by patient ID', async () => {
    prisma.patient.findFirst.mockResolvedValue(null);

    await expect(
      service.findByPatientId('patient-b-id', psychologist),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.caseFile.findUnique).not.toHaveBeenCalled();
  });
});
