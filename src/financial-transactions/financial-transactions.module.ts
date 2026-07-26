import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantContextModule } from '../tenant-context/tenant-context.module';
import { FinancialTransactionsController } from './financial-transactions.controller';
import { FinancialTransactionsService } from './financial-transactions.service';

@Module({
  imports: [PrismaModule, AuthModule, TenantContextModule],
  controllers: [FinancialTransactionsController],
  providers: [FinancialTransactionsService],
})
export class FinancialTransactionsModule {}
