import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

export class CreateAppointmentDto {
  @ApiProperty({
    description: 'Patient ID linked to the appointment',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  patientId: string;

  @ApiProperty({
    description: 'Psychologist user ID linked to the appointment',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  @IsUUID()
  psychologistId: string;

  @ApiProperty({
    description: 'Scheduled date and time of the appointment',
    type: String,
    format: 'date-time',
    example: '2026-06-20T17:00:00.000Z',
  })
  @Type(() => Date)
  @IsDate()
  scheduledAt: Date;

  @ApiProperty({
    description: 'Duration of the appointment in minutes',
    example: 50,
    minimum: 1,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  durationMinutes: number;

  @ApiPropertyOptional({
    description: 'Current appointment status',
    enum: AppointmentStatus,
    example: AppointmentStatus.SCHEDULED,
  })
  @IsOptional()
  @IsEnum(AppointmentStatus)
  status?: AppointmentStatus;

  @ApiPropertyOptional({
    description: 'Optional appointment notes',
    example: 'First follow-up session',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
