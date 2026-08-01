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
import { InvitationsService } from './invitations.service';
import { InvitationLogicalStatus } from './invitation-runtime';

describe('InvitationsService', () => {
  const tenant: TenantContext = {
    userId: '00000000-0000-4000-8000-000000000001',
    membershipId: '00000000-0000-4000-8000-000000000002',
    organizationId: '00000000-0000-4000-8000-000000000003',
    organizationRole: MembershipRole.OWNER,
    legacyUserRole: UserRole.PSYCHOLOGIST,
    resolutionMode: TenantResolutionMode.EXPLICIT,
  };
  const observability = { organizationDomainEvent: jest.fn() };

  beforeEach(() => {
    observability.organizationDomainEvent.mockReset();
  });

  it('rejects malformed tokens before querying persistence', async () => {
    const transaction = jest.fn();
    const prisma = { $transaction: transaction } as never;
    const service = new InvitationsService(prisma, observability as never);

    await expect(
      service.accept('malformed', { id: tenant.userId } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects OWNER invitations even when the service is called directly', async () => {
    const service = new InvitationsService({} as never, observability as never);

    await expect(
      service.create(
        tenant.organizationId,
        { email: 'owner@example.test', role: MembershipRole.OWNER },
        tenant,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns conflict when the pending invitation unique key rejects creation', async () => {
    const prisma = {
      $transaction: jest.fn((work: (tx: unknown) => unknown) =>
        work({
          organizationInvitation: {
            findMany: jest
              .fn()
              .mockResolvedValueOnce([])
              .mockResolvedValueOnce([]),
            updateMany: jest.fn().mockResolvedValue({ count: 0 }),
            create: jest.fn().mockRejectedValue(
              new Prisma.PrismaClientKnownRequestError('duplicate', {
                code: 'P2002',
                clientVersion: 'test',
              }),
            ),
          },
          user: { findUnique: jest.fn().mockResolvedValue(null) },
          organizationMembership: {
            findFirst: jest.fn().mockResolvedValue(null),
          },
        }),
      ),
    } as never;
    const service = new InvitationsService(prisma, observability as never);

    await expect(
      service.create(
        tenant.organizationId,
        { email: 'invitee@example.test', role: MembershipRole.PSYCHOLOGIST },
        tenant,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('emits invitation_expired after create materializes an expired pending invitation', async () => {
    const expiredInvitationId = '00000000-0000-4000-8000-000000000090';
    const createdInvitationId = '00000000-0000-4000-8000-000000000091';
    const prisma = {
      $transaction: jest.fn((work: (tx: unknown) => unknown) =>
        work({
          organizationInvitation: {
            findMany: jest
              .fn()
              .mockResolvedValueOnce([{ id: expiredInvitationId }])
              .mockResolvedValueOnce([{ id: expiredInvitationId }]),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            create: jest.fn().mockResolvedValue({
              id: createdInvitationId,
              email: 'recipient@example.test',
              normalizedEmail: 'recipient@example.test',
              role: MembershipRole.PSYCHOLOGIST,
              expiresAt: new Date('2026-08-10T00:00:00.000Z'),
              acceptedAt: null,
              acceptedByUserId: null,
              rejectedAt: null,
              revokedAt: null,
              expiredAt: null,
              invitedUserId: null,
              createdAt: new Date('2026-08-03T00:00:00.000Z'),
              updatedAt: new Date('2026-08-03T00:00:00.000Z'),
            }),
          },
          user: { findUnique: jest.fn().mockResolvedValue(null) },
          organizationMembership: {
            findFirst: jest.fn().mockResolvedValue(null),
          },
        }),
      ),
    } as never;
    const service = new InvitationsService(prisma, observability as never);

    await expect(
      service.create(
        tenant.organizationId,
        { email: 'recipient@example.test', role: MembershipRole.PSYCHOLOGIST },
        tenant,
      ),
    ).resolves.toMatchObject({
      id: createdInvitationId,
      logicalStatus: InvitationLogicalStatus.PENDING,
    });

    expect(observability.organizationDomainEvent).toHaveBeenNthCalledWith(
      1,
      'invitation_expired',
      tenant,
      'SUCCESS',
      'INVITATION_EXPIRED',
      { targetId: expiredInvitationId },
    );
    expect(observability.organizationDomainEvent).toHaveBeenNthCalledWith(
      2,
      'invitation_created',
      tenant,
      'SUCCESS',
      'INVITATION_CREATED',
      expect.objectContaining({ targetId: createdInvitationId }),
    );
  });

  it('rejects creation when the known recipient already has a non-terminal membership', async () => {
    const prisma = {
      $transaction: jest.fn((work: (tx: unknown) => unknown) =>
        work({
          organizationInvitation: {
            findMany: jest
              .fn()
              .mockResolvedValueOnce([])
              .mockResolvedValueOnce([]),
            updateMany: jest.fn().mockResolvedValue({ count: 0 }),
            create: jest.fn(),
          },
          user: {
            findUnique: jest.fn().mockResolvedValue({
              id: '00000000-0000-4000-8000-000000000004',
              email: 'recipient@example.test',
            }),
          },
          organizationMembership: {
            findFirst: jest
              .fn()
              .mockResolvedValue({ id: 'existing-membership' }),
          },
        }),
      ),
    } as never;
    const service = new InvitationsService(prisma, observability as never);

    await expect(
      service.create(
        tenant.organizationId,
        {
          email: ' Recipient@Example.test ',
          role: MembershipRole.PSYCHOLOGIST,
        },
        tenant,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects an invitation targeted at another organization path', async () => {
    const service = new InvitationsService({} as never, observability as never);

    await expect(
      service.findAll('00000000-0000-4000-8000-000000000099', tenant),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('maps invitation list rows to a sanitized admin response with logicalStatus', async () => {
    const prisma = {
      organizationInvitation: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: '00000000-0000-4000-8000-000000000010',
            email: 'accepted@example.test',
            role: MembershipRole.ADMIN,
            expiresAt: new Date('2026-08-10T00:00:00.000Z'),
            acceptedAt: new Date('2026-08-01T00:00:00.000Z'),
            acceptedByUserId: '00000000-0000-4000-8000-000000000011',
            rejectedAt: null,
            revokedAt: null,
            expiredAt: null,
            invitedUserId: '00000000-0000-4000-8000-000000000012',
            createdAt: new Date('2026-08-01T00:00:00.000Z'),
            updatedAt: new Date('2026-08-01T00:00:00.000Z'),
          },
          {
            id: '00000000-0000-4000-8000-000000000013',
            email: 'pending@example.test',
            role: MembershipRole.PSYCHOLOGIST,
            expiresAt: new Date('2026-08-30T00:00:00.000Z'),
            acceptedAt: null,
            acceptedByUserId: null,
            rejectedAt: null,
            revokedAt: null,
            expiredAt: null,
            invitedUserId: null,
            createdAt: new Date('2026-08-02T00:00:00.000Z'),
            updatedAt: new Date('2026-08-02T00:00:00.000Z'),
          },
        ]),
      },
    } as never;
    const service = new InvitationsService(prisma, observability as never);

    await expect(
      service.findAll(tenant.organizationId, tenant),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: '00000000-0000-4000-8000-000000000010',
          email: 'accepted@example.test',
          logicalStatus: InvitationLogicalStatus.ACCEPTED,
        }),
        expect.objectContaining({
          id: '00000000-0000-4000-8000-000000000013',
          email: 'pending@example.test',
          logicalStatus: InvitationLogicalStatus.PENDING,
        }),
      ]),
    );
  });

  it('materializes an expired invitation before returning the accept conflict', async () => {
    const recipientId = '00000000-0000-4000-8000-000000000004';
    const invitation = {
      id: '00000000-0000-4000-8000-000000000005',
      organizationId: tenant.organizationId,
      normalizedEmail: 'recipient@example.test',
      invitedUserId: recipientId,
      role: MembershipRole.PSYCHOLOGIST,
      expiresAt: new Date(Date.now() - 60_000),
      acceptedAt: null,
      rejectedAt: null,
      revokedAt: null,
      expiredAt: null,
      organization: { status: OrganizationStatus.ACTIVE },
    };
    let updateArgument: unknown;
    const updateMany = jest.fn((argument: unknown) => {
      updateArgument = argument;
      return Promise.resolve({ count: 1 });
    });
    const prisma = {
      $transaction: jest.fn((work: (tx: unknown) => unknown) =>
        work({
          organizationInvitation: {
            findFirst: jest.fn().mockResolvedValue(invitation),
            updateMany,
          },
          user: {
            findFirst: jest.fn().mockResolvedValue({
              id: recipientId,
              email: 'recipient@example.test',
            }),
          },
        }),
      ),
    } as never;
    const service = new InvitationsService(prisma, observability as never);

    await expect(
      service.accept('A'.repeat(43), { id: recipientId } as never),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(hasMaterializedExpiration(updateArgument)).toBe(true);
    expect(observability.organizationDomainEvent).toHaveBeenCalledWith(
      'invitation_expired',
      expect.objectContaining({ organizationId: tenant.organizationId }),
      'SUCCESS',
      'INVITATION_EXPIRED',
      expect.objectContaining({ targetId: invitation.id }),
    );
  });

  it('creates a new active membership when only revoked history exists for the recipient', async () => {
    const recipientId = '00000000-0000-4000-8000-000000000004';
    const invitationId = '00000000-0000-4000-8000-000000000005';
    const acceptedAt = new Date('2026-07-29T03:00:00.000Z');
    jest.useFakeTimers().setSystemTime(acceptedAt);
    const prisma = {
      $transaction: jest.fn((work: (tx: unknown) => unknown) =>
        work({
          organizationInvitation: {
            findFirst: jest.fn().mockResolvedValue({
              id: invitationId,
              organizationId: tenant.organizationId,
              normalizedEmail: 'recipient@example.test',
              invitedUserId: recipientId,
              role: MembershipRole.PSYCHOLOGIST,
              expiresAt: new Date('2026-08-05T03:00:00.000Z'),
              acceptedAt: null,
              rejectedAt: null,
              revokedAt: null,
              expiredAt: null,
              organization: { status: OrganizationStatus.ACTIVE },
            }),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          },
          user: {
            findFirst: jest.fn().mockResolvedValue({
              id: recipientId,
              email: 'recipient@example.test',
            }),
          },
          organizationMembership: {
            findFirst: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue({
              id: '00000000-0000-4000-8000-000000000006',
              organizationId: tenant.organizationId,
              role: MembershipRole.PSYCHOLOGIST,
              status: 'ACTIVE',
              joinedAt: acceptedAt,
            }),
          },
        }),
      ),
    } as never;

    const service = new InvitationsService(prisma, observability as never);

    await expect(
      service.accept('A'.repeat(43), { id: recipientId } as never),
    ).resolves.toMatchObject({
      organizationId: tenant.organizationId,
      role: MembershipRole.PSYCHOLOGIST,
      status: 'ACTIVE',
      joinedAt: acceptedAt,
    });

    jest.useRealTimers();
  });

  it.each(['INVITED', 'ACTIVE', 'SUSPENDED'])(
    'rejects invitation acceptance when a %s membership already exists',
    async () => {
      const recipientId = '00000000-0000-4000-8000-000000000004';
      const prisma = {
        $transaction: jest.fn((work: (tx: unknown) => unknown) =>
          work({
            organizationInvitation: {
              findFirst: jest.fn().mockResolvedValue({
                id: '00000000-0000-4000-8000-000000000005',
                organizationId: tenant.organizationId,
                normalizedEmail: 'recipient@example.test',
                invitedUserId: recipientId,
                role: MembershipRole.PSYCHOLOGIST,
                expiresAt: new Date('2026-08-05T03:00:00.000Z'),
                acceptedAt: null,
                rejectedAt: null,
                revokedAt: null,
                expiredAt: null,
                organization: { status: OrganizationStatus.ACTIVE },
              }),
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            user: {
              findFirst: jest.fn().mockResolvedValue({
                id: recipientId,
                email: 'recipient@example.test',
              }),
            },
            organizationMembership: {
              findFirst: jest
                .fn()
                .mockResolvedValue({ id: 'existing-membership' }),
            },
          }),
        ),
      } as never;

      const service = new InvitationsService(prisma, observability as never);

      await expect(
        service.accept('A'.repeat(43), { id: recipientId } as never),
      ).rejects.toBeInstanceOf(ConflictException);
    },
  );

  it('replaces a pending invitation during resend and emits a post-commit resent event', async () => {
    const targetInvitationId = '00000000-0000-4000-8000-000000000005';
    const nextInvitationId = '00000000-0000-4000-8000-000000000006';
    const create = jest.fn().mockResolvedValue({
      id: nextInvitationId,
      email: 'recipient@example.test',
      role: MembershipRole.PSYCHOLOGIST,
      expiresAt: new Date('2026-08-10T00:00:00.000Z'),
      acceptedAt: null,
      acceptedByUserId: null,
      rejectedAt: null,
      revokedAt: null,
      expiredAt: null,
      invitedUserId: null,
      createdAt: new Date('2026-08-03T00:00:00.000Z'),
      updatedAt: new Date('2026-08-03T00:00:00.000Z'),
    });
    const prisma = {
      $transaction: jest.fn((work: (tx: unknown) => unknown) =>
        work({
          organizationInvitation: {
            findFirst: jest.fn().mockResolvedValue({
              id: targetInvitationId,
              email: 'recipient@example.test',
              role: MembershipRole.PSYCHOLOGIST,
              expiresAt: new Date('2026-08-04T00:00:00.000Z'),
              acceptedAt: null,
              acceptedByUserId: null,
              rejectedAt: null,
              revokedAt: null,
              expiredAt: null,
              invitedUserId: null,
              createdAt: new Date('2026-08-01T00:00:00.000Z'),
              updatedAt: new Date('2026-08-01T00:00:00.000Z'),
              normalizedEmail: 'recipient@example.test',
            }),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            create,
          },
          user: {
            findUnique: jest.fn().mockResolvedValue(null),
          },
          organizationMembership: {
            findFirst: jest.fn().mockResolvedValue(null),
          },
        }),
      ),
    } as never;
    const service = new InvitationsService(prisma, observability as never);

    const resent = await service.resend(
      tenant.organizationId,
      targetInvitationId,
      tenant,
    );

    expect(resent).toMatchObject({
      id: nextInvitationId,
      email: 'recipient@example.test',
      logicalStatus: InvitationLogicalStatus.PENDING,
    });
    expect(resent.token).toEqual(expect.any(String));

    expect(create).toHaveBeenCalledTimes(1);
    expect(observability.organizationDomainEvent).toHaveBeenCalledWith(
      'invitation_resent',
      tenant,
      'SUCCESS',
      'INVITATION_RESENT',
      expect.objectContaining({
        previousInvitationId: targetInvitationId,
        newInvitationId: nextInvitationId,
      }),
    );
  });

  it('materializes a logically expired invitation before resend and emits expiration plus resend events', async () => {
    const targetInvitationId = '00000000-0000-4000-8000-000000000105';
    const nextInvitationId = '00000000-0000-4000-8000-000000000106';
    const prisma = {
      $transaction: jest.fn((work: (tx: unknown) => unknown) =>
        work({
          organizationInvitation: {
            findFirst: jest.fn().mockResolvedValue({
              id: targetInvitationId,
              email: 'recipient@example.test',
              role: MembershipRole.PSYCHOLOGIST,
              expiresAt: new Date('2026-07-01T00:00:00.000Z'),
              acceptedAt: null,
              acceptedByUserId: null,
              rejectedAt: null,
              revokedAt: null,
              expiredAt: null,
              invitedUserId: null,
              createdAt: new Date('2026-06-24T00:00:00.000Z'),
              updatedAt: new Date('2026-06-24T00:00:00.000Z'),
              normalizedEmail: 'recipient@example.test',
            }),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            create: jest.fn().mockResolvedValue({
              id: nextInvitationId,
              email: 'recipient@example.test',
              normalizedEmail: 'recipient@example.test',
              role: MembershipRole.PSYCHOLOGIST,
              expiresAt: new Date('2026-08-10T00:00:00.000Z'),
              acceptedAt: null,
              acceptedByUserId: null,
              rejectedAt: null,
              revokedAt: null,
              expiredAt: null,
              invitedUserId: null,
              createdAt: new Date('2026-08-03T00:00:00.000Z'),
              updatedAt: new Date('2026-08-03T00:00:00.000Z'),
            }),
          },
          user: {
            findUnique: jest.fn().mockResolvedValue(null),
          },
          organizationMembership: {
            findFirst: jest.fn().mockResolvedValue(null),
          },
        }),
      ),
    } as never;
    const service = new InvitationsService(prisma, observability as never);

    const resent = await service.resend(
      tenant.organizationId,
      targetInvitationId,
      tenant,
    );

    expect(resent).toMatchObject({
      id: nextInvitationId,
      logicalStatus: InvitationLogicalStatus.PENDING,
    });
    expect(observability.organizationDomainEvent).toHaveBeenNthCalledWith(
      1,
      'invitation_expired',
      tenant,
      'SUCCESS',
      'INVITATION_EXPIRED',
      { targetId: targetInvitationId },
    );
    expect(observability.organizationDomainEvent).toHaveBeenNthCalledWith(
      2,
      'invitation_resent',
      tenant,
      'SUCCESS',
      'INVITATION_RESENT',
      expect.objectContaining({
        previousInvitationId: targetInvitationId,
        newInvitationId: nextInvitationId,
        previousStatus: InvitationLogicalStatus.EXPIRED,
      }),
    );
  });

  it('does not emit success events when invitation acceptance aborts after the write callback completes', async () => {
    const recipientId = '00000000-0000-4000-8000-000000000004';
    const isolatedObservability = { organizationDomainEvent: jest.fn() };
    const tx = {
      organizationInvitation: {
        findFirst: jest.fn().mockResolvedValue({
          id: '00000000-0000-4000-8000-000000000005',
          organizationId: tenant.organizationId,
          normalizedEmail: 'recipient@example.test',
          invitedUserId: recipientId,
          role: MembershipRole.PSYCHOLOGIST,
          expiresAt: new Date('2026-08-05T03:00:00.000Z'),
          acceptedAt: null,
          rejectedAt: null,
          revokedAt: null,
          expiredAt: null,
          organization: { status: OrganizationStatus.ACTIVE },
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: recipientId,
          email: 'recipient@example.test',
        }),
      },
      organizationMembership: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: '00000000-0000-4000-8000-000000000006',
          organizationId: tenant.organizationId,
          role: MembershipRole.PSYCHOLOGIST,
          status: 'ACTIVE',
          joinedAt: new Date('2026-07-29T03:00:00.000Z'),
        }),
      },
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
    const service = new InvitationsService(
      prisma,
      isolatedObservability as never,
    );

    await expect(
      service.accept('A'.repeat(43), { id: recipientId } as never),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(
      isolatedObservability.organizationDomainEvent,
    ).not.toHaveBeenCalled();
  });
});

function hasMaterializedExpiration(
  value: unknown,
): value is { data: { expiredAt: Date } } {
  if (!value || typeof value !== 'object') return false;
  const data = (value as { data?: unknown }).data;
  return (
    Boolean(data) &&
    typeof data === 'object' &&
    (data as { expiredAt?: unknown }).expiredAt instanceof Date
  );
}
