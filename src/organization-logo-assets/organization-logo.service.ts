import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { OrganizationStatus, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  isUniqueViolation,
  serializableTransaction,
} from '../prisma/prisma-transaction.util';
import { TenantContext } from '../tenant-context/tenant-context.types';
import {
  LogoMutationPreconditionDto,
  RemoveOrganizationLogoDto,
} from './dto/logo-precondition.dto';
import {
  OrganizationLogoResponseDto,
  OrganizationLogoRowState,
} from './dto/organization-logo-response.dto';
import { OrganizationLogoStorageService } from './organization-logo-storage.service';
import { validateOrganizationLogo } from './organization-logo.validation';

const ADMINISTRABLE_STATUSES = [
  OrganizationStatus.ACTIVE,
  OrganizationStatus.SUSPENDED,
] as const;

const logoSelect = {
  organizationId: true,
  storageKey: true,
  mimeType: true,
  byteSize: true,
  width: true,
  height: true,
  updatedAt: true,
} as const;
type LogoAsset = Prisma.OrganizationLogoAssetGetPayload<{
  select: typeof logoSelect;
}>;

@Injectable()
export class OrganizationLogoService {
  private readonly logger = new Logger(OrganizationLogoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: OrganizationLogoStorageService,
  ) {}

  async getMetadata(organizationId: string, tenant: TenantContext) {
    this.assertSelectedOrganization(organizationId, tenant);
    await this.findScopedOrganization(organizationId, tenant);
    return this.toResponse(
      await this.prisma.organizationLogoAsset.findUnique({
        where: { organizationId },
        select: logoSelect,
      }),
    );
  }

  async getContent(organizationId: string, tenant: TenantContext) {
    this.assertSelectedOrganization(organizationId, tenant);
    await this.findScopedOrganization(organizationId, tenant);
    const logo = await this.prisma.organizationLogoAsset.findUnique({
      where: { organizationId },
      select: logoSelect,
    });
    if (!logo) throw new NotFoundException('Organization logo not found');
    return {
      absolutePath: await this.storage.resolveExistingFile(
        organizationId,
        logo.storageKey,
      ),
      mimeType: logo.mimeType,
      byteSize: logo.byteSize,
      updatedAt: logo.updatedAt,
      etag: `"${createHash('sha256').update(logo.storageKey).digest('base64url')}"`,
    };
  }

  async upload(
    organizationId: string,
    file: Express.Multer.File,
    dto: LogoMutationPreconditionDto,
    tenant: TenantContext,
  ) {
    this.assertSelectedOrganization(organizationId, tenant);
    const validated = validateOrganizationLogo(file);
    const written = await this.storage.writeNew(organizationId, file.buffer);
    try {
      const mutation = await serializableTransaction(
        this.prisma,
        async (tx) => {
          await this.findScopedOrganization(organizationId, tenant, tx);
          const current = await tx.organizationLogoAsset.findUnique({
            where: { organizationId },
            select: logoSelect,
          });
          if (dto.expectedRowState === 'ABSENT') {
            if (current)
              throw new ConflictException('Organization logo already exists');
            return {
              previous: null,
              logo: await tx.organizationLogoAsset.create({
                data: {
                  organizationId,
                  storageKey: written.storageKey,
                  ...validated,
                },
                select: logoSelect,
              }),
            };
          }
          if (!current)
            throw new ConflictException('Organization logo no longer exists');
          const updated = await tx.organizationLogoAsset.updateMany({
            where: {
              organizationId,
              updatedAt: new Date(dto.expectedUpdatedAt as string),
            },
            data: { storageKey: written.storageKey, ...validated },
          });
          if (updated.count !== 1)
            throw new ConflictException(
              'Organization logo changed concurrently',
            );
          return {
            previous: current,
            logo: await tx.organizationLogoAsset.findUniqueOrThrow({
              where: { organizationId },
              select: logoSelect,
            }),
          };
        },
      );
      if (mutation.previous) {
        await this.cleanup(
          mutation.previous.organizationId,
          mutation.previous.storageKey,
          'old_logo',
        );
      }
      return this.toResponse(mutation.logo);
    } catch (error) {
      await this.cleanup(organizationId, written.storageKey, 'new_logo');
      if (isUniqueViolation(error)) {
        throw new ConflictException('Organization logo changed concurrently');
      }
      throw error;
    }
  }

  async remove(
    organizationId: string,
    dto: RemoveOrganizationLogoDto,
    tenant: TenantContext,
  ) {
    this.assertSelectedOrganization(organizationId, tenant);
    const removed = await serializableTransaction(this.prisma, async (tx) => {
      await this.findScopedOrganization(organizationId, tenant, tx);
      const current = await tx.organizationLogoAsset.findUnique({
        where: { organizationId },
        select: logoSelect,
      });
      if (!current)
        throw new ConflictException('Organization logo no longer exists');
      const deleted = await tx.organizationLogoAsset.deleteMany({
        where: {
          organizationId,
          updatedAt: new Date(dto.expectedUpdatedAt),
        },
      });
      if (deleted.count !== 1)
        throw new ConflictException('Organization logo changed concurrently');
      return current;
    });
    await this.cleanup(removed.organizationId, removed.storageKey, 'old_logo');
    return this.toResponse(null);
  }

  private async cleanup(
    organizationId: string,
    storageKey: string,
    category: string,
  ) {
    try {
      await this.storage.deleteIfExists(organizationId, storageKey);
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'organization_logo_cleanup_failed',
          category,
          errorType: error instanceof Error ? error.name : 'UnknownError',
        }),
      );
    }
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
        status: { in: [...ADMINISTRABLE_STATUSES] },
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
  }

  private toResponse(logo: LogoAsset | null): OrganizationLogoResponseDto {
    return {
      rowState: logo
        ? OrganizationLogoRowState.PRESENT
        : OrganizationLogoRowState.ABSENT,
      updatedAt: logo?.updatedAt ?? null,
      mimeType:
        (logo?.mimeType as 'image/png' | 'image/jpeg' | undefined) ?? null,
      byteSize: logo?.byteSize ?? null,
      width: logo?.width ?? null,
      height: logo?.height ?? null,
    };
  }
}
