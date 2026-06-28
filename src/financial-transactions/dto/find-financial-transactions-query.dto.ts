import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  FinancialTransactionCategory,
  FinancialTransactionStatus,
  FinancialTransactionType,
  PaymentMethod,
} from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';

export class FindFinancialTransactionsQueryDto {
  @ApiPropertyOptional({
    description: 'Lower bound for occurredAt filtering',
    type: String,
    format: 'date-time',
    example: '2026-06-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    description: 'Upper bound for occurredAt filtering',
    type: String,
    format: 'date-time',
    example: '2026-06-30T23:59:59.999Z',
  })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    description: 'Filter by financial transaction type',
    enum: FinancialTransactionType,
    example: FinancialTransactionType.INCOME,
  })
  @IsOptional()
  @IsEnum(FinancialTransactionType)
  type?: FinancialTransactionType;

  @ApiPropertyOptional({
    description: 'Filter by financial transaction status',
    enum: FinancialTransactionStatus,
    example: FinancialTransactionStatus.COMPLETED,
  })
  @IsOptional()
  @IsEnum(FinancialTransactionStatus)
  status?: FinancialTransactionStatus;

  @ApiPropertyOptional({
    description: 'Filter by financial transaction category',
    enum: FinancialTransactionCategory,
    example: FinancialTransactionCategory.SESSION,
  })
  @IsOptional()
  @IsEnum(FinancialTransactionCategory)
  category?: FinancialTransactionCategory;

  @ApiPropertyOptional({
    description: 'Filter by payment method',
    enum: PaymentMethod,
    example: PaymentMethod.TRANSFER,
  })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({
    description: 'Filter by related patient ID',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsUUID()
  patientId?: string;

  @ApiPropertyOptional({
    description: 'Filter by related appointment ID',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  @IsOptional()
  @IsUUID()
  appointmentId?: string;

  @ApiPropertyOptional({
    description: 'Filter by creator user ID',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440002',
  })
  @IsOptional()
  @IsUUID()
  createdById?: string;
}
