import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrganizationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  isUniqueViolation,
  serializableTransaction,
} from '../prisma/prisma-transaction.util';
import { TenantContext } from '../tenant-context/tenant-context.types';
import { hasApprovedBrandAccentContrast } from './brand-color.util';
import {
  OrganizationBrandingResponseDto,
  OrganizationConfigurationRowState,
  OrganizationSettingsResponseDto,
} from './dto/organization-configuration-response.dto';
import { OrganizationConfigurationPreconditionDto } from './dto/organization-configuration-precondition.dto';
import { UpdateOrganizationBrandingDto } from './dto/update-organization-branding.dto';
import { UpdateOrganizationSettingsDto } from './dto/update-organization-settings.dto';

const ADMINISTRABLE_ORGANIZATION_STATUSES = [
  OrganizationStatus.ACTIVE,
  OrganizationStatus.SUSPENDED,
] as const;
const DEFAULT_APPOINTMENT_DURATION = 60;

@Injectable()
export class OrganizationConfigurationService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(organizationId: string, tenant: TenantContext) {
    this.assertSelectedOrganization(organizationId, tenant);
    await this.findScopedOrganization(organizationId, tenant);
    return this.toSettingsResponse(
      await this.prisma.organizationSettings.findUnique({
        where: { organizationId },
        select: { defaultAppointmentDuration: true, updatedAt: true },
      }),
    );
  }

  async updateSettings(
    organizationId: string,
    dto: UpdateOrganizationSettingsDto,
    tenant: TenantContext,
  ) {
    this.assertSelectedOrganization(organizationId, tenant);
    return this.runMutation(
      organizationId,
      dto,
      tenant,
      async (tx, current) => {
        if (dto.expectedRowState === 'ABSENT') {
          if (current)
            throw new ConflictException('Configuration row already exists');
          if (dto.defaultAppointmentDuration === null) return null;
          return tx.organizationSettings.create({
            data: {
              organizationId,
              defaultAppointmentDuration: dto.defaultAppointmentDuration,
            },
            select: { defaultAppointmentDuration: true, updatedAt: true },
          });
        }
        if (!current)
          throw new ConflictException('Configuration row no longer exists');
        const updated = await tx.organizationSettings.updateMany({
          where: {
            organizationId,
            updatedAt: new Date(dto.expectedUpdatedAt as string),
          },
          data: { defaultAppointmentDuration: dto.defaultAppointmentDuration },
        });
        if (updated.count !== 1)
          throw new ConflictException('Configuration changed concurrently');
        return tx.organizationSettings.findUnique({
          where: { organizationId },
          select: { defaultAppointmentDuration: true, updatedAt: true },
        });
      },
    ).then((row) =>
      this.toSettingsResponse(
        row as {
          defaultAppointmentDuration: number | null;
          updatedAt: Date;
        } | null,
      ),
    );
  }

  async getBranding(organizationId: string, tenant: TenantContext) {
    this.assertSelectedOrganization(organizationId, tenant);
    await this.findScopedOrganization(organizationId, tenant);
    return this.toBrandingResponse(
      await this.prisma.organizationBranding.findUnique({
        where: { organizationId },
        select: { primaryColor: true, updatedAt: true },
      }),
    );
  }

  async updateBranding(
    organizationId: string,
    dto: UpdateOrganizationBrandingDto,
    tenant: TenantContext,
  ) {
    this.assertSelectedOrganization(organizationId, tenant);
    if (dto.primaryColor && !hasApprovedBrandAccentContrast(dto.primaryColor)) {
      throw new BadRequestException(
        'primaryColor must have at least 3:1 contrast against approved light and dark surfaces',
      );
    }
    return this.runMutation(
      organizationId,
      dto,
      tenant,
      async (tx, current) => {
        if (dto.expectedRowState === 'ABSENT') {
          if (current)
            throw new ConflictException('Configuration row already exists');
          if (dto.primaryColor === null) return null;
          return tx.organizationBranding.create({
            data: { organizationId, primaryColor: dto.primaryColor },
            select: { primaryColor: true, updatedAt: true },
          });
        }
        if (!current)
          throw new ConflictException('Configuration row no longer exists');
        const updated = await tx.organizationBranding.updateMany({
          where: {
            organizationId,
            updatedAt: new Date(dto.expectedUpdatedAt as string),
          },
          data: { primaryColor: dto.primaryColor },
        });
        if (updated.count !== 1)
          throw new ConflictException('Configuration changed concurrently');
        return tx.organizationBranding.findUnique({
          where: { organizationId },
          select: { primaryColor: true, updatedAt: true },
        });
      },
    ).then((row) =>
      this.toBrandingResponse(
        row as { primaryColor: string | null; updatedAt: Date } | null,
      ),
    );
  }

  private async runMutation<TRow>(
    organizationId: string,
    dto: OrganizationConfigurationPreconditionDto,
    tenant: TenantContext,
    mutate: (
      tx: Prisma.TransactionClient,
      current: TRow | null,
    ) => Promise<TRow | null>,
  ) {
    try {
      return await serializableTransaction(this.prisma, async (tx) => {
        await this.findScopedOrganization(organizationId, tenant, tx);
        const current = await this.configurationRowForDto(
          tx,
          organizationId,
          dto,
        );
        return mutate(tx, current as TRow | null);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Configuration changed concurrently');
      }
      throw error;
    }
  }

  private configurationRowForDto(
    tx: Prisma.TransactionClient,
    organizationId: string,
    dto: OrganizationConfigurationPreconditionDto,
  ) {
    return 'defaultAppointmentDuration' in dto
      ? tx.organizationSettings.findUnique({ where: { organizationId } })
      : tx.organizationBranding.findUnique({ where: { organizationId } });
  }

  private assertSelectedOrganization(
    organizationId: string,
    tenant: TenantContext,
  ) {
    if (organizationId !== tenant.organizationId) {
      throw new NotFoundException('Organization not found');
    }
  }

  private async findScopedOrganization(
    organizationId: string,
    tenant: TenantContext,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
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
      select: { id: true },
    });
    if (!organization) {
      throw new ConflictException(
        'Organization context is no longer available',
      );
    }
    return organization;
  }

  private toSettingsResponse(
    row: { defaultAppointmentDuration: number | null; updatedAt: Date } | null,
  ): OrganizationSettingsResponseDto {
    return {
      rowState: row
        ? OrganizationConfigurationRowState.PRESENT
        : OrganizationConfigurationRowState.ABSENT,
      updatedAt: row?.updatedAt ?? null,
      defaultAppointmentDuration:
        row?.defaultAppointmentDuration ?? DEFAULT_APPOINTMENT_DURATION,
      persistedDefaultAppointmentDuration:
        row?.defaultAppointmentDuration ?? null,
    };
  }

  private toBrandingResponse(
    row: { primaryColor: string | null; updatedAt: Date } | null,
  ): OrganizationBrandingResponseDto {
    return {
      rowState: row
        ? OrganizationConfigurationRowState.PRESENT
        : OrganizationConfigurationRowState.ABSENT,
      updatedAt: row?.updatedAt ?? null,
      primaryColor: row?.primaryColor ?? null,
    };
  }
}
