import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';

export class CorporateReportQueryDto {
  @ApiPropertyOptional({
    description: 'Filter start date in ISO format (e.g. 2026-01-01)',
    example: '2026-01-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Filter end date in ISO format (e.g. 2026-12-31)',
    example: '2026-12-31T23:59:59.999Z',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Optional branch UUID for multi-branch scoped reporting',
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  })
  @IsOptional()
  @IsUUID()
  branchId?: string;
}

export class CorporateBillingStatementQueryDto extends CorporateReportQueryDto {
  @ApiPropertyOptional({
    description:
      'Custom monetary rate per session for monthly invoicing calculation (MXN)',
    example: 650,
    default: 500,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice?: number;
}
