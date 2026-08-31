import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  MembershipStatus,
  PlanTier,
  Subscription,
  SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  QuotaExceededException,
  QuotaResource,
} from '../exceptions/quota-exceeded.exception';

@Injectable()
export class QuotaEnforcementService {
  private readonly logger = new Logger(QuotaEnforcementService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Asserts whether the organization can add/invite an additional therapist/member.
   * Throws QuotaExceededException (HTTP 402) when quota is reached or subscription is inactive.
   */
  async assertCanAddTherapist(organizationId: string): Promise<void> {
    const subscription = await this.resolveActiveSubscription(organizationId);

    this.assertSubscriptionStateAllowed(
      subscription,
      QuotaResource.THERAPISTS,
    );

    if (this.isUnlimited(subscription)) {
      return;
    }

    const currentUsage = await this.prisma.organizationMembership.count({
      where: {
        organizationId,
        status: MembershipStatus.ACTIVE,
      },
    });

    const maxAllowed =
      subscription.customTherapistsLimit ??
      subscription.plan.quota?.maxTherapists ??
      this.getDefaultQuotaForTier(subscription.plan.tier).maxTherapists;

    if (currentUsage >= maxAllowed) {
      this.logger.warn({
        event: 'quota_exceeded_therapists',
        organizationId,
        currentUsage,
        maxAllowed,
        tier: subscription.plan.tier,
      });

      throw new QuotaExceededException({
        resource: QuotaResource.THERAPISTS,
        currentUsage,
        maxAllowed,
        currentTier: subscription.plan.tier,
        suggestedTier: this.getSuggestedTier(subscription.plan.tier),
      });
    }
  }

  /**
   * Asserts whether the organization can create an additional physical branch.
   * Throws QuotaExceededException (HTTP 402) when quota is reached or subscription is inactive.
   */
  async assertCanCreateBranch(organizationId: string): Promise<void> {
    const subscription = await this.resolveActiveSubscription(organizationId);

    this.assertSubscriptionStateAllowed(
      subscription,
      QuotaResource.BRANCHES,
    );

    if (this.isUnlimited(subscription)) {
      return;
    }

    const currentUsage = await this.prisma.branch.count({
      where: {
        organizationId,
        isActive: true,
        deletedAt: null,
      },
    });

    const maxAllowed =
      subscription.customBranchesLimit ??
      subscription.plan.quota?.maxBranches ??
      this.getDefaultQuotaForTier(subscription.plan.tier).maxBranches;

    if (currentUsage >= maxAllowed) {
      this.logger.warn({
        event: 'quota_exceeded_branches',
        organizationId,
        currentUsage,
        maxAllowed,
        tier: subscription.plan.tier,
      });

      throw new QuotaExceededException({
        resource: QuotaResource.BRANCHES,
        currentUsage,
        maxAllowed,
        currentTier: subscription.plan.tier,
        suggestedTier: this.getSuggestedTier(subscription.plan.tier),
      });
    }
  }

  /**
   * Asserts whether the organization can send an additional notification in the current billing cycle.
   * Throws QuotaExceededException (HTTP 402) when quota is reached or subscription is inactive.
   */
  async assertCanSendNotification(organizationId: string): Promise<void> {
    const subscription = await this.resolveActiveSubscription(organizationId);

    this.assertSubscriptionStateAllowed(
      subscription,
      QuotaResource.NOTIFICATIONS,
    );

    if (this.isUnlimited(subscription)) {
      return;
    }

    const now = new Date();
    const usage = await this.prisma.organizationUsage.findFirst({
      where: {
        organizationId,
        periodStart: { lte: now },
        periodEnd: { gte: now },
      },
      orderBy: { createdAt: 'desc' },
    });

    const currentUsage = usage?.notificationsCount ?? 0;

    const maxAllowed =
      subscription.plan.quota?.maxNotificationsPerMonth ??
      this.getDefaultQuotaForTier(subscription.plan.tier)
        .maxNotificationsPerMonth;

    if (currentUsage >= maxAllowed) {
      this.logger.warn({
        event: 'quota_exceeded_notifications',
        organizationId,
        currentUsage,
        maxAllowed,
        tier: subscription.plan.tier,
      });

      throw new QuotaExceededException({
        resource: QuotaResource.NOTIFICATIONS,
        currentUsage,
        maxAllowed,
        currentTier: subscription.plan.tier,
        suggestedTier: this.getSuggestedTier(subscription.plan.tier),
      });
    }
  }

  /**
   * Resolves the current subscription context for the organization or creates a default active STARTER subscription.
   */
  private async resolveActiveSubscription(organizationId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        subscriptions: {
          include: {
            plan: {
              include: {
                quota: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!org) {
      throw new NotFoundException(
        `Organization with ID "${organizationId}" not found`,
      );
    }

    let sub = org.subscriptions[0] ?? null;

    if (!sub) {
      let defaultPlan = await this.prisma.plan.findFirst({
        where: { tier: PlanTier.STARTER, isActive: true },
        include: { quota: true },
      });

      if (!defaultPlan) {
        defaultPlan = await this.prisma.plan.findFirst({
          where: { isActive: true },
          include: { quota: true },
          orderBy: { sortOrder: 'asc' },
        });
      }

      if (!defaultPlan) {
        throw new NotFoundException('No billing plans configured in system');
      }

      const now = new Date();
      const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      sub = await this.prisma.subscription.create({
        data: {
          organizationId,
          planId: defaultPlan.id,
          status: SubscriptionStatus.ACTIVE,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          currentPeriodStartedAt: now,
          currentPeriodEndsAt: periodEnd,
        },
        include: {
          plan: {
            include: {
              quota: true,
            },
          },
        },
      });
    }

    return sub;
  }

  /**
   * Verifies if subscription is in an active/usable state.
   * Subscriptions in FROZEN, CANCELED, UNPAID, or EXPIRED states are blocked.
   */
  private assertSubscriptionStateAllowed(
    subscription: Subscription & { plan: { tier: PlanTier } },
    resource: QuotaResource,
  ): void {
    const blockedStatuses: SubscriptionStatus[] = [
      SubscriptionStatus.FROZEN,
      SubscriptionStatus.CANCELED,
      SubscriptionStatus.UNPAID,
      SubscriptionStatus.EXPIRED,
    ];

    if (blockedStatuses.includes(subscription.status)) {
      this.logger.warn({
        event: 'subscription_state_blocked',
        organizationId: subscription.organizationId,
        status: subscription.status,
        resource,
      });

      throw new QuotaExceededException({
        resource,
        currentUsage: 0,
        maxAllowed: 0,
        currentTier: subscription.plan.tier,
        suggestedTier: this.getSuggestedTier(subscription.plan.tier),
        message: `Operation blocked. Subscription is ${subscription.status}. Please resolve billing issues or renew your subscription to proceed.`,
      });
    }

    if (subscription.status === SubscriptionStatus.PAST_DUE) {
      const now = new Date();
      const isWithinGrace =
        subscription.gracePeriodEndsAt !== null &&
        new Date(subscription.gracePeriodEndsAt) > now;

      if (!isWithinGrace) {
        this.logger.warn({
          event: 'subscription_grace_period_expired',
          organizationId: subscription.organizationId,
          status: subscription.status,
          gracePeriodEndsAt: subscription.gracePeriodEndsAt,
          resource,
        });

        throw new QuotaExceededException({
          resource,
          currentUsage: 0,
          maxAllowed: 0,
          currentTier: subscription.plan.tier,
          suggestedTier: this.getSuggestedTier(subscription.plan.tier),
          message: `Operation blocked. The payment grace period for this organization has expired (${subscription.gracePeriodEndsAt ? subscription.gracePeriodEndsAt.toISOString() : 'no grace period'}). Please update your payment method to restore write access.`,
        });
      }

      this.logger.log({
        event: 'subscription_operating_in_grace_period',
        organizationId: subscription.organizationId,
        gracePeriodEndsAt: subscription.gracePeriodEndsAt,
        resource,
      });
    }
  }

  /**
   * Identifies if an organization has unlimited quotas.
   * Exempt conditions: isExempt === true, LIFETIME_SPONSOR, or ENTERPRISE tier.
   */
  private isUnlimited(
    subscription: Subscription & { plan: { tier: PlanTier } },
  ): boolean {
    if (subscription.isExempt) {
      return true;
    }

    if (subscription.status === SubscriptionStatus.LIFETIME_SPONSOR) {
      return true;
    }

    if (subscription.plan.tier === PlanTier.ENTERPRISE) {
      return true;
    }

    return false;
  }

  /**
   * Returns default quota numbers per PlanTier.
   */
  private getDefaultQuotaForTier(tier: PlanTier) {
    switch (tier) {
      case PlanTier.STARTER:
        return {
          maxTherapists: 1,
          maxBranches: 1,
          maxNotificationsPerMonth: 100,
        };
      case PlanTier.PRO:
        return {
          maxTherapists: 3,
          maxBranches: 2,
          maxNotificationsPerMonth: 500,
        };
      case PlanTier.CLINIC:
        return {
          maxTherapists: 10,
          maxBranches: 5,
          maxNotificationsPerMonth: 2000,
        };
      case PlanTier.ENTERPRISE:
        return {
          maxTherapists: 9999,
          maxBranches: 9999,
          maxNotificationsPerMonth: 999999,
        };
      default:
        return {
          maxTherapists: 1,
          maxBranches: 1,
          maxNotificationsPerMonth: 50,
        };
    }
  }

  /**
   * Derives recommended upgrade tier for an organization.
   */
  private getSuggestedTier(currentTier: PlanTier): string {
    switch (currentTier) {
      case PlanTier.FREE:
        return PlanTier.STARTER;
      case PlanTier.STARTER:
        return PlanTier.PRO;
      case PlanTier.PRO:
        return PlanTier.CLINIC;
      case PlanTier.CLINIC:
        return PlanTier.ENTERPRISE;
      case PlanTier.ENTERPRISE:
        return PlanTier.ENTERPRISE;
      default:
        return PlanTier.PRO;
    }
  }
}
