import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MembershipRole, MembershipStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CapabilityDecision,
  OrganizationCapability,
} from '../tenant-context/authorization/organization-capability';
import { OrganizationPolicyService } from '../tenant-context/authorization/organization-policy.service';
import { TenantContext } from '../tenant-context/tenant-context.types';
import { TenantObservabilityService } from '../tenant-context/tenant-observability.service';
import { serializableTransaction } from './organization-transaction.util';

const roleRank: Readonly<Record<MembershipRole, number>> = {
  OWNER: 6,
  ADMIN: 5,
  PSYCHOLOGIST: 4,
  RECEPTIONIST: 3,
  BILLING: 2,
  AUDITOR: 1,
  READ_ONLY: 0,
};

@Injectable()
export class MembershipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: OrganizationPolicyService,
    private readonly observability: TenantObservabilityService,
  ) {}

  findAll(organizationId: string, tenant: TenantContext) {
    this.assertTenantPath(organizationId, tenant);
    return this.prisma.organizationMembership.findMany({
      where: { organizationId: tenant.organizationId },
      select: {
        id: true,
        userId: true,
        role: true,
        status: true,
        joinedAt: true,
        suspendedAt: true,
        revokedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async changeRole(
    organizationId: string,
    membershipId: string,
    role: MembershipRole,
    tenant: TenantContext,
  ) {
    this.assertTenantPath(organizationId, tenant);
    if (role === MembershipRole.OWNER) {
      throw new ConflictException('Ownership transfer is not supported');
    }
    return serializableTransaction(this.prisma, async (tx) => {
      const target = await this.findTarget(tx, membershipId, tenant);
      this.requireManage(
        tenant,
        OrganizationCapability.MEMBERSHIP_MANAGE_ROLE,
        target,
        role,
      );
      if (target.role === MembershipRole.OWNER) {
        throw new ConflictException('Ownership transfer is not supported');
      }
      if (target.role === role) {
        throw new ConflictException('Membership role is already set');
      }
      const updated = await tx.organizationMembership.updateMany({
        where: {
          id: target.id,
          organizationId: tenant.organizationId,
          role: target.role,
          status: target.status,
        },
        data: { role },
      });
      if (updated.count !== 1) {
        throw new ConflictException('Membership changed concurrently');
      }
      this.observability.organizationDomainEvent(
        'membership_role_changed',
        tenant,
        'SUCCESS',
        'ROLE_CHANGED',
        target.id,
      );
      return this.findTarget(tx, membershipId, tenant);
    });
  }

  async changeStatus(
    organizationId: string,
    membershipId: string,
    status: 'ACTIVE' | 'SUSPENDED',
    tenant: TenantContext,
  ) {
    this.assertTenantPath(organizationId, tenant);
    return serializableTransaction(this.prisma, async (tx) => {
      const target = await this.findTarget(tx, membershipId, tenant);
      this.requireManage(
        tenant,
        status === MembershipStatus.SUSPENDED
          ? OrganizationCapability.MEMBERSHIP_SUSPEND
          : OrganizationCapability.MEMBERSHIP_REACTIVATE,
        target,
      );
      if (target.status === status) {
        throw new ConflictException('Membership status is already set');
      }
      if (
        target.status === MembershipStatus.REVOKED ||
        target.status === MembershipStatus.INVITED
      ) {
        throw new ConflictException('Invalid membership transition');
      }
      if (status === MembershipStatus.SUSPENDED) {
        await this.protectOwner(tx, target, tenant);
      }
      const updated = await tx.organizationMembership.updateMany({
        where: {
          id: target.id,
          organizationId: tenant.organizationId,
          status: target.status,
        },
        data:
          status === MembershipStatus.SUSPENDED
            ? { status, suspendedAt: new Date() }
            : { status, suspendedAt: null },
      });
      if (updated.count !== 1) {
        throw new ConflictException('Membership changed concurrently');
      }
      this.observability.organizationDomainEvent(
        status === MembershipStatus.SUSPENDED
          ? 'membership_suspended'
          : 'membership_reactivated',
        tenant,
        'SUCCESS',
        'STATUS_CHANGED',
        target.id,
      );
      return this.findTarget(tx, membershipId, tenant);
    });
  }

  async remove(
    organizationId: string,
    membershipId: string,
    tenant: TenantContext,
  ) {
    this.assertTenantPath(organizationId, tenant);
    return serializableTransaction(this.prisma, async (tx) => {
      const target = await this.findTarget(tx, membershipId, tenant);
      this.requireManage(
        tenant,
        OrganizationCapability.MEMBERSHIP_REMOVE,
        target,
      );
      if (
        target.status !== MembershipStatus.ACTIVE &&
        target.status !== MembershipStatus.SUSPENDED
      ) {
        throw new ConflictException('Invalid membership transition');
      }
      await this.protectOwner(tx, target, tenant);
      const updated = await tx.organizationMembership.updateMany({
        where: {
          id: target.id,
          organizationId: tenant.organizationId,
          status: target.status,
        },
        data: { status: MembershipStatus.REVOKED, revokedAt: new Date() },
      });
      if (updated.count !== 1) {
        throw new ConflictException('Membership changed concurrently');
      }
      this.observability.organizationDomainEvent(
        'membership_removed',
        tenant,
        'SUCCESS',
        'MEMBERSHIP_REMOVED',
        target.id,
      );
      return { id: target.id, status: MembershipStatus.REVOKED };
    });
  }

  async leave(organizationId: string, tenant: TenantContext) {
    this.assertTenantPath(organizationId, tenant);
    if (
      this.policy.decisionFor(
        tenant,
        OrganizationCapability.MEMBERSHIP_LEAVE,
      ) === CapabilityDecision.DENY
    ) {
      throw new ForbiddenException('Organization capability is required');
    }
    return serializableTransaction(this.prisma, async (tx) => {
      const target = await this.findTarget(tx, tenant.membershipId, tenant);
      if (
        target.userId !== tenant.userId ||
        target.status !== MembershipStatus.ACTIVE
      ) {
        throw new ConflictException('Invalid membership transition');
      }
      await this.protectOwner(tx, target, tenant, 'membership_leave_denied');
      const updated = await tx.organizationMembership.updateMany({
        where: {
          id: target.id,
          organizationId: tenant.organizationId,
          userId: tenant.userId,
          status: MembershipStatus.ACTIVE,
        },
        data: { status: MembershipStatus.REVOKED, revokedAt: new Date() },
      });
      if (updated.count !== 1) {
        throw new ConflictException('Membership changed concurrently');
      }
      this.observability.organizationDomainEvent(
        'membership_removed',
        tenant,
        'SUCCESS',
        'MEMBERSHIP_LEFT',
        target.id,
      );
      return { id: target.id, status: MembershipStatus.REVOKED };
    });
  }

  private assertTenantPath(organizationId: string, tenant: TenantContext) {
    if (organizationId !== tenant.organizationId) {
      throw new NotFoundException('Organization not found');
    }
  }

  private async findTarget(
    tx: Prisma.TransactionClient,
    id: string,
    tenant: TenantContext,
  ) {
    const target = await tx.organizationMembership.findFirst({
      where: { id, organizationId: tenant.organizationId },
      select: { id: true, userId: true, role: true, status: true },
    });
    if (!target) {
      throw new NotFoundException('Membership not found');
    }
    return target;
  }

  private requireManage(
    tenant: TenantContext,
    capability: OrganizationCapability,
    target: { userId: string; role: MembershipRole },
    newRole?: MembershipRole,
  ) {
    const decision = this.policy.decisionFor(tenant, capability);
    if (decision === CapabilityDecision.DENY) {
      throw new ForbiddenException('Organization capability is required');
    }
    if (
      tenant.organizationRole === MembershipRole.ADMIN &&
      (target.role === MembershipRole.OWNER ||
        target.userId === tenant.userId ||
        (newRole && roleRank[newRole] > roleRank[MembershipRole.ADMIN]))
    ) {
      throw new ForbiddenException('Membership action is not permitted');
    }
  }

  private async protectOwner(
    tx: Prisma.TransactionClient,
    target: { id: string; role: MembershipRole; status: MembershipStatus },
    tenant: TenantContext,
    event:
      | 'owner_invariant_denied'
      | 'membership_leave_denied' = 'owner_invariant_denied',
  ) {
    if (
      target.role !== MembershipRole.OWNER ||
      target.status !== MembershipStatus.ACTIVE
    ) {
      return;
    }
    const owners = await tx.organizationMembership.count({
      where: {
        organizationId: tenant.organizationId,
        role: MembershipRole.OWNER,
        status: MembershipStatus.ACTIVE,
      },
    });
    if (owners <= 1) {
      this.observability.organizationDomainEvent(
        event,
        tenant,
        'DENY',
        'LAST_ACTIVE_OWNER',
        target.id,
      );
      throw new ConflictException('Organization must retain an active owner');
    }
  }
}
