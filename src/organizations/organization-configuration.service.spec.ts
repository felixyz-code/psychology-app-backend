import { ConflictException, NotFoundException } from '@nestjs/common';
import { MembershipRole, UserRole } from '@prisma/client';
import {
  TenantResolutionMode,
  type TenantContext,
} from '../common/request-context/request-context.service';
import { OrganizationConfigurationService } from './organization-configuration.service';

describe('OrganizationConfigurationService', () => {
  const tenant: TenantContext = {
    userId: '00000000-0000-4000-8000-000000000001',
    membershipId: '00000000-0000-4000-8000-000000000002',
    organizationId: '00000000-0000-4000-8000-000000000003',
    organizationRole: MembershipRole.OWNER,
    legacyUserRole: UserRole.ADMIN,
    resolutionMode: TenantResolutionMode.EXPLICIT,
  };

  it('returns an effective 60-minute setting when the reserved row is absent', async () => {
    const service = new OrganizationConfigurationService({
      organization: {
        findFirst: jest.fn().mockResolvedValue({ id: tenant.organizationId }),
      },
      organizationSettings: { findUnique: jest.fn().mockResolvedValue(null) },
    } as never);

    await expect(
      service.getSettings(tenant.organizationId, tenant),
    ).resolves.toEqual({
      rowState: 'ABSENT',
      updatedAt: null,
      defaultAppointmentDuration: 60,
      persistedDefaultAppointmentDuration: null,
    });
  });

  it('preserves the effective fallback when a present settings row stores null', async () => {
    const updatedAt = new Date('2026-08-12T00:00:00.000Z');
    const service = new OrganizationConfigurationService({
      organization: {
        findFirst: jest.fn().mockResolvedValue({ id: tenant.organizationId }),
      },
      organizationSettings: {
        findUnique: jest.fn().mockResolvedValue({
          defaultAppointmentDuration: null,
          updatedAt,
        }),
      },
    } as never);

    await expect(
      service.getSettings(tenant.organizationId, tenant),
    ).resolves.toEqual({
      rowState: 'PRESENT',
      updatedAt,
      defaultAppointmentDuration: 60,
      persistedDefaultAppointmentDuration: null,
    });
  });

  it('redacts a path outside the selected tenant before querying persistence', async () => {
    const service = new OrganizationConfigurationService({} as never);

    await expect(
      service.getBranding('00000000-0000-4000-8000-000000000099', tenant),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('maps an absent precondition against an existing row to a conflict', async () => {
    const tx = {
      organization: {
        findFirst: jest.fn().mockResolvedValue({ id: tenant.organizationId }),
      },
      organizationSettings: { findUnique: jest.fn().mockResolvedValue({}) },
    };
    const service = new OrganizationConfigurationService({
      $transaction: jest.fn((work: (client: typeof tx) => Promise<unknown>) =>
        work(tx),
      ),
    } as never);

    await expect(
      service.updateSettings(
        tenant.organizationId,
        { defaultAppointmentDuration: 45, expectedRowState: 'ABSENT' },
        tenant,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not create a meaningless settings row for an absent reset request', async () => {
    const tx = {
      organization: {
        findFirst: jest.fn().mockResolvedValue({ id: tenant.organizationId }),
      },
      organizationSettings: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const service = new OrganizationConfigurationService({
      $transaction: jest.fn((work: (client: typeof tx) => Promise<unknown>) =>
        work(tx),
      ),
    } as never);

    await expect(
      service.updateSettings(
        tenant.organizationId,
        { defaultAppointmentDuration: null, expectedRowState: 'ABSENT' },
        tenant,
      ),
    ).resolves.toEqual({
      rowState: 'ABSENT',
      updatedAt: null,
      defaultAppointmentDuration: 60,
      persistedDefaultAppointmentDuration: null,
    });
    expect(tx.organizationSettings.findUnique).toHaveBeenCalledTimes(1);
  });

  it('only updates a present row through its exact updatedAt compare-and-swap', async () => {
    const expectedUpdatedAt = new Date('2026-08-12T00:00:00.000Z');
    const refreshedAt = new Date('2026-08-12T00:00:01.000Z');
    let observedUpdate: { where: { updatedAt: Date } } | undefined;
    const updateMany = jest.fn((arguments_: { where: { updatedAt: Date } }) => {
      observedUpdate = arguments_;
      return Promise.resolve({ count: 1 });
    });
    const tx = {
      organization: {
        findFirst: jest.fn().mockResolvedValue({ id: tenant.organizationId }),
      },
      organizationSettings: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            defaultAppointmentDuration: 50,
            updatedAt: expectedUpdatedAt,
          })
          .mockResolvedValueOnce({
            defaultAppointmentDuration: null,
            updatedAt: refreshedAt,
          }),
        updateMany,
      },
    };
    const service = new OrganizationConfigurationService({
      $transaction: jest.fn((work: (client: typeof tx) => Promise<unknown>) =>
        work(tx),
      ),
    } as never);

    await expect(
      service.updateSettings(
        tenant.organizationId,
        {
          defaultAppointmentDuration: null,
          expectedUpdatedAt: expectedUpdatedAt.toISOString(),
        },
        tenant,
      ),
    ).resolves.toMatchObject({
      rowState: 'PRESENT',
      defaultAppointmentDuration: 60,
      persistedDefaultAppointmentDuration: null,
    });
    expect(observedUpdate?.where.updatedAt).toEqual(expectedUpdatedAt);
  });
});
