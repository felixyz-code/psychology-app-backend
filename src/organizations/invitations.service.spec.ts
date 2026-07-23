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
});
