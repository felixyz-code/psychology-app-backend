import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrganizationLogoAssetsModule } from '../organization-logo-assets/organization-logo-assets.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantContextModule } from '../tenant-context/tenant-context.module';
import { UserProfileModule } from '../user-profile/user-profile.module';
import { CaseFilesController } from './case-files.controller';
import { CaseFilesService } from './case-files.service';
import { CaseFileAttachmentsController } from './case-file-attachments.controller';
import { CaseFileAttachmentsService } from './case-file-attachments.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    TenantContextModule,
    UserProfileModule,
    OrganizationLogoAssetsModule,
  ],
  controllers: [CaseFilesController, CaseFileAttachmentsController],
  providers: [CaseFilesService, CaseFileAttachmentsService],
  exports: [CaseFilesService, CaseFileAttachmentsService],
})
export class CaseFilesModule {}
