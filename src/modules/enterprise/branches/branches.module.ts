import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { EntitlementsModule } from '../../../entitlements/entitlements.module';
import { TenantContextModule } from '../../../tenant-context/tenant-context.module';
import { BranchesController } from './branches.controller';
import { BranchesService } from './branches.service';
import { BranchContextGuard } from './guards/branch-context.guard';

@Module({
  imports: [PrismaModule, EntitlementsModule, TenantContextModule],
  controllers: [BranchesController],
  providers: [BranchesService, BranchContextGuard],
  exports: [BranchesService, BranchContextGuard],
})
export class BranchesModule {}
