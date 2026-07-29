import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrganizationStatus, Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant-context/tenant-context.types';
import { TenantObservabilityService } from '../tenant-context/tenant-observability.service';
import {
  isUniqueViolation,
  serializableTransaction,
} from './organization-transaction.util';
import { ChangeOrganizationStatusDto } from './dto/change-organization-status.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

const ADMINISTRABLE_ORGANIZATION_STATUSES = [
  OrganizationStatus.ACTIVE,
  OrganizationStatus.SUSPENDED,
] as const;

const organizationAdminSelect = {
  id: true,
  slug: true,
  legalName: true,
  displayName: true,
  status: true,
  timezone: true,
  locale: true,
  currency: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly observability: TenantObservabilityService,
  ) {}

  findAccessible(user: AuthenticatedUser) {
    return this.prisma.organization.findMany({
      where: {
        status: { in: [...ADMINISTRABLE_ORGANIZATION_STATUSES] },
        memberships: { some: { userId: user.id, status: 'ACTIVE' } },
      },
      select: organizationAdminSelect,
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

  async update(
    organizationId: string,
    dto: UpdateOrganizationDto,
    tenant: TenantContext,
  ) {
    if (organizationId !== tenant.organizationId) {
      throw new NotFoundException('Organization not found');
    }

    const data = buildOrganizationUpdateData(dto);
    if (Object.keys(data).length === 0) {
      throw new BadRequestException(
        'At least one editable organization field is required',
      );
    }

    try {
      const refreshed = await serializableTransaction(
        this.prisma,
        async (tx) => {
          const organization = await this.findScopedOrThrowTx(
            tx,
            organizationId,
            tenant,
          );
          const updated = await tx.organization.updateMany({
            where: {
              id: organization.id,
              status: organization.status,
              updatedAt: organization.updatedAt,
            },
            data,
          });
          if (updated.count !== 1) {
            throw new ConflictException('Organization changed concurrently');
          }
          const refreshed = await tx.organization.findUnique({
            where: { id: organization.id },
            select: organizationAdminSelect,
          });
          if (!refreshed) {
            throw new ConflictException('Organization changed concurrently');
          }
          return refreshed;
        },
      );
      this.observability.organizationDomainEvent(
        'organization_updated',
        tenant,
        'SUCCESS',
        'ORGANIZATION_UPDATED',
        refreshed.id,
      );
      return refreshed;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Organization slug is already in use');
      }
      throw error;
    }
  }

  async changeStatus(
    organizationId: string,
    dto: ChangeOrganizationStatusDto,
    tenant: TenantContext,
  ) {
    if (organizationId !== tenant.organizationId) {
      throw new NotFoundException('Organization not found');
    }

    const refreshed = await serializableTransaction(this.prisma, async (tx) => {
      const organization = await this.findScopedOrThrowTx(
        tx,
        organizationId,
        tenant,
      );
      if (organization.status === dto.status) {
        throw new ConflictException('Organization status is already set');
      }
      const updated = await tx.organization.updateMany({
        where: {
          id: organization.id,
          status: organization.status,
          updatedAt: organization.updatedAt,
        },
        data: { status: dto.status },
      });
      if (updated.count !== 1) {
        throw new ConflictException('Organization changed concurrently');
      }
      const refreshed = await tx.organization.findUnique({
        where: { id: organization.id },
        select: organizationAdminSelect,
      });
      if (!refreshed) {
        throw new ConflictException('Organization changed concurrently');
      }
      return refreshed;
    });
    this.observability.organizationDomainEvent(
      dto.status === OrganizationStatus.SUSPENDED
        ? 'organization_suspended'
        : 'organization_reactivated',
      tenant,
      'SUCCESS',
      dto.status === OrganizationStatus.SUSPENDED
        ? 'ORGANIZATION_SUSPENDED'
        : 'ORGANIZATION_REACTIVATED',
      refreshed.id,
    );
    return refreshed;
  }

  private async findScopedOrThrow(
    organizationId: string,
    tenant: TenantContext,
  ) {
    return this.findScopedOrThrowTx(this.prisma, organizationId, tenant);
  }

  private async findScopedOrThrowTx(
    tx: Prisma.TransactionClient | PrismaService,
    organizationId: string,
    tenant: TenantContext,
  ) {
    const organization = await tx.organization.findFirst({
      where: {
        id: organizationId,
        status: { in: [...ADMINISTRABLE_ORGANIZATION_STATUSES] },
        memberships: {
          some: {
            id: tenant.membershipId,
            userId: tenant.userId,
            status: 'ACTIVE',
          },
        },
      },
      select: organizationAdminSelect,
    });
    if (!organization)
      throw new ConflictException(
        'Organization context is no longer available',
      );
    return organization;
  }
}

function buildOrganizationUpdateData(dto: UpdateOrganizationDto) {
  const data: Prisma.OrganizationUpdateManyMutationInput = {};

  if (dto.legalName !== undefined) {
    data.legalName = dto.legalName;
  }
  if (dto.displayName !== undefined) {
    data.displayName = dto.displayName;
  }
  if (dto.slug !== undefined) {
    data.slug = dto.slug;
  }
  if (dto.timezone !== undefined) {
    data.timezone = dto.timezone;
  }
  if (dto.locale !== undefined) {
    data.locale = dto.locale;
  }
  if (dto.currency !== undefined) {
    data.currency = dto.currency;
  }

  return data;
}
