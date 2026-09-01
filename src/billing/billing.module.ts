import { Module } from '@nestjs/common';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantContextModule } from '../tenant-context/tenant-context.module';
import { ManualBillingAdapter } from './adapters/manual-billing.adapter';
import { BILLING_PROVIDER } from './billing.constants';
import { BillingService } from './billing.service';
import { AdminBillingController } from './controllers/admin-billing.controller';
import { AdminTenantsController } from './controllers/admin-tenants.controller';
import { BillingController } from './controllers/billing.controller';
import { QuotaGuard } from './guards/quota.guard';
import { AdminTenantsService } from './services/admin-tenants.service';
import { QuotaEnforcementService } from './services/quota-enforcement.service';
import { StripeBillingService } from './services/stripe-billing.service';

@Module({
  imports: [PrismaModule, AuditLogsModule, AuthModule, TenantContextModule],
  controllers: [
    BillingController,
    AdminBillingController,
    AdminTenantsController,
  ],
  providers: [
    ManualBillingAdapter,
    {
      provide: BILLING_PROVIDER,
      useExisting: ManualBillingAdapter,
    },
    BillingService,
    AdminTenantsService,
    StripeBillingService,
    QuotaEnforcementService,
    QuotaGuard,
  ],
  exports: [
    BillingService,
    AdminTenantsService,
    StripeBillingService,
    QuotaEnforcementService,
    QuotaGuard,
    BILLING_PROVIDER,
    ManualBillingAdapter,
  ],
})
export class BillingModule {}
