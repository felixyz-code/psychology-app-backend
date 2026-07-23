import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrganizationStatus } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant-context/tenant-context.types';

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  findAccessible(user: AuthenticatedUser) {
    return this.prisma.organization.findMany({
      where: {
        status: OrganizationStatus.ACTIVE,
        memberships: { some: { userId: user.id, status: 'ACTIVE' } },
      },
      select: {
        id: true,
        displayName: true,
        status: true,
        timezone: true,
        locale: true,
        currency: true,
      },
      orderBy: { displayName: 'asc' },
    });
  }
  current(tenant: TenantContext) {
    return this.findScopedOrThrow(tenant.organizationId, tenant);
  }
  findOne(organizationId: string, tenant: TenantContext) {
    if (organizationId !== tenant.organizationId)
      throw new NotFoundException('Organization not found');
    return this.findScopedOrThrow(organizationId, tenant);
  }
  private async findScopedOrThrow(
    organizationId: string,
    tenant: TenantContext,
  ) {
    const organization = await this.prisma.organization.findFirst({
      where: {
        id: organizationId,
        status: OrganizationStatus.ACTIVE,
        memberships: {
          some: {
            id: tenant.membershipId,
            userId: tenant.userId,
            status: 'ACTIVE',
          },
        },
      },
      select: {
        id: true,
        displayName: true,
        status: true,
        timezone: true,
        locale: true,
        currency: true,
      },
    });
    if (!organization)
      throw new ConflictException('Organization context is no longer active');
    return organization;
  }
}
