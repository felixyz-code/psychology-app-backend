import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BenefitPoolStatus } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateBenefitPoolDto {
  @ApiProperty({
    example: 'Q1 2026 Primary Session Pool',
    description: 'Name or label for the benefit pool',
    maxLength: 120,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiProperty({
    example: 100,
    description: 'Total contracted sessions allocated in this pool',
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  totalSessions!: number;

  @ApiPropertyOptional({
    enum: BenefitPoolStatus,
    default: BenefitPoolStatus.ACTIVE,
    description: 'Status of the benefit pool',
  })
  @IsEnum(BenefitPoolStatus)
  @IsOptional()
  status?: BenefitPoolStatus;

  @ApiProperty({
    example: '2026-01-01T00:00:00.000Z',
    description: 'Pool validity start timestamp',
  })
  @IsDateString()
  @IsNotEmpty()
  validFrom!: string;

  @ApiProperty({
    example: '2026-03-31T23:59:59.999Z',
    description: 'Pool validity end timestamp',
  })
  @IsDateString()
  @IsNotEmpty()
  validUntil!: string;
}
