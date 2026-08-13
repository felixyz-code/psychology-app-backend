import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantContextModule } from '../tenant-context/tenant-context.module';
import { OrganizationLogoController } from './organization-logo.controller';
import { OrganizationLogoService } from './organization-logo.service';
import { OrganizationLogoStorageService } from './organization-logo-storage.service';

@Module({
  imports: [PrismaModule, TenantContextModule],
  controllers: [OrganizationLogoController],
  providers: [OrganizationLogoStorageService, OrganizationLogoService],
  exports: [OrganizationLogoStorageService],
})
export class OrganizationLogoAssetsModule {}
