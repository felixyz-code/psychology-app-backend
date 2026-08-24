import { ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationChannel, NotificationEventType } from '@prisma/client';
import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class RenderTemplatePreviewDto {
  @ApiPropertyOptional({
    description: 'Optional template ID to preview an existing stored template',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  templateId?: string;

  @ApiPropertyOptional({
    enum: NotificationChannel,
    description: 'Channel to simulate (EMAIL, SMS, WHATSAPP)',
  })
  @IsOptional()
  @IsEnum(NotificationChannel)
  channel?: NotificationChannel;

  @ApiPropertyOptional({
    enum: NotificationEventType,
    description: 'Event type context for the preview',
  })
  @IsOptional()
  @IsEnum(NotificationEventType)
  eventType?: NotificationEventType;

  @ApiPropertyOptional({
    description: 'Subject template string (primarily for EMAIL)',
  })
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiPropertyOptional({
    description: 'Body template string containing {{placeholders}}',
  })
  @IsOptional()
  @IsString()
  body?: string;

  @ApiPropertyOptional({
    description:
      'Custom key-value context pairs to override default sample values',
    type: Object,
    example: {
      patientName: 'Sofía Valenzuela',
      therapistName: 'Lic. Andrés Soto',
    },
  })
  @IsOptional()
  @IsObject()
  customContext?: Record<string, any>;
}
