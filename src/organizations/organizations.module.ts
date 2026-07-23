import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantContextModule } from '../tenant-context/tenant-context.module';
import { InvitationsService } from './invitations.service';
import { MembershipsService } from './memberships.service';
import { OrganizationInvitationsController } from './organization-invitations.controller';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';

@Module({
  imports: [PrismaModule, TenantContextModule],
  controllers: [OrganizationsController, OrganizationInvitationsController],
  providers: [OrganizationsService, MembershipsService, InvitationsService],
})
export class OrganizationsModule {}
