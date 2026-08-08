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
import { CapabilityDecision } from '../tenant-context/authorization/organization-capability';
import { MembershipAllowedAction } from './dto/membership-response.dto';
import { MembershipsService } from './memberships.service';

describe('MembershipsService policy boundary', () => {
  const updatedAt = new Date('2026-08-08T12:00:00.000Z');
  const tenant: TenantContext = {
    userId: '00000000-0000-4000-8000-000000000001',
    membershipId: '00000000-0000-4000-8000-000000000002',
    organizationId: '00000000-0000-4000-8000-000000000003',
    organizationRole: MembershipRole.ADMIN,
    legacyUserRole: UserRole.PSYCHOLOGIST,
    resolutionMode: TenantResolutionMode.EXPLICIT,
  };

  it('projects owner actions from the same target policy and protects the last owner', async () => {
    const targets = [
      targetMembership(
        tenant.membershipId,
        tenant.userId,
        MembershipRole.OWNER,
        MembershipStatus.ACTIVE,
      ),
      targetMembership(
        '00000000-0000-4000-8000-000000000004',
        '00000000-0000-4000-8000-000000000005',
        MembershipRole.ADMIN,
        MembershipStatus.ACTIVE,
      ),
      targetMembership(
        '00000000-0000-4000-8000-000000000006',
        '00000000-0000-4000-8000-000000000007',
        MembershipRole.PSYCHOLOGIST,
        MembershipStatus.SUSPENDED,
      ),
      targetMembership(
        '00000000-0000-4000-8000-000000000008',
        '00000000-0000-4000-8000-000000000009',
        MembershipRole.RECEPTIONIST,
        MembershipStatus.INVITED,
      ),
    ];
    const service = membershipListService(targets, 1, CapabilityDecision.ALLOW);

    const result = await service.findAll(tenant.organizationId, {
      ...tenant,
      organizationRole: MembershipRole.OWNER,
    });

    expect(
      result.map(({ id, allowedActions }) => ({ id, allowedActions })),
    ).toEqual([
      { id: tenant.membershipId, allowedActions: [] },
      {
        id: targets[1]?.id,
        allowedActions: [
          MembershipAllowedAction.CHANGE_ROLE,
          MembershipAllowedAction.SUSPEND,
          MembershipAllowedAction.REMOVE,
        ],
      },
      {
        id: targets[2]?.id,
        allowedActions: [
          MembershipAllowedAction.CHANGE_ROLE,
          MembershipAllowedAction.REACTIVATE,
          MembershipAllowedAction.REMOVE,
        ],
      },
      {
        id: targets[3]?.id,
        allowedActions: [MembershipAllowedAction.CHANGE_ROLE],
      },
    ]);
  });

  it('projects conditional admin actions only for eligible non-self non-owner targets', async () => {
    const targets = [
      targetMembership(
        '00000000-0000-4000-8000-000000000004',
        '00000000-0000-4000-8000-000000000005',
        MembershipRole.OWNER,
        MembershipStatus.ACTIVE,
      ),
      targetMembership(
        tenant.membershipId,
        tenant.userId,
        MembershipRole.ADMIN,
        MembershipStatus.ACTIVE,
      ),
      targetMembership(
        '00000000-0000-4000-8000-000000000006',
        '00000000-0000-4000-8000-000000000007',
        MembershipRole.PSYCHOLOGIST,
        MembershipStatus.ACTIVE,
      ),
    ];
    const service = membershipListService(
      targets,
      1,
      CapabilityDecision.CONDITIONAL,
    );

    const result = await service.findAll(tenant.organizationId, tenant);

    expect(result.map(({ allowedActions }) => allowedActions)).toEqual([
      [],
      [],
      [
        MembershipAllowedAction.CHANGE_ROLE,
        MembershipAllowedAction.SUSPEND,
        MembershipAllowedAction.REMOVE,
      ],
    ]);
  });

  it('projects no target actions when the actor policy denies membership mutation', async () => {
    const target = targetMembership(
      '00000000-0000-4000-8000-000000000004',
      '00000000-0000-4000-8000-000000000005',
      MembershipRole.PSYCHOLOGIST,
      MembershipStatus.ACTIVE,
    );
    const service = membershipListService([target], 1, CapabilityDecision.DENY);

    await expect(
      service.findAll(tenant.organizationId, tenant),
    ).resolves.toEqual([expect.objectContaining({ allowedActions: [] })]);
  });

  it('allows a non-last owner to suspend or remove their own membership', async () => {
    const target = targetMembership(
      tenant.membershipId,
      tenant.userId,
      MembershipRole.OWNER,
      MembershipStatus.ACTIVE,
    );
    const service = membershipListService(
      [target],
      2,
      CapabilityDecision.ALLOW,
    );

    await expect(
      service.findAll(tenant.organizationId, {
        ...tenant,
        organizationRole: MembershipRole.OWNER,
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        allowedActions: [
          MembershipAllowedAction.SUSPEND,
          MembershipAllowedAction.REMOVE,
        ],
      }),
    ]);
  });

  it('does not allow an admin to mutate an owner', async () => {
    const tx = {
      organizationMembership: {
        findFirst: jest.fn().mockResolvedValue({
          id: '00000000-0000-4000-8000-000000000004',
          userId: '00000000-0000-4000-8000-000000000005',
          role: MembershipRole.OWNER,
          status: MembershipStatus.ACTIVE,
          updatedAt,
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
        updatedAt.toISOString(),
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
      service.leave(
        '00000000-0000-4000-8000-000000000099',
        updatedAt.toISOString(),
        tenant,
      ),
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
          updatedAt,
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
        updatedAt.toISOString(),
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
          updatedAt,
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
        updatedAt.toISOString(),
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
        updatedAt,
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
        updatedAt.toISOString(),
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

function targetMembership(
  id: string,
  userId: string,
  role: MembershipRole,
  status: MembershipStatus,
) {
  const timestamp = new Date('2026-08-08T12:00:00.000Z');
  return {
    id,
    userId,
    role,
    status,
    joinedAt: status === MembershipStatus.INVITED ? null : timestamp,
    suspendedAt: status === MembershipStatus.SUSPENDED ? timestamp : null,
    revokedAt: status === MembershipStatus.REVOKED ? timestamp : null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function membershipListService(
  targets: ReturnType<typeof targetMembership>[],
  activeOwnerCount: number,
  decision: CapabilityDecision,
) {
  const tx = {
    organizationMembership: {
      findMany: jest.fn().mockResolvedValue(targets),
      count: jest.fn().mockResolvedValue(activeOwnerCount),
    },
  };
  const prisma = {
    $transaction: jest.fn((work: (client: typeof tx) => unknown) => work(tx)),
  };

  return new MembershipsService(
    prisma as never,
    { decisionFor: jest.fn().mockReturnValue(decision) } as never,
    { organizationDomainEvent: jest.fn() } as never,
  );
}
