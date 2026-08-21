import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateScheduleBlockDto {
  @ApiPropertyOptional({
    description:
      'Therapist User ID (optional if requester is the therapist; required if admin creating for another therapist)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsUUID()
  therapistId?: string;

  @ApiProperty({
    description: 'Title of the schedule block',
    example: 'Capacitación NOM-004',
    maxLength: 150,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  title!: string;

  @ApiPropertyOptional({
    description: 'Detailed reason or notes for the block',
    example: 'Asistencia obligatoria a simposio médico',
  })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiProperty({
    description: 'Block start time in ISO 8601 format',
    example: '2026-08-25T14:00:00.000Z',
  })
  @IsDateString()
  @IsNotEmpty()
  startTime!: string;

  @ApiProperty({
    description: 'Block end time in ISO 8601 format',
    example: '2026-08-25T17:00:00.000Z',
  })
  @IsDateString()
  @IsNotEmpty()
  endTime!: string;
}
