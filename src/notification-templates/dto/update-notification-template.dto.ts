import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateNotificationTemplateDto {
  @ApiPropertyOptional({
    description: 'Human-readable name of the template',
    example: 'Confirmación de Cita Actualizada',
    maxLength: 150,
  })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @ApiPropertyOptional({
    description: 'Subject line for EMAIL templates',
    example: 'Nueva confirmación de cita en {{organizationName}}',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  subject?: string;

  @ApiPropertyOptional({
    description:
      'Template message body containing dynamic variable placeholders',
    example:
      'Hola {{patientName}}, recordatorio de cita con {{therapistName}}.',
  })
  @IsOptional()
  @IsString()
  body?: string;

  @ApiPropertyOptional({
    description: 'List of allowed or detected variable placeholder keys',
    type: [String],
    example: ['patientName', 'appointmentDate', 'appointmentTime'],
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
