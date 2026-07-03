import { ApiProperty } from '@nestjs/swagger';

export class FinancialTransactionSummaryDto {
  @ApiProperty({ example: 2500 })
  incomeTotal: number;

  @ApiProperty({ example: 450 })
  expenseTotal: number;

  @ApiProperty({ example: 100 })
  adjustmentTotal: number;

  @ApiProperty({ example: 200 })
  refundTotal: number;

  @ApiProperty({ example: 1950 })
  netTotal: number;

  @ApiProperty({ example: 8 })
  transactionCount: number;
}
