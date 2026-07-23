import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MembershipRole, MembershipStatus, UserRole } from '@prisma/client';
import {
  TenantResolutionMode,
  type TenantContext,
} from '../common/request-context/request-context.service';
import { MembershipsService } from './memberships.service';

describe('MembershipsService policy boundary', () => {
  const tenant: TenantContext = {
    userId: '00000000-0000-4000-8000-000000000001',
    membershipId: '00000000-0000-4000-8000-000000000002',
    organizationId: '00000000-0000-4000-8000-000000000003',
    organizationRole: MembershipRole.ADMIN,
    legacyUserRole: UserRole.PSYCHOLOGIST,
    resolutionMode: TenantResolutionMode.EXPLICIT,
  };

  it('does not allow an admin to mutate an owner', async () => {
    const tx = {
      organizationMembership: {
        findFirst: jest.fn().mockResolvedValue({
          id: '00000000-0000-4000-8000-000000000004',
          userId: '00000000-0000-4000-8000-000000000005',
          role: MembershipRole.OWNER,
          status: MembershipStatus.ACTIVE,
        }),
      },
    };
    const prisma = {
      $transaction: jest.fn((work: (client: typeof tx) => unknown) => work(tx)),
    } as never;
    const policy = { decisionFor: jest.fn().mockReturnValue('CONDITIONAL') };
    const service = new MembershipsService(
      prisma,
      policy as never,
      { organizationDomainEvent: jest.fn() } as never,
    );
    await expect(
      service.remove(
        tenant.organizationId,
        '00000000-0000-4000-8000-000000000004',
        tenant,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a cross-tenant organization path without a lookup', async () => {
    const service = new MembershipsService(
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(
      service.leave('00000000-0000-4000-8000-000000000099', tenant),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
