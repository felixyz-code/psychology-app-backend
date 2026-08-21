import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class AvailabilityQueryDto {
  @ApiProperty({
    description: 'Therapist / Psychologist User ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  @IsNotEmpty()
  therapistId!: string;

  @ApiProperty({
    description: 'Date to calculate availability for (YYYY-MM-DD)',
    example: '2026-08-25',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must be in YYYY-MM-DD format',
  })
  date!: string;

  @ApiPropertyOptional({
    description: 'Duration of the requested slot in minutes',
    example: 60,
    default: 60,
    minimum: 15,
    maximum: 240,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(15)
  @Max(240)
  durationMinutes: number = 60;

  @ApiPropertyOptional({
    description: 'Starting working hour (0-23)',
    example: 8,
    default: 8,
    minimum: 0,
    maximum: 23,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(23)
  startHour: number = 8;

  @ApiPropertyOptional({
    description: 'Ending working hour (1-24)',
    example: 20,
    default: 20,
    minimum: 1,
    maximum: 24,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  endHour: number = 20;
}
