import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EntitlementsService } from './entitlements.service';
import { FeatureGateGuard } from './guards/feature-gate.guard';
import { QuotaGuard } from './guards/quota.guard';

@Module({
  imports: [PrismaModule],
  providers: [EntitlementsService, QuotaGuard, FeatureGateGuard],
  exports: [EntitlementsService, QuotaGuard, FeatureGateGuard],
})
export class EntitlementsModule {}
