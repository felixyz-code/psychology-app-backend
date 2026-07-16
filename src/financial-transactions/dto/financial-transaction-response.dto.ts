import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  FinancialTransactionCategory,
  FinancialTransactionStatus,
  FinancialTransactionType,
  PaymentMethod,
} from '@prisma/client';

export class FinancialTransactionResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: FinancialTransactionType })
  type: FinancialTransactionType;

  @ApiProperty({ enum: FinancialTransactionStatus })
  status: FinancialTransactionStatus;

  @ApiProperty({ enum: FinancialTransactionCategory })
  category: FinancialTransactionCategory;

  @ApiProperty({
    description: 'Decimal amount serialized by Prisma as a string',
    example: '850.50',
  })
  amount: string;

  @ApiProperty({ example: 'MXN' })
  currency: string;

  @ApiProperty()
  concept: string;

  @ApiPropertyOptional({ nullable: true })
  description: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  occurredAt: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  dueDate: Date | null;

  @ApiPropertyOptional({ enum: PaymentMethod, nullable: true })
  paymentMethod: PaymentMethod | null;

  @ApiPropertyOptional({ nullable: true })
  notes: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  patientId: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  appointmentId: string | null;

  @ApiProperty({ format: 'uuid' })
  createdById: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: Date;
}
