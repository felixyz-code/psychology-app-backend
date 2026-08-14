import { Injectable, Logger } from '@nestjs/common';
import { MembershipStatus, PlanTier, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EntitlementKey } from './entitlements.constants';
import {
  FeatureCheckResult,
  QuotaCheckResult,
  ResolvedSubscriptionContext,
} from './entitlements.types';
import { FeatureNotAvailableException } from './exceptions/feature-not-available.exception';
import { PlanLimitExceededException } from './exceptions/plan-limit-exceeded.exception';

@Injectable()
export class EntitlementsService {
  private readonly logger = new Logger(EntitlementsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolves the active subscription for an organization, falling back to the default FREE plan if none is active.
   */
  async resolveSubscriptionContext(
    organizationId: string,
  ): Promise<ResolvedSubscriptionContext> {
    const now = new Date();

    const activeSubscription = await this.prisma.subscription.findFirst({
      where: {
        organizationId,
        status: {
          in: [
            SubscriptionStatus.ACTIVE,
            SubscriptionStatus.TRIALING,
            SubscriptionStatus.PAST_DUE,
          ],
        },
      },
      include: {
        plan: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (activeSubscription) {
      const isPastDue =
        activeSubscription.status === SubscriptionStatus.PAST_DUE;
      const isWithinGrace =
        activeSubscription.gracePeriodEndsAt !== null &&
        activeSubscription.gracePeriodEndsAt > now;

      return {
        organizationId,
        subscriptionId: activeSubscription.id,
        planId: activeSubscription.plan.id,
        planCode: activeSubscription.plan.code,
        planTier: activeSubscription.plan.tier,
        status: activeSubscription.status,
        isGracePeriod: isPastDue && isWithinGrace,
      };
    }

    // Fallback to active Free tier plan catalog
    const freePlan = await this.prisma.plan.findFirst({
      where: {
        tier: PlanTier.FREE,
        isActive: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return {
      organizationId,
      planId: freePlan?.id ?? '00000000-0000-0000-0000-000000000000',
      planCode: freePlan?.code ?? 'free-fallback',
      planTier: freePlan?.tier ?? PlanTier.FREE,
      status: SubscriptionStatus.ACTIVE,
      isGracePeriod: false,
    };
  }

  /**
   * Retrieves the concrete entitlement value for a given plan and entitlement key.
   */
  async getEntitlement(
    organizationId: string,
    key: string,
  ): Promise<{
    numericValue: number | null;
    booleanValue: boolean | null;
    tier: PlanTier;
  }> {
    const context = await this.resolveSubscriptionContext(organizationId);

    const planEntitlement = await this.prisma.planEntitlement.findFirst({
      where: {
        planId: context.planId,
        definition: {
          key,
        },
      },
      include: {
        definition: true,
      },
    });

    if (!planEntitlement) {
      return {
        numericValue: null,
        booleanValue: null,
        tier: context.planTier,
      };
    }

    return {
      numericValue: planEntitlement.numericValue,
      booleanValue: planEntitlement.booleanValue,
      tier: context.planTier,
    };
  }

  /**
   * Evaluates feature flag access for an organization. Throws FeatureNotAvailableException if denied.
   */
  async checkFeatureAccess(
    organizationId: string,
    featureKey: string,
    throwOnDenial = true,
  ): Promise<FeatureCheckResult> {
    const entitlement = await this.getEntitlement(organizationId, featureKey);
    const allowed = entitlement.booleanValue === true;

    if (!allowed && throwOnDenial) {
      this.logger.warn({
        event: 'feature_gate_denied',
        organizationId,
        featureKey,
        tier: entitlement.tier,
      });
      throw new FeatureNotAvailableException({
        featureKey,
        currentTier: entitlement.tier,
      });
    }

    return {
      allowed,
      featureKey,
      planTier: entitlement.tier,
    };
  }

  /**
   * Calculates the current resource usage for standard system metrics.
   */
  async countCurrentUsage(
    organizationId: string,
    quotaKey: EntitlementKey | string,
  ): Promise<number> {
    switch (quotaKey as EntitlementKey) {
      case EntitlementKey.MAX_PATIENTS:
        return this.prisma.patient.count({
          where: { organizationId },
        });

      case EntitlementKey.MAX_STAFF_SEATS:
        return this.prisma.organizationMembership.count({
          where: {
            organizationId,
            status: MembershipStatus.ACTIVE,
          },
        });

      case EntitlementKey.MAX_STORAGE_MB: {
        const logo = await this.prisma.organizationLogoAsset.findUnique({
          where: { organizationId },
          select: { byteSize: true },
        });
        const totalBytes = logo?.byteSize ?? 0;
        return Math.ceil(totalBytes / (1024 * 1024));
      }

      case EntitlementKey.MAX_BRANCHES:
        return this.prisma.branch.count({
          where: {
            organizationId,
            deletedAt: null,
          },
        });

      default:
        return 0;
    }
  }

  /**
   * Verifies if an organization can perform an action within its numeric quota limits.
   */
  async checkNumericQuota(
    organizationId: string,
    quotaKey: string,
    options?: {
      proposedIncrement?: number;
      explicitUsage?: number;
      throwOnExceeded?: boolean;
    },
  ): Promise<QuotaCheckResult> {
    const proposedIncrement = options?.proposedIncrement ?? 1;
    const throwOnExceeded = options?.throwOnExceeded ?? true;

    const entitlement = await this.getEntitlement(organizationId, quotaKey);
    const limit = entitlement.numericValue ?? 0;

    // -1 indicates unlimited capacity
    if (limit === -1) {
      const currentUsage =
        options?.explicitUsage ??
        (await this.countCurrentUsage(organizationId, quotaKey));

      return {
        allowed: true,
        quotaKey,
        limit: -1,
        currentUsage,
        remaining: Number.POSITIVE_INFINITY,
        isUnlimited: true,
      };
    }

    const currentUsage =
      options?.explicitUsage ??
      (await this.countCurrentUsage(organizationId, quotaKey));

    const projectedUsage = currentUsage + proposedIncrement;
    const allowed = projectedUsage <= limit;
    const remaining = Math.max(0, limit - currentUsage);

    if (!allowed && throwOnExceeded) {
      this.logger.warn({
        event: 'quota_limit_exceeded',
        organizationId,
        quotaKey,
        currentUsage,
        limit,
        proposedIncrement,
      });

      throw new PlanLimitExceededException({
        quotaKey,
        limit,
        currentUsage,
      });
    }

    return {
      allowed,
      quotaKey,
      limit,
      currentUsage,
      remaining,
      isUnlimited: false,
    };
  }
}
