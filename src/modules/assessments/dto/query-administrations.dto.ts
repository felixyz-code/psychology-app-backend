import { ApiPropertyOptional } from '@nestjs/swagger';
import { AdministrationStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class QueryAdministrationsDto {
  @ApiPropertyOptional({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description: 'Filter assessments by patient UUID',
  })
  @IsOptional()
  @IsUUID()
  patientId?: string;

  @ApiPropertyOptional({
    example: '223e4567-e89b-12d3-a456-426614174001',
    description: 'Filter assessments by professional UUID',
  })
  @IsOptional()
  @IsUUID()
  professionalId?: string;

  @ApiPropertyOptional({
    enum: AdministrationStatus,
    example: AdministrationStatus.ASSIGNED,
    description: 'Filter assessments by administration status',
  })
  @IsOptional()
  @IsEnum(AdministrationStatus)
  status?: AdministrationStatus;

  @ApiPropertyOptional({
    example: 'PHQ-9',
    description: 'Filter assessments by instrument code',
  })
  @IsOptional()
  @IsString()
  instrumentCode?: string;

  @ApiPropertyOptional({
    example: '2026-08-01T00:00:00.000Z',
    description: 'Filter created after or on this ISO date',
  })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({
    example: '2026-08-31T23:59:59.000Z',
    description: 'Filter created before or on this ISO date',
  })
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @ApiPropertyOptional({
    example: 1,
    description: 'Page number for pagination',
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    example: 20,
    description: 'Number of items per page',
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
