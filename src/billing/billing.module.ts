import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ManualBillingAdapter } from './adapters/manual-billing.adapter';
import { BILLING_PROVIDER } from './billing.constants';
import { BillingService } from './billing.service';
import { AdminBillingController } from './controllers/admin-billing.controller';
import { AdminTenantsController } from './controllers/admin-tenants.controller';
import { AdminTenantsService } from './services/admin-tenants.service';

@Module({
  imports: [PrismaModule],
  controllers: [AdminBillingController, AdminTenantsController],
  providers: [
    ManualBillingAdapter,
    {
      provide: BILLING_PROVIDER,
      useExisting: ManualBillingAdapter,
    },
    BillingService,
    AdminTenantsService,
  ],
  exports: [
    BillingService,
    AdminTenantsService,
    BILLING_PROVIDER,
    ManualBillingAdapter,
  ],
})
export class BillingModule {}
