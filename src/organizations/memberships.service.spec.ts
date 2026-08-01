import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  MembershipRole,
  MembershipStatus,
  OrganizationStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
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

  it('rejects role changes on revoked memberships', async () => {
    const tx = {
      organizationMembership: {
        findFirst: jest.fn().mockResolvedValue({
          id: '00000000-0000-4000-8000-000000000004',
          userId: '00000000-0000-4000-8000-000000000005',
          role: MembershipRole.PSYCHOLOGIST,
          status: MembershipStatus.REVOKED,
        }),
      },
    };
    const prisma = {
      $transaction: jest.fn((work: (client: typeof tx) => unknown) => work(tx)),
    } as never;
    const service = new MembershipsService(
      prisma,
      { decisionFor: jest.fn().mockReturnValue('ALLOW') } as never,
      { organizationDomainEvent: jest.fn() } as never,
    );

    await expect(
      service.changeRole(
        tenant.organizationId,
        '00000000-0000-4000-8000-000000000004',
        MembershipRole.BILLING,
        { ...tenant, organizationRole: MembershipRole.OWNER },
      ),
    ).rejects.toThrow('Invalid membership transition');
  });

  it('rejects self-mutation for admin role changes', async () => {
    const tx = {
      organizationMembership: {
        findFirst: jest.fn().mockResolvedValue({
          id: tenant.membershipId,
          userId: tenant.userId,
          role: MembershipRole.ADMIN,
          status: MembershipStatus.ACTIVE,
        }),
      },
    };
    const prisma = {
      $transaction: jest.fn((work: (client: typeof tx) => unknown) => work(tx)),
    } as never;
    const service = new MembershipsService(
      prisma,
      { decisionFor: jest.fn().mockReturnValue('CONDITIONAL') } as never,
      { organizationDomainEvent: jest.fn() } as never,
    );

    await expect(
      service.changeRole(
        tenant.organizationId,
        tenant.membershipId,
        MembershipRole.BILLING,
        tenant,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not emit success events when a membership transaction aborts after the write callback completes', async () => {
    const targetId = '00000000-0000-4000-8000-000000000004';
    const targetUserId = '00000000-0000-4000-8000-000000000005';
    let findFirstCalls = 0;
    const findFirst = jest.fn().mockImplementation(() => {
      findFirstCalls += 1;
      return Promise.resolve({
        id: targetId,
        userId: targetUserId,
        role: MembershipRole.PSYCHOLOGIST,
        status:
          findFirstCalls % 2 === 1
            ? MembershipStatus.ACTIVE
            : MembershipStatus.SUSPENDED,
      });
    });
    const tx = {
      organizationMembership: {
        findFirst,
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
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
    const service = new MembershipsService(
      prisma,
      { decisionFor: jest.fn().mockReturnValue('ALLOW') } as never,
      observability as never,
    );

    await expect(
      service.changeStatus(
        tenant.organizationId,
        targetId,
        MembershipStatus.SUSPENDED,
        { ...tenant, organizationRole: MembershipRole.OWNER },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(observability.organizationDomainEvent).not.toHaveBeenCalled();
  });

  it('transfers ownership by promoting the target and demoting the actor in one transaction', async () => {
    const targetId = '00000000-0000-4000-8000-000000000004';
    const targetUserId = '00000000-0000-4000-8000-000000000005';
    const tx = {
      organizationMembership: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({
            id: tenant.membershipId,
            userId: tenant.userId,
            role: MembershipRole.OWNER,
            status: MembershipStatus.ACTIVE,
            organization: {
              status: OrganizationStatus.ACTIVE,
            },
          })
          .mockResolvedValueOnce({
            id: targetId,
            userId: targetUserId,
            role: MembershipRole.ADMIN,
            status: MembershipStatus.ACTIVE,
          })
          .mockResolvedValueOnce({
            id: tenant.membershipId,
            userId: tenant.userId,
            role: MembershipRole.ADMIN,
            status: MembershipStatus.ACTIVE,
          })
          .mockResolvedValueOnce({
            id: targetId,
            userId: targetUserId,
            role: MembershipRole.OWNER,
            status: MembershipStatus.ACTIVE,
          }),
        updateMany: jest
          .fn()
          .mockResolvedValueOnce({ count: 1 })
          .mockResolvedValueOnce({ count: 1 }),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const observability = {
      organizationDomainEvent: jest.fn(),
    };
    const prisma = {
      $transaction: jest.fn((work: (client: typeof tx) => unknown) => work(tx)),
    } as never;
    const service = new MembershipsService(
      prisma,
      { decisionFor: jest.fn().mockReturnValue('ALLOW') } as never,
      observability as never,
    );

    const result = await service.transferOwnership(
      tenant.organizationId,
      targetId,
      {
        ...tenant,
        organizationRole: MembershipRole.OWNER,
      },
    );

    expect(result).toMatchObject({
      organizationId: tenant.organizationId,
      sourceMembership: {
        id: tenant.membershipId,
        userId: tenant.userId,
        role: MembershipRole.ADMIN,
        status: MembershipStatus.ACTIVE,
      },
      targetMembership: {
        id: targetId,
        userId: targetUserId,
        role: MembershipRole.OWNER,
        status: MembershipStatus.ACTIVE,
      },
    });
    expect(result.transferredAt).toBeInstanceOf(Date);

    expect(observability.organizationDomainEvent).toHaveBeenCalledWith(
      'organization_ownership_transferred',
      {
        ...tenant,
        organizationRole: MembershipRole.OWNER,
      },
      'SUCCESS',
      'OWNERSHIP_TRANSFERRED',
      {
        actorUserId: tenant.userId,
        sourceMembershipId: tenant.membershipId,
        targetMembershipId: targetId,
        sourcePreviousRole: MembershipRole.OWNER,
        sourceNewRole: MembershipRole.ADMIN,
        targetPreviousRole: MembershipRole.ADMIN,
        targetNewRole: MembershipRole.OWNER,
      },
    );
  });

  it('rejects ownership transfer when the actor lacks the dedicated capability', async () => {
    const service = new MembershipsService(
      {} as never,
      { decisionFor: jest.fn().mockReturnValue('DENY') } as never,
      { organizationDomainEvent: jest.fn() } as never,
    );

    await expect(
      service.transferOwnership(
        tenant.organizationId,
        '00000000-0000-4000-8000-000000000004',
        tenant,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects self-target ownership transfer attempts', async () => {
    const tx = {
      organizationMembership: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({
            id: tenant.membershipId,
            userId: tenant.userId,
            role: MembershipRole.OWNER,
            status: MembershipStatus.ACTIVE,
            organization: {
              status: OrganizationStatus.ACTIVE,
            },
          })
          .mockResolvedValueOnce({
            id: tenant.membershipId,
            userId: tenant.userId,
            role: MembershipRole.OWNER,
            status: MembershipStatus.ACTIVE,
          }),
      },
    };
    const prisma = {
      $transaction: jest.fn((work: (client: typeof tx) => unknown) => work(tx)),
    } as never;
    const service = new MembershipsService(
      prisma,
      { decisionFor: jest.fn().mockReturnValue('ALLOW') } as never,
      { organizationDomainEvent: jest.fn() } as never,
    );

    await expect(
      service.transferOwnership(tenant.organizationId, tenant.membershipId, {
        ...tenant,
        organizationRole: MembershipRole.OWNER,
      }),
    ).rejects.toThrow('Ownership transfer target must be another membership');
  });

  it('does not emit success events when an ownership transfer transaction aborts after the write callback completes', async () => {
    const targetId = '00000000-0000-4000-8000-000000000004';
    const targetUserId = '00000000-0000-4000-8000-000000000005';
    const tx = {
      organizationMembership: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({
            id: tenant.membershipId,
            userId: tenant.userId,
            role: MembershipRole.OWNER,
            status: MembershipStatus.ACTIVE,
            organization: {
              status: OrganizationStatus.ACTIVE,
            },
          })
          .mockResolvedValueOnce({
            id: targetId,
            userId: targetUserId,
            role: MembershipRole.ADMIN,
            status: MembershipStatus.ACTIVE,
          })
          .mockResolvedValueOnce({
            id: tenant.membershipId,
            userId: tenant.userId,
            role: MembershipRole.ADMIN,
            status: MembershipStatus.ACTIVE,
          })
          .mockResolvedValueOnce({
            id: targetId,
            userId: targetUserId,
            role: MembershipRole.OWNER,
            status: MembershipStatus.ACTIVE,
          }),
        updateMany: jest
          .fn()
          .mockResolvedValueOnce({ count: 1 })
          .mockResolvedValueOnce({ count: 1 }),
        count: jest.fn().mockResolvedValue(1),
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
    const service = new MembershipsService(
      prisma,
      { decisionFor: jest.fn().mockReturnValue('ALLOW') } as never,
      observability as never,
    );

    await expect(
      service.transferOwnership(tenant.organizationId, targetId, {
        ...tenant,
        organizationRole: MembershipRole.OWNER,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(observability.organizationDomainEvent).not.toHaveBeenCalled();
  });
});
