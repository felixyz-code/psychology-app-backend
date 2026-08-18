import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ManualBillingAdapter } from './adapters/manual-billing.adapter';
import { BILLING_PROVIDER } from './billing.constants';
import { BillingService } from './billing.service';
import { AdminBillingController } from './controllers/admin-billing.controller';

@Module({
  imports: [PrismaModule],
  controllers: [AdminBillingController],
  providers: [
    ManualBillingAdapter,
    {
      provide: BILLING_PROVIDER,
      useExisting: ManualBillingAdapter,
    },
    BillingService,
  ],
  exports: [BillingService, BILLING_PROVIDER, ManualBillingAdapter],
})
export class BillingModule {}
