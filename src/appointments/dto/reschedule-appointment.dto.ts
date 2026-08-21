import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class RescheduleAppointmentDto {
  @ApiProperty({
    description: 'New scheduled date and time in ISO 8601 format',
    example: '2026-08-25T15:00:00.000Z',
  })
  @IsDateString()
  @IsNotEmpty()
  scheduledAt!: string;

  @ApiPropertyOptional({
    description: 'Duration of the appointment in minutes (defaults to current duration)',
    example: 60,
    minimum: 15,
    maximum: 240,
  })
  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(240)
  durationMinutes?: number;

  @ApiPropertyOptional({
    description: 'Reason for rescheduling the appointment',
    example: 'Solicitud de cambio de horario por el paciente',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
