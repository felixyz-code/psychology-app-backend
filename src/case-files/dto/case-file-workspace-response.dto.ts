import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AppointmentStatus } from '@prisma/client';

export enum CaseFileWorkspaceTimelineEventType {
  CASE_FILE_CREATED = 'CASE_FILE_CREATED',
  APPOINTMENT_COMPLETED = 'APPOINTMENT_COMPLETED',
  SESSION_NOTE_CREATED = 'SESSION_NOTE_CREATED',
  DOCUMENT_UPLOADED = 'DOCUMENT_UPLOADED',
}

export enum CaseFileWorkspaceTimelineSourceType {
  CASE_FILE = 'CASE_FILE',
  APPOINTMENT = 'APPOINTMENT',
  SESSION_NOTE = 'SESSION_NOTE',
  DOCUMENT = 'DOCUMENT',
}

export class CaseFileWorkspaceCaseFileDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  patientId: string;

  @ApiPropertyOptional({ nullable: true })
  diagnosis: string | null;

  @ApiPropertyOptional({ nullable: true })
  treatmentPlan: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: Date;
}

export class CaseFileWorkspacePatientDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;

  @ApiPropertyOptional({ nullable: true })
  email: string | null;

  @ApiPropertyOptional({ nullable: true })
  phoneNumber: string | null;

  @ApiPropertyOptional({ type: String, format: 'date', nullable: true })
  birthDate: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: Date;
}

export class CaseFileWorkspaceSummaryDto {
  @ApiProperty()
  appointmentsCount: number;

  @ApiProperty()
  sessionNotesCount: number;

  @ApiProperty()
  documentsCount: number;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  lastActivityAt: Date | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  nextAppointmentAt: Date | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  lastAppointmentAt: Date | null;
}

export class CaseFileWorkspaceAppointmentDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  patientId: string;

  @ApiProperty({ format: 'uuid' })
  psychologistId: string;

  @ApiProperty({ type: String, format: 'date-time' })
  scheduledAt: Date;

  @ApiProperty()
  durationMinutes: number;

  @ApiProperty({ enum: AppointmentStatus })
  status: AppointmentStatus;

  @ApiPropertyOptional({ nullable: true })
  notes: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: Date;
}

export class CaseFileWorkspaceSessionNoteDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  caseFileId: string;

  @ApiProperty({ format: 'uuid' })
  authorId: string;

  @ApiProperty({ type: String, format: 'date-time' })
  sessionDate: Date;

  @ApiPropertyOptional({ nullable: true })
  title: string | null;

  @ApiProperty()
  content: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: Date;
}

export class CaseFileWorkspaceDocumentDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  caseFileId: string;

  @ApiProperty({ format: 'uuid' })
  uploadedById: string;

  @ApiProperty()
  fileName: string;

  @ApiProperty()
  filePath: string;

  @ApiPropertyOptional({ nullable: true })
  mimeType: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  uploadedAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: Date;
}

export class CaseFileWorkspaceTimelineItemDto {
  @ApiProperty({
    example: 'session-note-created-550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @ApiProperty({ enum: CaseFileWorkspaceTimelineEventType })
  type: CaseFileWorkspaceTimelineEventType;

  @ApiProperty()
  title: string;

  @ApiPropertyOptional({ nullable: true })
  description: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  occurredAt: Date;

  @ApiProperty({ format: 'uuid' })
  sourceId: string;

  @ApiProperty({ enum: CaseFileWorkspaceTimelineSourceType })
  sourceType: CaseFileWorkspaceTimelineSourceType;
}

export class CaseFileWorkspaceResponseDto {
  @ApiProperty({ type: CaseFileWorkspaceCaseFileDto })
  caseFile: CaseFileWorkspaceCaseFileDto;

  @ApiProperty({ type: CaseFileWorkspacePatientDto })
  patient: CaseFileWorkspacePatientDto;

  @ApiProperty({ type: CaseFileWorkspaceSummaryDto })
  summary: CaseFileWorkspaceSummaryDto;

  @ApiProperty({ type: [CaseFileWorkspaceAppointmentDto] })
  appointments: CaseFileWorkspaceAppointmentDto[];

  @ApiProperty({ type: [CaseFileWorkspaceSessionNoteDto] })
  sessionNotes: CaseFileWorkspaceSessionNoteDto[];

  @ApiProperty({ type: [CaseFileWorkspaceDocumentDto] })
  documents: CaseFileWorkspaceDocumentDto[];

  @ApiProperty({ type: [CaseFileWorkspaceTimelineItemDto] })
  timeline: CaseFileWorkspaceTimelineItemDto[];
}
