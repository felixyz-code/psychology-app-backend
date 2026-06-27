import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  FinancialTransactionCategory,
  FinancialTransactionStatus,
  FinancialTransactionType,
  PaymentMethod,
} from '@prisma/client';
import {
  IsDate,
  IsEnum,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from 'class-validator';

export class CreateFinancialTransactionDto {
  @ApiProperty({
    description: 'Business type of the financial transaction',
    enum: FinancialTransactionType,
    example: FinancialTransactionType.INCOME,
  })
  @IsEnum(FinancialTransactionType)
  type: FinancialTransactionType;

  @ApiPropertyOptional({
    description: 'Current transaction status',
    enum: FinancialTransactionStatus,
    example: FinancialTransactionStatus.PENDING,
  })
  @IsOptional()
  @IsEnum(FinancialTransactionStatus)
  status?: FinancialTransactionStatus;

  @ApiPropertyOptional({
    description: 'Category used for basic financial classification',
    enum: FinancialTransactionCategory,
    example: FinancialTransactionCategory.SESSION,
  })
  @IsOptional()
  @IsEnum(FinancialTransactionCategory)
  category?: FinancialTransactionCategory;

  @ApiProperty({
    description: 'Positive transaction amount',
    example: 850.5,
  })
  @Type(() => Number)
  @IsPositive()
  amount: number;

  @ApiPropertyOptional({
    description: 'ISO-like 3-letter currency code',
    example: 'MXN',
    minLength: 3,
    maxLength: 3,
  })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @ApiProperty({
    description: 'Short financial concept or title',
    maxLength: 255,
    example: 'Psychotherapy session payment',
  })
  @IsString()
  @MaxLength(255)
  concept: string;

  @ApiPropertyOptional({
    description: 'Optional detailed description',
    example: 'Payment received after the Tuesday follow-up session.',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Date and time when the transaction occurred',
    type: String,
    format: 'date-time',
    example: '2026-06-26T17:00:00.000Z',
  })
  @Type(() => Date)
  @IsDate()
  occurredAt: Date;

  @ApiPropertyOptional({
    description: 'Optional due date for pending transactions',
    type: String,
    format: 'date-time',
    example: '2026-07-01T18:00:00.000Z',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dueDate?: Date;

  @ApiPropertyOptional({
    description: 'Payment method used by the transaction',
    enum: PaymentMethod,
    example: PaymentMethod.TRANSFER,
  })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({
    description: 'Optional internal notes',
    example: 'Registered manually after bank confirmation.',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    description: 'Related patient ID when the transaction is patient-scoped',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsUUID()
  patientId?: string;

  @ApiPropertyOptional({
    description:
      'Related appointment ID when the transaction is appointment-scoped',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  @IsOptional()
  @IsUUID()
  appointmentId?: string;

  @ApiPropertyOptional({
    description:
      'Creator user ID. Ignored for PSYCHOLOGIST and accepted for ADMIN',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440002',
  })
  @IsOptional()
  @IsUUID()
  createdById?: string;
}
