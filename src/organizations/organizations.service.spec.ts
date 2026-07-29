import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  MembershipRole,
  OrganizationStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import {
  TenantResolutionMode,
  type TenantContext,
} from '../common/request-context/request-context.service';
import { OrganizationsService } from './organizations.service';

describe('OrganizationsService', () => {
  const tenant: TenantContext = {
    userId: '00000000-0000-4000-8000-000000000001',
    membershipId: '00000000-0000-4000-8000-000000000002',
    organizationId: '00000000-0000-4000-8000-000000000003',
    organizationRole: MembershipRole.OWNER,
    legacyUserRole: UserRole.ADMIN,
    resolutionMode: TenantResolutionMode.EXPLICIT,
  };

  it('includes suspended organizations in the accessible administrative list', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new OrganizationsService(
      { organization: { findMany } } as never,
      {} as never,
    );

    await service.findAccessible({ id: tenant.userId } as never);

    const [query] = findMany.mock.calls[0] as [
      { where: { status: { in: readonly OrganizationStatus[] } } },
    ];

    expect(query.where.status.in).toEqual([
      OrganizationStatus.ACTIVE,
      OrganizationStatus.SUSPENDED,
    ]);
  });

  it('rejects cross-tenant path access before querying persistence', async () => {
    const service = new OrganizationsService({} as never, {} as never);

    await expect(
      service.update(
        '00000000-0000-4000-8000-000000000099',
        { displayName: 'Different tenant' },
        tenant,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects empty update payloads after DTO allowlisting removes server-owned fields', async () => {
    const service = new OrganizationsService({} as never, {} as never);

    await expect(
      service.update(tenant.organizationId, {}, tenant),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('maps unique slug collisions to a stable conflict', async () => {
    const prisma = {
      $transaction: jest.fn().mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('duplicate', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      ),
    } as never;
    const service = new OrganizationsService(prisma, {} as never);

    await expect(
      service.update(tenant.organizationId, { slug: 'existing-slug' }, tenant),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects repeated organization status transitions', async () => {
    const organization = {
      id: tenant.organizationId,
      slug: 'tenant-a',
      legalName: 'Tenant A Legal',
      displayName: 'Tenant A',
      status: OrganizationStatus.SUSPENDED,
      timezone: 'UTC',
      locale: 'es-MX',
      currency: 'MXN',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const tx = {
      organization: {
        findFirst: jest.fn().mockResolvedValue(organization),
      },
    };
    const prisma = {
      $transaction: jest.fn((work: (client: typeof tx) => Promise<unknown>) =>
        work(tx),
      ),
    } as never;
    const service = new OrganizationsService(prisma, {
      organizationDomainEvent: jest.fn(),
    } as never);

    await expect(
      service.changeStatus(
        tenant.organizationId,
        { status: OrganizationStatus.SUSPENDED },
        tenant,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
