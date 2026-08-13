import { Module } from '@nestjs/common';
import { OrganizationLogoStorageService } from './organization-logo-storage.service';

@Module({
  providers: [OrganizationLogoStorageService],
  exports: [OrganizationLogoStorageService],
})
export class OrganizationLogoAssetsModule {}
