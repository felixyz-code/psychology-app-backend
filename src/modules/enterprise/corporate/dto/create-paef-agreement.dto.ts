import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaefAgreementStatus } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreatePaefAgreementDto {
  @ApiProperty({
    example: 'd3b07384-d113-40e1-a20d-773c68e14674',
    description: 'Corporate client UUID',
  })
  @IsUUID()
  @IsNotEmpty()
  corporateClientId!: string;

  @ApiProperty({
    example: 'ACME-PAEF-2026',
    description: 'Unique agreement code within the organization',
    maxLength: 50,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code!: string;

  @ApiProperty({
    example: 'Acme Corp Wellness Agreement 2026',
    description: 'Agreement title or descriptive contract name',
    maxLength: 150,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  title!: string;

  @ApiPropertyOptional({
    example:
      'Agreement covering psychological consultations for employees and families.',
    description: 'Detailed contract scope and terms',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    enum: PaefAgreementStatus,
    default: PaefAgreementStatus.ACTIVE,
    description: 'Agreement lifecycle status',
  })
  @IsEnum(PaefAgreementStatus)
  @IsOptional()
  status?: PaefAgreementStatus;

  @ApiPropertyOptional({
    example: true,
    description: 'Whether the agreement is valid across all branches',
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  isMultiBranch?: boolean;

  @ApiPropertyOptional({
    example: ['b1b07384-d113-40e1-a20d-773c68e14674'],
    description: 'Allowed branch UUIDs when isMultiBranch is false',
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  allowedBranchIds?: string[];

  @ApiPropertyOptional({
    example: 6,
    description: 'Default maximum session quota allowed per employee',
    default: 5,
  })
  @IsInt()
  @Min(1)
  @IsOptional()
  defaultMaxSessionsPerEmployee?: number;

  @ApiProperty({
    example: '2026-01-01T00:00:00.000Z',
    description: 'Agreement validity start timestamp',
  })
  @IsDateString()
  @IsNotEmpty()
  validFrom!: string;

  @ApiProperty({
    example: '2026-12-31T23:59:59.999Z',
    description: 'Agreement validity end timestamp',
  })
  @IsDateString()
  @IsNotEmpty()
  validUntil!: string;
}
