import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { EntitlementsModule } from '../../../entitlements/entitlements.module';
import { TenantContextModule } from '../../../tenant-context/tenant-context.module';
import { BranchesModule } from '../branches/branches.module';
import { CorporateController } from './corporate.controller';
import { CorporateClientsService } from './services/corporate-clients.service';
import { PaefAgreementsService } from './services/paef-agreements.service';
import { BenefitPoolsService } from './services/benefit-pools.service';
import { EmployeeEligibilityService } from './services/employee-eligibility.service';
import { BenefitDebitService } from './services/benefit-debit.service';

@Module({
  imports: [
    PrismaModule,
    EntitlementsModule,
    TenantContextModule,
    BranchesModule,
  ],
  controllers: [CorporateController],
  providers: [
    CorporateClientsService,
    PaefAgreementsService,
    BenefitPoolsService,
    EmployeeEligibilityService,
    BenefitDebitService,
  ],
  exports: [
    CorporateClientsService,
    PaefAgreementsService,
    BenefitPoolsService,
    EmployeeEligibilityService,
    BenefitDebitService,
  ],
})
export class CorporateModule {}
