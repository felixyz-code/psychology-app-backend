import { PartialType } from '@nestjs/swagger';
import { CreateFinancialTransactionDto } from './create-financial-transaction.dto';

export class UpdateFinancialTransactionDto extends PartialType(
  CreateFinancialTransactionDto,
) {}
