import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationChannel, NotificationEventType } from '@prisma/client';

export class NotificationTemplateResponseDto {
  @ApiProperty({
    description: 'Unique template ID',
    format: 'uuid',
    example: '11111111-2222-3333-4444-555555555555',
  })
  id: string;

  @ApiProperty({
    description: 'Organization ID owning this template',
    format: 'uuid',
    example: 'a1111111-1111-4000-8000-111111111111',
  })
  organizationId: string;

  @ApiProperty({
    enum: NotificationChannel,
    description: 'Delivery channel',
    example: NotificationChannel.EMAIL,
  })
  channel: NotificationChannel;

  @ApiProperty({
    enum: NotificationEventType,
    description: 'Event type triggering this notification',
    example: NotificationEventType.APPOINTMENT_CONFIRMATION,
  })
  eventType: NotificationEventType;

  @ApiProperty({
    description: 'Human-readable name of the template',
    example: 'Confirmación de Cita (Email Oficial)',
  })
  name: string;

  @ApiPropertyOptional({
    description: 'Subject line for EMAIL templates',
    example: 'Confirmación de tu cita en {{organizationName}}',
  })
  subject?: string | null;

  @ApiProperty({
    description: 'Body of the template',
    example: 'Hola {{patientName}}, tu cita está agendada.',
  })
  body: string;

  @ApiPropertyOptional({
    description: 'Detected or declared variables list',
    type: [String],
    example: ['patientName', 'appointmentDate'],
  })
  variables?: string[] | null;

  @ApiProperty({
    description: 'Whether the template is active',
    example: true,
  })
  isActive: boolean;

  @ApiProperty({
    description: 'Creation timestamp',
    example: '2026-08-21T18:00:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Last update timestamp',
    example: '2026-08-21T18:30:00.000Z',
  })
  updatedAt: Date;
}

export class RenderPreviewResponseDto {
  @ApiPropertyOptional({
    description: 'Rendered subject with values replaced',
    example: 'Confirmación de tu cita en PsiqueOS Clínica Central',
  })
  renderedSubject?: string;

  @ApiProperty({
    description: 'Rendered body with values replaced',
    example: 'Hola Ana Sofía, tu cita con el Dr. Mendoza es el 25 de Agosto.',
  })
  renderedBody: string;

  @ApiProperty({
    enum: NotificationChannel,
    description: 'Simulated channel',
    example: NotificationChannel.WHATSAPP,
  })
  channel: NotificationChannel;

  @ApiProperty({
    enum: NotificationEventType,
    description: 'Simulated event type',
    example: NotificationEventType.APPOINTMENT_CONFIRMATION,
  })
  eventType: NotificationEventType;

  @ApiProperty({
    description: 'List of variables detected in template',
    type: [String],
    example: ['patientName', 'therapistName', 'appointmentDate'],
  })
  detectedVariables: string[];

  @ApiProperty({
    description: 'List of variables detected but without value supplied',
    type: [String],
    example: [],
  })
  unmappedVariables: string[];

  @ApiProperty({
    description: 'Key-value dictionary of the sample context used',
    type: Object,
  })
  contextUsed: Record<string, string>;
}

export class TemplateVariableMetadataDto {
  @ApiProperty({ example: 'patientName' })
  key: string;

  @ApiProperty({ example: 'Nombre del Paciente' })
  label: string;

  @ApiProperty({ example: 'Nombre completo o de pila del paciente' })
  description: string;

  @ApiProperty({ example: 'Ana Sofía Rodríguez' })
  exampleValue: string;

  @ApiProperty({ example: 'patient' })
  category: string;
}
