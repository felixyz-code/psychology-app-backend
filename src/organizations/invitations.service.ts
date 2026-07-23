import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MembershipStatus, Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant-context/tenant-context.types';
import { TenantObservabilityService } from '../tenant-context/tenant-observability.service';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import {
  isUniqueViolation,
  serializableTransaction,
} from './organization-transaction.util';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly observability: TenantObservabilityService,
  ) {}

  async findAll(organizationId: string, tenant: TenantContext) {
    this.assertTenantPath(organizationId, tenant);
    return this.prisma.organizationInvitation.findMany({
      where: { organizationId: tenant.organizationId },
      select: {
        id: true,
        role: true,
        expiresAt: true,
        acceptedAt: true,
        rejectedAt: true,
        revokedAt: true,
        expiredAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(
    organizationId: string,
    dto: CreateInvitationDto,
    tenant: TenantContext,
  ) {
    this.assertTenantPath(organizationId, tenant);
    const normalizedEmail = normalizeEmail(dto.email);
    const token = randomBytes(32).toString('base64url');
    const tokenDigest = digest(token);
    try {
      const invitation = await serializableTransaction(
        this.prisma,
        async (tx) => {
          const now = new Date();
          await this.materializeExpired(
            tx,
            tenant.organizationId,
            normalizedEmail,
            now,
          );
          const invitedUser = await tx.user.findFirst({
            where: { email: dto.email.trim() },
            select: { id: true },
          });
          return tx.organizationInvitation.create({
            data: {
              organizationId: tenant.organizationId,
              email: dto.email.trim(),
              normalizedEmail,
              invitedUserId: invitedUser?.id,
              role: dto.role,
              tokenDigest,
              expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
            },
            select: { id: true, role: true, expiresAt: true, createdAt: true },
          });
        },
      );
      this.observability.organizationDomainEvent(
        'invitation_created',
        tenant,
        'SUCCESS',
        'INVITATION_CREATED',
        invitation.id,
      );
      return {
        ...invitation,
        // The clear token is intentionally returned once only outside production.
        ...(process.env.NODE_ENV !== 'production' && { token }),
      };
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
    return serializableTransaction(this.prisma, async (tx) => {
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
      await this.materializeInvitationIfExpired(tx, invitation, tenant);
      const updated = await tx.organizationInvitation.updateMany({
        where: pendingInvitationWhere(invitation.id),
        data: { revokedAt: new Date() },
      });
      if (updated.count !== 1)
        throw new ConflictException('Invitation is no longer pending');
      this.observability.organizationDomainEvent(
        'invitation_revoked',
        tenant,
        'SUCCESS',
        'INVITATION_REVOKED',
        invitation.id,
      );
      return { id: invitation.id, revokedAt: new Date() };
    });
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
    const tokenDigest = digestValidatedToken(token);
    return serializableTransaction(this.prisma, async (tx) => {
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
        },
      });
      if (!invitation) throw new NotFoundException('Invitation not found');
      const recipient = await tx.user.findFirst({
        where: { id: user.id },
        select: { id: true, email: true },
      });
      if (
        !recipient ||
        normalizeEmail(recipient.email) !== invitation.normalizedEmail ||
        (invitation.invitedUserId && invitation.invitedUserId !== recipient.id)
      ) {
        throw new ForbiddenException(
          'Invitation is not available to this recipient',
        );
      }
      const tenant = {
        userId: recipient.id,
        membershipId: 'not-applicable',
        organizationId: invitation.organizationId,
      };
      await this.materializeInvitationIfExpired(tx, invitation, tenant);
      if (action === 'reject') {
        const updated = await tx.organizationInvitation.updateMany({
          where: pendingInvitationWhere(invitation.id),
          data: { rejectedAt: new Date() },
        });
        if (updated.count !== 1)
          throw new ConflictException('Invitation is no longer pending');
        this.observability.organizationDomainEvent(
          'invitation_rejected',
          tenant,
          'SUCCESS',
          'INVITATION_REJECTED',
          invitation.id,
        );
        return { id: invitation.id, rejectedAt: new Date() };
      }
      const existingMembership = await tx.organizationMembership.findFirst({
        where: {
          organizationId: invitation.organizationId,
          userId: recipient.id,
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
        this.observability.organizationDomainEvent(
          'invitation_accepted',
          tenant,
          'SUCCESS',
          'INVITATION_ACCEPTED',
          invitation.id,
        );
        return membership;
      } catch (error) {
        if (isUniqueViolation(error))
          throw new ConflictException('Membership already exists');
        throw error;
      }
    });
  }

  private async materializeExpired(
    tx: Prisma.TransactionClient,
    organizationId: string,
    normalizedEmail: string,
    now: Date,
  ) {
    const expired = await tx.organizationInvitation.updateMany({
      where: {
        organizationId,
        normalizedEmail,
        expiresAt: { lte: now },
        ...pendingInvitationWhere(),
      },
      data: { expiredAt: now },
    });
    return expired.count;
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
    tenant: { userId: string; membershipId: string; organizationId: string },
  ) {
    if (invitation.expiresAt > new Date() || hasTerminalState(invitation))
      return;
    const updated = await tx.organizationInvitation.updateMany({
      where: pendingInvitationWhere(invitation.id),
      data: { expiredAt: new Date() },
    });
    if (updated.count === 1)
      this.observability.organizationDomainEvent(
        'invitation_expired',
        tenant,
        'SUCCESS',
        'INVITATION_EXPIRED',
        invitation.id,
      );
    throw new ConflictException('Invitation is no longer pending');
  }

  private assertTenantPath(organizationId: string, tenant: TenantContext) {
    if (organizationId !== tenant.organizationId)
      throw new NotFoundException('Organization not found');
  }
}

function normalizeEmail(email: string) {
  return email.trim().toLocaleLowerCase('en-US');
}
function digest(value: string) {
  return createHash('sha256').update(value).digest('hex');
}
function digestValidatedToken(token: string) {
  if (!TOKEN_PATTERN.test(token))
    throw new BadRequestException('Invalid invitation token');
  return digest(token);
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
