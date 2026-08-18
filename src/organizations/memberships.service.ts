import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MembershipRole,
  MembershipStatus,
  OrganizationStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CapabilityDecision,
  OrganizationCapability,
} from '../tenant-context/authorization/organization-capability';
import { OrganizationPolicyService } from '../tenant-context/authorization/organization-policy.service';
import { TenantContext } from '../tenant-context/tenant-context.types';
import { TenantObservabilityService } from '../tenant-context/tenant-observability.service';
import { MembershipAllowedAction } from './dto/membership-response.dto';
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

  async findAll(organizationId: string, tenant: TenantContext) {
    this.assertTenantPath(organizationId, tenant);
    return this.prisma.$transaction(async (tx) => {
      const [memberships, activeOwnerCount] = await Promise.all([
        tx.organizationMembership.findMany({
          where: {
            organizationId: tenant.organizationId,
            status: {
              in: [
                MembershipStatus.INVITED,
                MembershipStatus.ACTIVE,
                MembershipStatus.SUSPENDED,
              ],
            },
          },
          select: {
            id: true,
            userId: true,
            role: true,
            status: true,
            joinedAt: true,
            suspendedAt: true,
            revokedAt: true,
            createdAt: true,
            updatedAt: true,
            user: {
              select: {
                name: true,
                email: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        }),
        tx.organizationMembership.count({
          where: {
            organizationId: tenant.organizationId,
            role: MembershipRole.OWNER,
            status: MembershipStatus.ACTIVE,
          },
        }),
      ]);

      return memberships.map(({ user, ...membership }) => ({
        ...membership,
        displayName: user.name,
        email: user.email,
        allowedActions: this.allowedActionsFor(
          tenant,
          membership,
          activeOwnerCount,
        ),
      }));
    });
  }

  async changeRole(
    organizationId: string,
    membershipId: string,
    role: MembershipRole,
    expectedUpdatedAt: string,
    tenant: TenantContext,
  ) {
    this.assertTenantPath(organizationId, tenant);
    if (role === MembershipRole.OWNER) {
      throw new ConflictException('Ownership transfer is not supported');
    }
    const result = await serializableTransaction(this.prisma, async (tx) => {
      const target = await this.findTarget(tx, membershipId, tenant);
      this.requireManage(
        tenant,
        OrganizationCapability.MEMBERSHIP_MANAGE_ROLE,
        target,
        role,
      );
      this.assertExpectedUpdatedAt(target, expectedUpdatedAt);
      if (target.role === MembershipRole.OWNER) {
        throw new ConflictException('Ownership transfer is not supported');
      }
      if (target.status === MembershipStatus.REVOKED) {
        throw new ConflictException('Invalid membership transition');
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
          updatedAt: new Date(expectedUpdatedAt),
        },
        data: { role },
      });
      if (updated.count !== 1) {
        throw this.concurrentUpdate();
      }
      return {
        membership: await this.findTarget(tx, membershipId, tenant),
        eventMetadata: {
          targetId: target.id,
          targetUserId: target.userId,
          previousRole: target.role,
          newRole: role,
          previousStatus: target.status,
          newStatus: target.status,
        },
      };
    });
    this.observability.organizationDomainEvent(
      'membership_role_changed',
      tenant,
      'SUCCESS',
      'ROLE_CHANGED',
      result.eventMetadata,
    );
    return result.membership;
  }

  async transferOwnership(
    organizationId: string,
    targetMembershipId: string,
    tenant: TenantContext,
  ) {
    this.assertTenantPath(organizationId, tenant);
    this.requireOwnershipTransfer(tenant);
    const result = await serializableTransaction(this.prisma, async (tx) => {
      const actor = await this.findTransferActor(tx, tenant);
      if (actor.organization.status !== OrganizationStatus.ACTIVE) {
        throw new ConflictException('Organization is not active');
      }
      if (
        actor.status !== MembershipStatus.ACTIVE ||
        actor.role !== MembershipRole.OWNER
      ) {
        throw new ConflictException(
          'Ownership transfer is no longer available',
        );
      }

      const target = await this.findTarget(tx, targetMembershipId, tenant);
      if (target.id === actor.id || target.userId === actor.userId) {
        throw new ConflictException(
          'Ownership transfer target must be another membership',
        );
      }
      if (target.status !== MembershipStatus.ACTIVE) {
        throw new ConflictException('Ownership transfer target must be active');
      }
      if (target.role === MembershipRole.OWNER) {
        throw new ConflictException(
          'Ownership transfer target must not already be an owner',
        );
      }

      const promoted = await tx.organizationMembership.updateMany({
        where: {
          id: target.id,
          organizationId: tenant.organizationId,
          role: target.role,
          status: MembershipStatus.ACTIVE,
        },
        data: { role: MembershipRole.OWNER },
      });
      if (promoted.count !== 1) {
        throw new ConflictException('Membership changed concurrently');
      }

      const demoted = await tx.organizationMembership.updateMany({
        where: {
          id: actor.id,
          organizationId: tenant.organizationId,
          userId: tenant.userId,
          role: MembershipRole.OWNER,
          status: MembershipStatus.ACTIVE,
        },
        data: { role: MembershipRole.ADMIN },
      });
      if (demoted.count !== 1) {
        throw new ConflictException('Membership changed concurrently');
      }

      const activeOwners = await tx.organizationMembership.count({
        where: {
          organizationId: tenant.organizationId,
          role: MembershipRole.OWNER,
          status: MembershipStatus.ACTIVE,
        },
      });
      if (activeOwners < 1) {
        throw new ConflictException('Organization must retain an active owner');
      }

      const [sourceMembership, targetMembership] = await Promise.all([
        this.findTarget(tx, actor.id, tenant),
        this.findTarget(tx, target.id, tenant),
      ]);
      const transferredAt = new Date();

      return {
        organizationId: tenant.organizationId,
        sourceMembership,
        targetMembership,
        transferredAt,
        eventMetadata: {
          actorUserId: actor.userId,
          sourceMembershipId: actor.id,
          targetMembershipId: target.id,
          sourcePreviousRole: actor.role,
          sourceNewRole: sourceMembership.role,
          targetPreviousRole: target.role,
          targetNewRole: targetMembership.role,
        },
      };
    });

    this.observability.organizationDomainEvent(
      'organization_ownership_transferred',
      tenant,
      'SUCCESS',
      'OWNERSHIP_TRANSFERRED',
      result.eventMetadata,
    );

    return {
      organizationId: result.organizationId,
      sourceMembership: this.ownershipTransferMembership(
        result.sourceMembership,
      ),
      targetMembership: this.ownershipTransferMembership(
        result.targetMembership,
      ),
      transferredAt: result.transferredAt,
    };
  }

  async changeStatus(
    organizationId: string,
    membershipId: string,
    status: 'ACTIVE' | 'SUSPENDED',
    expectedUpdatedAt: string,
    tenant: TenantContext,
  ) {
    this.assertTenantPath(organizationId, tenant);
    const result = await serializableTransaction(this.prisma, async (tx) => {
      const target = await this.findTarget(tx, membershipId, tenant);
      this.requireManage(
        tenant,
        status === MembershipStatus.SUSPENDED
          ? OrganizationCapability.MEMBERSHIP_SUSPEND
          : OrganizationCapability.MEMBERSHIP_REACTIVATE,
        target,
      );
      this.assertExpectedUpdatedAt(target, expectedUpdatedAt);
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
          updatedAt: new Date(expectedUpdatedAt),
        },
        data:
          status === MembershipStatus.SUSPENDED
            ? { status, suspendedAt: new Date() }
            : { status, suspendedAt: null },
      });
      if (updated.count !== 1) {
        throw this.concurrentUpdate();
      }
      return {
        membership: await this.findTarget(tx, membershipId, tenant),
        eventMetadata: {
          targetId: target.id,
          targetUserId: target.userId,
          previousRole: target.role,
          newRole: target.role,
          previousStatus: target.status,
          newStatus: status,
        },
      };
    });
    this.observability.organizationDomainEvent(
      status === MembershipStatus.SUSPENDED
        ? 'membership_suspended'
        : 'membership_reactivated',
      tenant,
      'SUCCESS',
      'STATUS_CHANGED',
      result.eventMetadata,
    );
    return result.membership;
  }

  async remove(
    organizationId: string,
    membershipId: string,
    expectedUpdatedAt: string,
    tenant: TenantContext,
  ) {
    this.assertTenantPath(organizationId, tenant);
    const result = await serializableTransaction(this.prisma, async (tx) => {
      const target = await this.findTarget(tx, membershipId, tenant);
      this.requireManage(
        tenant,
        OrganizationCapability.MEMBERSHIP_REMOVE,
        target,
      );
      this.assertExpectedUpdatedAt(target, expectedUpdatedAt);
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
          updatedAt: new Date(expectedUpdatedAt),
        },
        data: { status: MembershipStatus.REVOKED, revokedAt: new Date() },
      });
      if (updated.count !== 1) {
        throw this.concurrentUpdate();
      }
      return {
        membership: await this.findTarget(tx, membershipId, tenant),
        eventMetadata: {
          targetId: target.id,
          targetUserId: target.userId,
          previousRole: target.role,
          newRole: target.role,
          previousStatus: target.status,
          newStatus: MembershipStatus.REVOKED,
        },
      };
    });
    this.observability.organizationDomainEvent(
      'membership_removed',
      tenant,
      'SUCCESS',
      'MEMBERSHIP_REMOVED',
      result.eventMetadata,
    );
    return result.membership;
  }

  async leave(
    organizationId: string,
    expectedUpdatedAt: string,
    tenant: TenantContext,
  ) {
    this.assertTenantPath(organizationId, tenant);
    if (
      this.policy.decisionFor(
        tenant,
        OrganizationCapability.MEMBERSHIP_LEAVE,
      ) === CapabilityDecision.DENY
    ) {
      throw new ForbiddenException('Organization capability is required');
    }
    const result = await serializableTransaction(this.prisma, async (tx) => {
      const target = await this.findTarget(tx, tenant.membershipId, tenant);
      this.assertExpectedUpdatedAt(target, expectedUpdatedAt);
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
          updatedAt: new Date(expectedUpdatedAt),
        },
        data: { status: MembershipStatus.REVOKED, revokedAt: new Date() },
      });
      if (updated.count !== 1) {
        throw this.concurrentUpdate();
      }
      return {
        membership: await this.findTarget(tx, target.id, tenant),
        eventMetadata: {
          targetId: target.id,
          targetUserId: target.userId,
          previousRole: target.role,
          newRole: target.role,
          previousStatus: target.status,
          newStatus: MembershipStatus.REVOKED,
        },
      };
    });
    this.observability.organizationDomainEvent(
      'membership_removed',
      tenant,
      'SUCCESS',
      'MEMBERSHIP_LEFT',
      result.eventMetadata,
    );
    return result.membership;
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
      select: {
        id: true,
        userId: true,
        role: true,
        status: true,
        updatedAt: true,
      },
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
    if (!this.isTargetActionAllowed(tenant, decision, target, newRole)) {
      throw new ForbiddenException('Membership action is not permitted');
    }
  }

  private allowedActionsFor(
    tenant: TenantContext,
    target: {
      userId: string;
      role: MembershipRole;
      status: MembershipStatus;
    },
    activeOwnerCount: number,
  ): MembershipAllowedAction[] {
    const actions: MembershipAllowedAction[] = [];

    if (
      target.role !== MembershipRole.OWNER &&
      target.status !== MembershipStatus.REVOKED &&
      this.canManage(
        tenant,
        OrganizationCapability.MEMBERSHIP_MANAGE_ROLE,
        target,
      )
    ) {
      actions.push(MembershipAllowedAction.CHANGE_ROLE);
    }

    const ownerInvariantAllowsMutation =
      target.role !== MembershipRole.OWNER ||
      target.status !== MembershipStatus.ACTIVE ||
      activeOwnerCount > 1;

    if (
      target.status === MembershipStatus.ACTIVE &&
      ownerInvariantAllowsMutation &&
      this.canManage(tenant, OrganizationCapability.MEMBERSHIP_SUSPEND, target)
    ) {
      actions.push(MembershipAllowedAction.SUSPEND);
    }

    if (
      target.status === MembershipStatus.SUSPENDED &&
      this.canManage(
        tenant,
        OrganizationCapability.MEMBERSHIP_REACTIVATE,
        target,
      )
    ) {
      actions.push(MembershipAllowedAction.REACTIVATE);
    }

    if (
      (target.status === MembershipStatus.ACTIVE ||
        target.status === MembershipStatus.SUSPENDED) &&
      ownerInvariantAllowsMutation &&
      this.canManage(tenant, OrganizationCapability.MEMBERSHIP_REMOVE, target)
    ) {
      actions.push(MembershipAllowedAction.REMOVE);
    }

    return actions;
  }

  private canManage(
    tenant: TenantContext,
    capability: OrganizationCapability,
    target: { userId: string; role: MembershipRole },
    newRole?: MembershipRole,
  ) {
    const decision = this.policy.decisionFor(tenant, capability);
    return this.isTargetActionAllowed(tenant, decision, target, newRole);
  }

  private isTargetActionAllowed(
    tenant: TenantContext,
    decision: CapabilityDecision,
    target: { userId: string; role: MembershipRole },
    newRole?: MembershipRole,
  ) {
    if (decision === CapabilityDecision.DENY) {
      return false;
    }

    if (decision === CapabilityDecision.ALLOW) {
      return true;
    }

    return (
      tenant.organizationRole === MembershipRole.ADMIN &&
      target.role !== MembershipRole.OWNER &&
      target.userId !== tenant.userId &&
      (!newRole || roleRank[newRole] <= roleRank[MembershipRole.ADMIN])
    );
  }

  private assertExpectedUpdatedAt(
    target: { updatedAt: Date },
    expectedUpdatedAt: string,
  ) {
    if (target.updatedAt.getTime() !== new Date(expectedUpdatedAt).getTime()) {
      throw this.concurrentUpdate();
    }
  }

  private concurrentUpdate() {
    return new ConflictException({
      code: 'CONCURRENT_UPDATE',
      message: 'Membership changed concurrently',
    });
  }

  private requireOwnershipTransfer(tenant: TenantContext) {
    if (
      this.policy.decisionFor(
        tenant,
        OrganizationCapability.OWNERSHIP_TRANSFER,
      ) === CapabilityDecision.DENY
    ) {
      throw new ForbiddenException('Organization capability is required');
    }
  }

  private ownershipTransferMembership(target: {
    id: string;
    userId: string;
    role: MembershipRole;
    status: MembershipStatus;
  }) {
    return {
      id: target.id,
      userId: target.userId,
      role: target.role,
      status: target.status,
    };
  }

  private async findTransferActor(
    tx: Prisma.TransactionClient,
    tenant: TenantContext,
  ) {
    const actor = await tx.organizationMembership.findFirst({
      where: {
        id: tenant.membershipId,
        organizationId: tenant.organizationId,
        userId: tenant.userId,
      },
      select: {
        id: true,
        userId: true,
        role: true,
        status: true,
        organization: {
          select: {
            status: true,
          },
        },
      },
    });
    if (!actor) {
      throw new ConflictException(
        'Organization context is no longer available',
      );
    }
    return actor;
  }

  private async protectOwner(
    tx: Prisma.TransactionClient,
    target: {
      id: string;
      userId: string;
      role: MembershipRole;
      status: MembershipStatus;
    },
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
        {
          targetId: target.id,
          targetUserId: target.userId,
          previousRole: target.role,
          newRole: target.role,
          previousStatus: target.status,
          newStatus: target.status,
        },
      );
      throw new ConflictException({
        code: 'LAST_OWNER_PROTECTED',
        message: 'Organization must retain an active owner',
      });
    }
  }
}
