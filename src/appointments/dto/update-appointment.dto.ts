import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { AppointmentStatus } from '@prisma/client';
import {
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class UpdateAppointmentDto {
  @ApiPropertyOptional({
    description: 'Patient ID linked to the appointment',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsUUID()
  patientId?: string;

  @ApiPropertyOptional({
    description: 'Psychologist user ID linked to the appointment',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  @IsOptional()
  @IsUUID()
  psychologistId?: string;

  @ApiPropertyOptional({
    description: 'Scheduled date and time of the appointment',
    type: String,
    format: 'date-time',
    example: '2026-06-20T17:00:00.000Z',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  scheduledAt?: Date;

  @ApiPropertyOptional({
    description: 'Duration of the appointment in minutes',
    example: 50,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  durationMinutes?: number;

  @ApiPropertyOptional({
    description: 'Current appointment status',
    enum: AppointmentStatus,
    example: AppointmentStatus.COMPLETED,
  })
  @IsOptional()
  @IsEnum(AppointmentStatus)
  status?: AppointmentStatus;

  @ApiPropertyOptional({
    description: 'Optional appointment notes',
    example: 'Patient requested reschedule',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
