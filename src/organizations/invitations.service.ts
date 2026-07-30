import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  MembershipRole,
  MembershipStatus,
  OrganizationStatus,
  Prisma,
} from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant-context/tenant-context.types';
import { TenantObservabilityService } from '../tenant-context/tenant-observability.service';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import {
  InvitationLogicalStatus,
  countTerminalInvitationStates,
  deriveInvitationLogicalStatus,
  digestInvitationToken,
  digestValidatedInvitationToken,
  generateInvitationToken,
  normalizeInvitationEmail,
} from './invitation-runtime';
import {
  isUniqueViolation,
  serializableTransaction,
} from './organization-transaction.util';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly observability: TenantObservabilityService,
  ) {}

  async findAll(organizationId: string, tenant: TenantContext) {
    this.assertTenantPath(organizationId, tenant);
    const invitations = await this.prisma.organizationInvitation.findMany({
      where: { organizationId: tenant.organizationId },
      select: {
        id: true,
        email: true,
        role: true,
        expiresAt: true,
        acceptedAt: true,
        rejectedAt: true,
        revokedAt: true,
        expiredAt: true,
        invitedUserId: true,
        acceptedByUserId: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return invitations.map((invitation) =>
      this.buildInvitationAdminResponse(invitation),
    );
  }

  async create(
    organizationId: string,
    dto: CreateInvitationDto,
    tenant: TenantContext,
  ) {
    this.assertTenantPath(organizationId, tenant);
    this.assertInvitationRoleAssignable(dto.role);
    const normalizedEmail = normalizeInvitationEmail(dto.email);
    const token = generateInvitationToken();
    const tokenDigest = digestInvitationToken(token);
    try {
      const result = await serializableTransaction(this.prisma, async (tx) => {
        const now = new Date();
        const expiredEvents = await this.materializeExpired(
          tx,
          tenant.organizationId,
          normalizedEmail,
          now,
        );
        const invitedUser = await this.resolveInvitationRecipientUser(
          tx,
          dto.email,
        );
        if (invitedUser) {
          await this.assertNoNonTerminalMembership(
            tx,
            tenant.organizationId,
            invitedUser.id,
          );
        }
        const invitation = await tx.organizationInvitation.create({
          data: {
            organizationId: tenant.organizationId,
            email: dto.email.trim(),
            normalizedEmail,
            invitedUserId: invitedUser?.id,
            role: dto.role,
            tokenDigest,
            expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
          },
          select: invitationResponseSelect,
        });
        return { invitation, expiredEvents };
      });
      for (const expiredEvent of result.expiredEvents) {
        this.observability.organizationDomainEvent(
          'invitation_expired',
          tenant,
          'SUCCESS',
          'INVITATION_EXPIRED',
          expiredEvent,
        );
      }
      this.observability.organizationDomainEvent(
        'invitation_created',
        tenant,
        'SUCCESS',
        'INVITATION_CREATED',
        {
          targetId: result.invitation.id,
          newRole: result.invitation.role,
        },
      );
      return this.buildInvitationIssueResponse(result.invitation, token);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('A pending invitation already exists');
      }
      throw error;
    }
  }

  async revoke(
    organizationId: string,
    invitationId: string,
    tenant: TenantContext,
  ) {
    this.assertTenantPath(organizationId, tenant);
    const result = await serializableTransaction(this.prisma, async (tx) => {
      const invitation = await tx.organizationInvitation.findFirst({
        where: { id: invitationId, organizationId: tenant.organizationId },
        select: {
          id: true,
          expiresAt: true,
          acceptedAt: true,
          rejectedAt: true,
          revokedAt: true,
          expiredAt: true,
        },
      });
      if (!invitation) throw new NotFoundException('Invitation not found');
      const expiredEvent = await this.materializeInvitationIfExpired(
        tx,
        invitation,
      );
      if (expiredEvent) return { expired: true as const, expiredEvent };
      const updated = await tx.organizationInvitation.updateMany({
        where: pendingInvitationWhere(invitation.id),
        data: { revokedAt: new Date() },
      });
      if (updated.count !== 1)
        throw new ConflictException('Invitation is no longer pending');
      const revokedAt = new Date();
      return {
        expired: false as const,
        value: {
          id: invitation.id,
          revokedAt,
          logicalStatus: InvitationLogicalStatus.REVOKED,
        },
        eventMetadata: {
          targetId: invitation.id,
          previousStatus: InvitationLogicalStatus.PENDING,
          newStatus: InvitationLogicalStatus.REVOKED,
        },
      };
    });
    if (result.expired) {
      this.observability.organizationDomainEvent(
        'invitation_expired',
        tenant,
        'SUCCESS',
        'INVITATION_EXPIRED',
        result.expiredEvent,
      );
      throw new ConflictException('Invitation is no longer pending');
    }
    this.observability.organizationDomainEvent(
      'invitation_revoked',
      tenant,
      'SUCCESS',
      'INVITATION_REVOKED',
      result.eventMetadata,
    );
    return result.value;
  }

  async resend(
    organizationId: string,
    invitationId: string,
    tenant: TenantContext,
  ) {
    this.assertTenantPath(organizationId, tenant);
    try {
      const result = await serializableTransaction(this.prisma, async (tx) => {
        const target = await tx.organizationInvitation.findFirst({
          where: { id: invitationId, organizationId: tenant.organizationId },
          select: invitationResponseSelect,
        });
        if (!target) throw new NotFoundException('Invitation not found');

        const now = new Date();
        const logicalStatus = deriveInvitationLogicalStatus(target, now);
        if (
          logicalStatus === InvitationLogicalStatus.ACCEPTED ||
          logicalStatus === InvitationLogicalStatus.REJECTED ||
          logicalStatus === InvitationLogicalStatus.REVOKED
        ) {
          throw new ConflictException('Invitation is not eligible for resend');
        }

        let expiredEvent: { targetId: string } | null = null;
        if (
          logicalStatus === InvitationLogicalStatus.EXPIRED &&
          target.expiredAt === null
        ) {
          expiredEvent = await this.materializeInvitationIfExpired(
            tx,
            target,
            now,
          );
          if (!expiredEvent)
            throw new ConflictException('Invitation is no longer pending');
        }

        if (logicalStatus === InvitationLogicalStatus.PENDING) {
          const updated = await tx.organizationInvitation.updateMany({
            where: pendingInvitationWhere(target.id),
            data: { revokedAt: now },
          });
          if (updated.count !== 1)
            throw new ConflictException('Invitation is no longer pending');
        }

        const invitedUser = await this.resolveInvitationRecipientUser(
          tx,
          target.email,
        );
        if (
          target.invitedUserId &&
          invitedUser &&
          invitedUser.id !== target.invitedUserId
        ) {
          throw new ConflictException(
            'Invitation recipient identity is ambiguous',
          );
        }
        const nextInvitedUserId =
          target.invitedUserId && invitedUser?.id === target.invitedUserId
            ? target.invitedUserId
            : target.invitedUserId
              ? null
              : (invitedUser?.id ?? null);

        if (nextInvitedUserId) {
          await this.assertNoNonTerminalMembership(
            tx,
            tenant.organizationId,
            nextInvitedUserId,
          );
        }

        const nextToken = generateInvitationToken();
        const nextInvitation = await tx.organizationInvitation.create({
          data: {
            organizationId: tenant.organizationId,
            email: target.email,
            normalizedEmail: target.normalizedEmail,
            invitedUserId: nextInvitedUserId,
            role: target.role,
            tokenDigest: digestInvitationToken(nextToken),
            expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
          },
          select: invitationResponseSelect,
        });

        return {
          invitation: nextInvitation,
          token: nextToken,
          expiredEvent,
          eventMetadata: {
            targetId: nextInvitation.id,
            previousInvitationId: target.id,
            newInvitationId: nextInvitation.id,
            previousStatus: logicalStatus,
            newStatus: InvitationLogicalStatus.PENDING,
            newRole: nextInvitation.role,
          },
        };
      });

      if (result.expiredEvent) {
        this.observability.organizationDomainEvent(
          'invitation_expired',
          tenant,
          'SUCCESS',
          'INVITATION_EXPIRED',
          result.expiredEvent,
        );
      }
      this.observability.organizationDomainEvent(
        'invitation_resent',
        tenant,
        'SUCCESS',
        'INVITATION_RESENT',
        result.eventMetadata,
      );

      return this.buildInvitationIssueResponse(result.invitation, result.token);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('A pending invitation already exists');
      }
      throw error;
    }
  }

  async accept(token: string, user: AuthenticatedUser) {
    return this.complete(token, user, 'accept');
  }

  async reject(token: string, user: AuthenticatedUser) {
    return this.complete(token, user, 'reject');
  }

  private async complete(
    token: string,
    user: AuthenticatedUser,
    action: 'accept' | 'reject',
  ) {
    const tokenDigest = digestValidatedInvitationToken(token);
    const result = await serializableTransaction(this.prisma, async (tx) => {
      const invitation = await tx.organizationInvitation.findFirst({
        where: { tokenDigest },
        select: {
          id: true,
          organizationId: true,
          normalizedEmail: true,
          invitedUserId: true,
          role: true,
          expiresAt: true,
          acceptedAt: true,
          rejectedAt: true,
          revokedAt: true,
          expiredAt: true,
          organization: { select: { status: true } },
        },
      });
      if (!invitation) throw new NotFoundException('Invitation not found');
      const recipient = await tx.user.findFirst({
        where: { id: user.id },
        select: { id: true, email: true },
      });
      if (
        !recipient ||
        normalizeInvitationEmail(recipient.email) !==
          invitation.normalizedEmail ||
        (invitation.invitedUserId && invitation.invitedUserId !== recipient.id)
      ) {
        throw new ForbiddenException(
          'Invitation is not available to this recipient',
        );
      }
      if (invitation.organization.status !== OrganizationStatus.ACTIVE) {
        throw new ConflictException('Organization is not active');
      }
      const tenant = {
        userId: recipient.id,
        membershipId: 'not-applicable',
        organizationId: invitation.organizationId,
      };
      const expiredEvent = await this.materializeInvitationIfExpired(
        tx,
        invitation,
      );
      if (expiredEvent) {
        return {
          expired: true as const,
          expiredTenant: tenant,
          expiredEvent,
        };
      }
      if (action === 'reject') {
        const rejectedAt = new Date();
        const updated = await tx.organizationInvitation.updateMany({
          where: pendingInvitationWhere(invitation.id),
          data: { rejectedAt },
        });
        if (updated.count !== 1)
          throw new ConflictException('Invitation is no longer pending');
        return {
          expired: false as const,
          value: { id: invitation.id, rejectedAt },
          event: 'invitation_rejected' as const,
          eventTenant: tenant,
          reasonCode: 'INVITATION_REJECTED' as const,
          eventMetadata: {
            targetId: invitation.id,
            targetUserId: recipient.id,
            previousStatus: InvitationLogicalStatus.PENDING,
            newStatus: InvitationLogicalStatus.REJECTED,
            newRole: invitation.role,
          },
        };
      }
      const existingMembership = await tx.organizationMembership.findFirst({
        where: {
          organizationId: invitation.organizationId,
          userId: recipient.id,
          status: {
            in: [
              MembershipStatus.INVITED,
              MembershipStatus.ACTIVE,
              MembershipStatus.SUSPENDED,
            ],
          },
        },
        select: { id: true },
      });
      if (existingMembership)
        throw new ConflictException('Membership already exists');
      const acceptedAt = new Date();
      const updated = await tx.organizationInvitation.updateMany({
        where: pendingInvitationWhere(invitation.id),
        data: { acceptedAt, acceptedByUserId: recipient.id },
      });
      if (updated.count !== 1)
        throw new ConflictException('Invitation is no longer pending');
      try {
        const membership = await tx.organizationMembership.create({
          data: {
            organizationId: invitation.organizationId,
            userId: recipient.id,
            role: invitation.role,
            status: MembershipStatus.ACTIVE,
            joinedAt: acceptedAt,
          },
          select: {
            id: true,
            organizationId: true,
            role: true,
            status: true,
            joinedAt: true,
          },
        });
        return {
          expired: false as const,
          value: membership,
          event: 'invitation_accepted' as const,
          eventTenant: tenant,
          reasonCode: 'INVITATION_ACCEPTED' as const,
          eventMetadata: {
            targetId: invitation.id,
            targetUserId: recipient.id,
            previousStatus: InvitationLogicalStatus.PENDING,
            newStatus: InvitationLogicalStatus.ACCEPTED,
            newRole: invitation.role,
          },
        };
      } catch (error) {
        if (isUniqueViolation(error))
          throw new ConflictException('Membership already exists');
        throw error;
      }
    });
    if (result.expired) {
      this.observability.organizationDomainEvent(
        'invitation_expired',
        result.expiredTenant,
        'SUCCESS',
        'INVITATION_EXPIRED',
        result.expiredEvent,
      );
      throw new ConflictException('Invitation is no longer pending');
    }
    this.observability.organizationDomainEvent(
      result.event,
      result.eventTenant,
      'SUCCESS',
      result.reasonCode,
      result.eventMetadata,
    );
    return result.value;
  }

  private async materializeExpired(
    tx: Prisma.TransactionClient,
    organizationId: string,
    normalizedEmail: string,
    now: Date,
  ) {
    const pendingExpiredInvitations = await tx.organizationInvitation.findMany({
      where: {
        organizationId,
        normalizedEmail,
        expiresAt: { lte: now },
        ...pendingInvitationWhere(),
      },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    if (pendingExpiredInvitations.length === 0) {
      return [];
    }

    await tx.organizationInvitation.updateMany({
      where: {
        id: {
          in: pendingExpiredInvitations.map((invitation) => invitation.id),
        },
        ...pendingInvitationWhere(),
      },
      data: { expiredAt: now },
    });

    const materializedInvitations = await tx.organizationInvitation.findMany({
      where: {
        id: {
          in: pendingExpiredInvitations.map((invitation) => invitation.id),
        },
        expiredAt: { not: null },
      },
      select: { id: true },
      orderBy: { id: 'asc' },
    });

    return materializedInvitations.map((invitation) => ({
      targetId: invitation.id,
    }));
  }

  private async materializeInvitationIfExpired(
    tx: Prisma.TransactionClient,
    invitation: {
      id: string;
      expiresAt: Date;
      acceptedAt: Date | null;
      rejectedAt: Date | null;
      revokedAt: Date | null;
      expiredAt: Date | null;
    },
    now: Date = new Date(),
  ) {
    if (invitation.expiresAt > now || hasTerminalState(invitation)) {
      return null;
    }
    const updated = await tx.organizationInvitation.updateMany({
      where: pendingInvitationWhere(invitation.id),
      data: { expiredAt: now },
    });
    if (updated.count === 1) {
      return {
        targetId: invitation.id,
      };
    }
    return null;
  }

  private assertTenantPath(organizationId: string, tenant: TenantContext) {
    if (organizationId !== tenant.organizationId)
      throw new NotFoundException('Organization not found');
  }

  private assertInvitationRoleAssignable(role: MembershipRole) {
    if (role === MembershipRole.OWNER) {
      throw new BadRequestException('Invitation role is not assignable');
    }
  }

  private async resolveInvitationRecipientUser(
    tx: Prisma.TransactionClient,
    email: string,
  ) {
    const canonicalEmail = normalizeInvitationEmail(email);
    const users = await tx.user.findMany({
      where: {
        email: {
          equals: email.trim(),
          mode: 'insensitive',
        },
      },
      select: { id: true, email: true },
      orderBy: { id: 'asc' },
    });
    const matchingUsers = users.filter(
      (user) => normalizeInvitationEmail(user.email) === canonicalEmail,
    );
    if (matchingUsers.length > 1) {
      throw new ConflictException('Invitation recipient identity is ambiguous');
    }
    return matchingUsers[0] ?? null;
  }

  private async assertNoNonTerminalMembership(
    tx: Prisma.TransactionClient,
    organizationId: string,
    userId: string,
  ) {
    const membership = await tx.organizationMembership.findFirst({
      where: {
        organizationId,
        userId,
        status: {
          in: [
            MembershipStatus.INVITED,
            MembershipStatus.ACTIVE,
            MembershipStatus.SUSPENDED,
          ],
        },
      },
      select: { id: true },
    });
    if (membership) {
      throw new ConflictException('Membership already exists');
    }
  }

  private buildInvitationAdminResponse(invitation: InvitationAdminProjection) {
    const terminalStates = countTerminalInvitationStates(invitation);
    if (terminalStates > 1) {
      this.logger.warn(
        `Invitation ${invitation.id} has ${terminalStates} terminal timestamps; applying deterministic logicalStatus precedence`,
      );
    }
    return {
      ...invitation,
      logicalStatus: deriveInvitationLogicalStatus(invitation),
    };
  }

  private buildInvitationIssueResponse(
    invitation: Prisma.OrganizationInvitationGetPayload<{
      select: typeof invitationResponseSelect;
    }>,
    token: string,
  ) {
    return {
      ...this.buildInvitationAdminResponse(invitation),
      ...(process.env.NODE_ENV !== 'production' && { token }),
    };
  }
}
function hasTerminalState(invitation: {
  acceptedAt: Date | null;
  rejectedAt: Date | null;
  revokedAt: Date | null;
  expiredAt: Date | null;
}) {
  return Boolean(
    invitation.acceptedAt ||
    invitation.rejectedAt ||
    invitation.revokedAt ||
    invitation.expiredAt,
  );
}
function pendingInvitationWhere(
  id?: string,
): Prisma.OrganizationInvitationWhereInput {
  return {
    ...(id && { id }),
    acceptedAt: null,
    rejectedAt: null,
    revokedAt: null,
    expiredAt: null,
  };
}

const invitationResponseSelect = {
  id: true,
  email: true,
  normalizedEmail: true,
  role: true,
  expiresAt: true,
  acceptedAt: true,
  acceptedByUserId: true,
  rejectedAt: true,
  revokedAt: true,
  expiredAt: true,
  invitedUserId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.OrganizationInvitationSelect;

type InvitationAdminProjection = {
  id: string;
  email: string;
  role: MembershipRole;
  expiresAt: Date;
  acceptedAt: Date | null;
  acceptedByUserId: string | null;
  rejectedAt: Date | null;
  revokedAt: Date | null;
  expiredAt: Date | null;
  invitedUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};
