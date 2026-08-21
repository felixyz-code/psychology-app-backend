import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum ClinicalDocumentType {
  NOM_004_EVOLUTION_NOTE = 'NOM_004_EVOLUTION_NOTE',
  THERAPEUTIC_PRESCRIPTION = 'THERAPEUTIC_PRESCRIPTION',
  INFORMED_CONSENT = 'INFORMED_CONSENT',
  CASE_FILE_SUMMARY = 'CASE_FILE_SUMMARY',
}

export class ClinicalDocumentTenantDto {
  @ApiProperty({ description: 'Organization ID', format: 'uuid' })
  organizationId!: string;

  @ApiProperty({ description: 'Legal name of the organization' })
  legalName!: string;

  @ApiProperty({ description: 'Display name of the organization' })
  displayName!: string;

  @ApiPropertyOptional({
    description: 'Trade name of the organization',
    nullable: true,
  })
  tradeName?: string | null;

  @ApiPropertyOptional({ description: 'Tax ID or RFC', nullable: true })
  taxId?: string | null;

  @ApiPropertyOptional({ description: 'Contact phone number', nullable: true })
  phone?: string | null;

  @ApiPropertyOptional({ description: 'Contact email address', nullable: true })
  email?: string | null;

  @ApiPropertyOptional({
    description: 'Physical address of the clinic',
    nullable: true,
  })
  address?: string | null;

  @ApiPropertyOptional({
    description: 'Primary brand color hex code',
    nullable: true,
  })
  primaryColor?: string | null;

  @ApiPropertyOptional({
    description: 'Accent brand color hex code',
    nullable: true,
  })
  accentColor?: string | null;

  @ApiPropertyOptional({
    description: 'Base64 data URI of the organization logo',
    nullable: true,
  })
  logoDataUri?: string | null;
}

export class ClinicalDocumentTherapistDto {
  @ApiProperty({ description: 'Therapist User ID', format: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'Account name of the therapist' })
  name!: string;

  @ApiProperty({ description: 'Professional full name with titles' })
  professionalName!: string;

  @ApiPropertyOptional({
    description: 'Professional license number (Cédula Profesional)',
    nullable: true,
  })
  licenseNumber?: string | null;

  @ApiProperty({ description: 'Clinical specialties', type: [String] })
  specialties!: string[];

  @ApiPropertyOptional({
    description: 'Therapist phone number',
    nullable: true,
  })
  phone?: string | null;

  @ApiPropertyOptional({
    description: 'Therapist email address',
    nullable: true,
  })
  email?: string | null;

  @ApiPropertyOptional({
    description: 'Base64 data URI of the digitalized signature asset',
    nullable: true,
  })
  signatureDataUri?: string | null;
}

export class ClinicalDocumentPatientDto {
  @ApiProperty({ description: 'Patient ID', format: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'Full combined name of the patient' })
  fullName!: string;

  @ApiProperty({ description: 'First name' })
  firstName!: string;

  @ApiProperty({ description: 'Last name' })
  lastName!: string;

  @ApiPropertyOptional({ description: 'Date of birth', nullable: true })
  birthDate?: string | null;

  @ApiPropertyOptional({
    description: 'Calculated age in years',
    nullable: true,
  })
  age?: number | null;

  @ApiPropertyOptional({ description: 'Patient contact phone', nullable: true })
  phoneNumber?: string | null;

  @ApiPropertyOptional({ description: 'Patient email address', nullable: true })
  email?: string | null;
}

export class ClinicalDocumentCaseFileSummaryDto {
  @ApiProperty({ description: 'Case File ID', format: 'uuid' })
  id!: string;

  @ApiPropertyOptional({ description: 'Clinical diagnosis', nullable: true })
  diagnosis?: string | null;

  @ApiPropertyOptional({
    description: 'Clinical treatment plan',
    nullable: true,
  })
  treatmentPlan?: string | null;

  @ApiProperty({ description: 'Creation ISO timestamp' })
  createdAt!: string;

  @ApiProperty({ description: 'Last update ISO timestamp' })
  updatedAt!: string;
}

export class ClinicalDocumentSessionNoteDto {
  @ApiProperty({ description: 'Session Note ID', format: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'Date and time of session' })
  sessionDate!: string;

  @ApiPropertyOptional({
    description: 'Title of the session note',
    nullable: true,
  })
  title?: string | null;

  @ApiProperty({ description: 'Clinical evolution content' })
  content!: string;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt!: string;

  @ApiProperty({ description: 'Update timestamp' })
  updatedAt!: string;
}

export class ClinicalDocumentAppointmentDto {
  @ApiProperty({ description: 'Appointment ID', format: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'Scheduled date and time' })
  scheduledAt!: string;

  @ApiProperty({ description: 'Duration in minutes' })
  durationMinutes!: number;

  @ApiPropertyOptional({ description: 'Appointment notes', nullable: true })
  notes?: string | null;
}

export class ClinicalPdfExportPayloadDto {
  @ApiProperty({
    enum: ClinicalDocumentType,
    description: 'Document classification type',
    example: ClinicalDocumentType.NOM_004_EVOLUTION_NOTE,
  })
  documentType!: ClinicalDocumentType;

  @ApiProperty({ description: 'ISO timestamp when payload was compiled' })
  generatedAt!: string;

  @ApiProperty({
    description: 'Tenant and clinic institutional branding details',
  })
  tenant!: ClinicalDocumentTenantDto;

  @ApiProperty({ description: 'Professional therapist details and signature' })
  therapist!: ClinicalDocumentTherapistDto;

  @ApiProperty({ description: 'Patient identification details' })
  patient!: ClinicalDocumentPatientDto;

  @ApiProperty({ description: 'Case file clinical record details' })
  caseFile!: ClinicalDocumentCaseFileSummaryDto;

  @ApiPropertyOptional({
    description: 'Session note details for evolution notes',
    nullable: true,
  })
  sessionNote?: ClinicalDocumentSessionNoteDto | null;

  @ApiPropertyOptional({
    description: 'Related appointment details',
    nullable: true,
  })
  appointment?: ClinicalDocumentAppointmentDto | null;
}
