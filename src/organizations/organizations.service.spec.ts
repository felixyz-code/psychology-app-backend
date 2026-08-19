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

  it('does not emit success events when the transaction aborts after the write callback completes', async () => {
    const organization = {
      id: tenant.organizationId,
      slug: 'tenant-a',
      legalName: 'Tenant A Legal',
      displayName: 'Tenant A',
      status: OrganizationStatus.ACTIVE,
      timezone: 'UTC',
      locale: 'es-MX',
      currency: 'MXN',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const tx = {
      organization: {
        findFirst: jest.fn().mockResolvedValue(organization),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue({
          ...organization,
          status: OrganizationStatus.SUSPENDED,
        }),
      },
    };
    const observability = {
      organizationDomainEvent: jest.fn(),
    };
    const prisma = {
      $transaction: jest.fn(
        async (work: (client: typeof tx) => Promise<unknown>) => {
          await work(tx);
          throw new Prisma.PrismaClientKnownRequestError('serialization', {
            code: 'P2034',
            clientVersion: 'test',
          });
        },
      ),
    } as never;
    const service = new OrganizationsService(prisma, observability as never);

    await expect(
      service.changeStatus(
        tenant.organizationId,
        { status: OrganizationStatus.SUSPENDED },
        tenant,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(observability.organizationDomainEvent).not.toHaveBeenCalled();
  });

  it('updates institutional fields and persists changes', async () => {
    const organization = {
      id: tenant.organizationId,
      slug: 'tenant-a',
      legalName: 'Tenant A Legal',
      displayName: 'Tenant A',
      status: OrganizationStatus.ACTIVE,
      timezone: 'UTC',
      locale: 'es-MX',
      currency: 'MXN',
      tradeName: null,
      taxId: null,
      phone: null,
      email: null,
      website: null,
      address: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    let updatePayload: unknown;
    const tx = {
      organization: {
        findFirst: jest.fn().mockResolvedValue(organization),
        updateMany: jest.fn((args: { data: unknown }) => {
          updatePayload = args.data;
          return Promise.resolve({ count: 1 });
        }),
        findUnique: jest.fn().mockResolvedValue({
          ...organization,
          tradeName: 'Centro Psicológico Alpha',
          taxId: 'CPA123456789',
          phone: '+525512345678',
          email: 'contacto@alpha.com',
          website: 'https://alpha.com',
          address: 'Calle 1, CDMX',
        }),
      },
    };
    const observability = {
      organizationDomainEvent: jest.fn(),
    };
    const prisma = {
      $transaction: jest.fn((work: (client: typeof tx) => Promise<unknown>) =>
        work(tx),
      ),
    } as never;
    const service = new OrganizationsService(prisma, observability as never);

    const result = await service.update(
      tenant.organizationId,
      {
        tradeName: 'Centro Psicológico Alpha',
        taxId: 'CPA123456789',
        phone: '+525512345678',
        email: 'contacto@alpha.com',
        website: 'https://alpha.com',
        address: 'Calle 1, CDMX',
      },
      tenant,
    );

    expect(updatePayload).toEqual({
      tradeName: 'Centro Psicológico Alpha',
      taxId: 'CPA123456789',
      phone: '+525512345678',
      email: 'contacto@alpha.com',
      website: 'https://alpha.com',
      address: 'Calle 1, CDMX',
    });
    expect(result.tradeName).toBe('Centro Psicológico Alpha');
    expect(observability.organizationDomainEvent).toHaveBeenCalled();
  });
});
