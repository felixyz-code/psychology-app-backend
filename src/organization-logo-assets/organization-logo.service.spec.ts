import { ConflictException, NotFoundException } from '@nestjs/common';
import { MembershipRole, UserRole } from '@prisma/client';
import {
  TenantResolutionMode,
  type TenantContext,
} from '../common/request-context/request-context.service';
import { OrganizationLogoService } from './organization-logo.service';

jest.mock('./organization-logo.validation', () => ({
  validateOrganizationLogo: jest.fn(() => ({
    mimeType: 'image/png',
    byteSize: 100,
    width: 64,
    height: 64,
  })),
}));

describe('OrganizationLogoService', () => {
  const tenant: TenantContext = {
    userId: '00000000-0000-4000-8000-000000000001',
    membershipId: '00000000-0000-4000-8000-000000000002',
    organizationId: '00000000-0000-4000-8000-000000000003',
    organizationRole: MembershipRole.OWNER,
    legacyUserRole: UserRole.ADMIN,
    resolutionMode: TenantResolutionMode.EXPLICIT,
  };
  const existing = {
    organizationId: tenant.organizationId,
    storageKey: `organizations/${tenant.organizationId}/00000000-0000-4000-8000-000000000005`,
    mimeType: 'image/png',
    byteSize: 100,
    width: 64,
    height: 64,
    updatedAt: new Date('2026-08-13T00:00:00.000Z'),
  };

  it('returns an ABSENT metadata representation without exposing storage state', async () => {
    const service = new OrganizationLogoService(
      {
        organization: {
          findFirst: jest.fn().mockResolvedValue({ id: tenant.organizationId }),
        },
        organizationLogoAsset: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
      } as never,
      {} as never,
    );

    await expect(
      service.getMetadata(tenant.organizationId, tenant),
    ).resolves.toEqual({
      rowState: 'ABSENT',
      updatedAt: null,
      mimeType: null,
      byteSize: null,
      width: null,
      height: null,
    });
  });

  it('redacts a logo path outside the selected tenant before persistence access', async () => {
    const service = new OrganizationLogoService({} as never, {} as never);
    await expect(
      service.getMetadata('00000000-0000-4000-8000-000000000099', tenant),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('creates from ABSENT using a new server storage key', async () => {
    let createdStorageKey: string | undefined;
    const create = jest.fn((arguments_: { data: { storageKey: string } }) => {
      createdStorageKey = arguments_.data.storageKey;
      return Promise.resolve(existing);
    });
    const tx = {
      organization: {
        findFirst: jest.fn().mockResolvedValue({ id: tenant.organizationId }),
      },
      organizationLogoAsset: {
        findUnique: jest.fn().mockResolvedValue(null),
        create,
      },
    };
    const storage = {
      writeNew: jest
        .fn()
        .mockResolvedValue({ storageKey: existing.storageKey, byteSize: 100 }),
    };
    const service = new OrganizationLogoService(
      {
        $transaction: jest.fn((work: (client: typeof tx) => Promise<unknown>) =>
          work(tx),
        ),
      } as never,
      storage as never,
    );

    await expect(
      service.upload(
        tenant.organizationId,
        {} as Express.Multer.File,
        { expectedRowState: 'ABSENT' },
        tenant,
      ),
    ).resolves.toMatchObject({ rowState: 'PRESENT' });
    expect(createdStorageKey).toBe(existing.storageKey);
  });

  it('compensates a loser new blob on a first-write conflict', async () => {
    const storage = {
      writeNew: jest
        .fn()
        .mockResolvedValue({ storageKey: existing.storageKey, byteSize: 100 }),
      deleteIfExists: jest.fn(),
    };
    const tx = {
      organization: {
        findFirst: jest.fn().mockResolvedValue({ id: tenant.organizationId }),
      },
      organizationLogoAsset: {
        findUnique: jest.fn().mockResolvedValue(existing),
      },
    };
    const service = new OrganizationLogoService(
      {
        $transaction: jest.fn((work: (client: typeof tx) => Promise<unknown>) =>
          work(tx),
        ),
      } as never,
      storage as never,
    );

    await expect(
      service.upload(
        tenant.organizationId,
        {} as Express.Multer.File,
        { expectedRowState: 'ABSENT' },
        tenant,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(storage.deleteIfExists).toHaveBeenCalledWith(
      tenant.organizationId,
      existing.storageKey,
    );
  });

  it('keeps committed metadata when old-blob cleanup fails after removal', async () => {
    const storage = {
      deleteIfExists: jest.fn().mockRejectedValue(new Error('disk error')),
    };
    const tx = {
      organization: {
        findFirst: jest.fn().mockResolvedValue({ id: tenant.organizationId }),
      },
      organizationLogoAsset: {
        findUnique: jest.fn().mockResolvedValue(existing),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const service = new OrganizationLogoService(
      {
        $transaction: jest.fn((work: (client: typeof tx) => Promise<unknown>) =>
          work(tx),
        ),
      } as never,
      storage as never,
    );

    await expect(
      service.remove(
        tenant.organizationId,
        { expectedUpdatedAt: existing.updatedAt.toISOString() },
        tenant,
      ),
    ).resolves.toMatchObject({ rowState: 'ABSENT' });
  });
});
