import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
} from 'class-validator';

export class AssignAssessmentDto {
  @ApiProperty({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description: 'Patient UUID receiving the assessment',
  })
  @IsUUID()
  @IsNotEmpty()
  patientId!: string;

  @ApiProperty({
    example: '223e4567-e89b-12d3-a456-426614174001',
    description: 'Published Instrument Version UUID to administer',
  })
  @IsUUID()
  @IsNotEmpty()
  instrumentVersionId!: string;

  @ApiPropertyOptional({
    example: '323e4567-e89b-12d3-a456-426614174002',
    description: 'Optional Branch UUID where assessment takes place',
  })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({
    example: '423e4567-e89b-12d3-a456-426614174003',
    description: 'Optional CaseFile UUID to link with the assessment',
  })
  @IsOptional()
  @IsUUID()
  caseFileId?: string;

  @ApiPropertyOptional({
    example: '2026-09-01T00:00:00.000Z',
    description: 'Optional expiration timestamp for patient completion',
  })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiPropertyOptional({
    example: true,
    description:
      'Whether a secure remote token is generated for patient self-administration',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isRemoteSelfAdministered?: boolean;
}
