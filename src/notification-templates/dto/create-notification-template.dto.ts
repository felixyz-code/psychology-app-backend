import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationChannel, NotificationEventType } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class CreateNotificationTemplateDto {
  @ApiProperty({
    enum: NotificationChannel,
    description: 'Delivery channel (EMAIL, SMS, WHATSAPP)',
    example: NotificationChannel.EMAIL,
  })
  @IsEnum(NotificationChannel)
  channel: NotificationChannel;

  @ApiProperty({
    enum: NotificationEventType,
    description: 'Lifecycle event type for this template',
    example: NotificationEventType.APPOINTMENT_CONFIRMATION,
  })
  @IsEnum(NotificationEventType)
  eventType: NotificationEventType;

  @ApiProperty({
    description: 'Human-readable name of the template',
    example: 'Confirmación de Cita (Email Oficial)',
    maxLength: 150,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @ApiPropertyOptional({
    description: 'Subject line required for EMAIL templates',
    example: 'Confirmación de tu cita en {{organizationName}}',
    maxLength: 255,
  })
  @ValidateIf(
    (o: CreateNotificationTemplateDto) =>
      o.channel === NotificationChannel.EMAIL,
  )
  @IsString()
  @IsNotEmpty({
    message: 'Subject is mandatory when channel is EMAIL',
  })
  @MaxLength(255)
  subject?: string;

  @ApiProperty({
    description:
      'Template message body containing dynamic variable placeholders',
    example:
      'Hola {{patientName}}, tu cita es el {{appointmentDate}} a las {{appointmentTime}}.',
  })
  @IsString()
  @IsNotEmpty()
  body: string;

  @ApiPropertyOptional({
    description: 'List of allowed or detected variable placeholder keys',
    type: [String],
    example: [
      'patientName',
      'appointmentDate',
      'appointmentTime',
      'therapistName',
    ],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  variables?: string[];

  @ApiPropertyOptional({
    description: 'Whether the template is currently active for dispatch',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
