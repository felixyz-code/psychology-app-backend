import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { MembershipRole, Prisma, UserRole } from '@prisma/client';
import {
  TenantResolutionMode,
  type TenantContext,
} from '../common/request-context/request-context.service';
import { InvitationsService } from './invitations.service';

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

  it('rejects malformed tokens before querying persistence', async () => {
    const transaction = jest.fn();
    const prisma = { $transaction: transaction } as never;
    const service = new InvitationsService(prisma, observability as never);
    await expect(
      service.accept('malformed', { id: tenant.userId } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('returns conflict when the pending invitation unique key rejects creation', async () => {
    const prisma = {
      $transaction: jest.fn((work: (tx: unknown) => unknown) =>
        work({
          organizationInvitation: {
            updateMany: jest.fn().mockResolvedValue({ count: 0 }),
            create: jest.fn().mockRejectedValue(
              new Prisma.PrismaClientKnownRequestError('duplicate', {
                code: 'P2002',
                clientVersion: 'test',
              }),
            ),
          },
          user: { findFirst: jest.fn() },
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

  it('rejects an invitation targeted at another organization path', async () => {
    const service = new InvitationsService({} as never, observability as never);
    await expect(
      service.findAll('00000000-0000-4000-8000-000000000099', tenant),
    ).rejects.toBeInstanceOf(NotFoundException);
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
      invitation.id,
    );
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
