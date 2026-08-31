import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { BillingInterval, PlanTier, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BILLING_PROVIDER } from './billing.constants';
import type {
  BillingCustomerResult,
  BillingProvider,
  BillingSubscriptionResult,
  CancelSubscriptionResult,
  ChangePlanResult,
} from './interfaces/billing-provider.interface';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    @Inject(BILLING_PROVIDER)
    private readonly billingProvider: BillingProvider,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Delegates customer creation to the configured billing provider.
   */
  async createCustomer(
    organizationId: string,
    email: string,
    name: string,
  ): Promise<BillingCustomerResult> {
    this.logger.log({
      event: 'billing_service_create_customer',
      organizationId,
      email,
    });
    return this.billingProvider.createCustomer(organizationId, email, name);
  }

  /**
   * Delegates subscription creation/provisioning to the configured billing provider.
   */
  async createSubscription(
    organizationId: string,
    planCode: string,
    externalCustomerId?: string,
  ): Promise<BillingSubscriptionResult> {
    this.logger.log({
      event: 'billing_service_create_subscription',
      organizationId,
      planCode,
    });
    return this.billingProvider.createSubscription(
      organizationId,
      planCode,
      externalCustomerId,
    );
  }

  /**
   * Delegates subscription plan changes to the configured billing provider.
   */
  async changePlan(
    externalSubscriptionId: string,
    newPlanCode: string,
  ): Promise<ChangePlanResult> {
    this.logger.log({
      event: 'billing_service_change_plan',
      externalSubscriptionId,
      newPlanCode,
    });
    return this.billingProvider.changePlan(externalSubscriptionId, newPlanCode);
  }

  /**
   * Delegates subscription cancellation to the configured billing provider.
   */
  async cancelSubscription(
    externalSubscriptionId: string,
    reason?: string,
  ): Promise<CancelSubscriptionResult> {
    this.logger.log({
      event: 'billing_service_cancel_subscription',
      externalSubscriptionId,
      reason,
    });
    return this.billingProvider.cancelSubscription(
      externalSubscriptionId,
      reason,
    );
  }

  /**
   * Administrative override to change subscription status directly.
   */
  async manualTransition(
    subscriptionId: string,
    status: SubscriptionStatus,
    reason?: string,
  ) {
    const subscription =
      await this.findSubscriptionByIdOrExternal(subscriptionId);

    if (!subscription) {
      throw new NotFoundException(
        `Subscription with ID "${subscriptionId}" not found`,
      );
    }

    const now = new Date();
    const updateData: {
      status: SubscriptionStatus;
      canceledAt?: Date | null;
      endedAt?: Date | null;
      cancelReason?: string | null;
      gracePeriodEndsAt?: Date | null;
      trialStartedAt?: Date | null;
      trialEndsAt?: Date | null;
      currentPeriodEndsAt?: Date;
    } = {
      status,
      cancelReason: reason ?? subscription.cancelReason,
    };

    switch (status) {
      case SubscriptionStatus.CANCELED:
        updateData.canceledAt = now;
        updateData.endedAt = now;
        updateData.cancelReason =
          reason ?? 'Administrative manual cancellation';
        break;
      case SubscriptionStatus.EXPIRED:
        updateData.endedAt = now;
        updateData.cancelReason = reason ?? 'Administrative manual expiration';
        break;
      case SubscriptionStatus.ACTIVE:
        updateData.canceledAt = null;
        updateData.endedAt = null;
        updateData.cancelReason = null;
        if (subscription.currentPeriodEndsAt < now) {
          const newEnd = new Date(now);
          newEnd.setDate(newEnd.getDate() + 30);
          updateData.currentPeriodEndsAt = newEnd;
        }
        break;
      case SubscriptionStatus.TRIALING: {
        updateData.canceledAt = null;
        updateData.endedAt = null;
        updateData.trialStartedAt = subscription.trialStartedAt ?? now;
        const trialEnd = new Date(now);
        trialEnd.setDate(trialEnd.getDate() + 14);
        updateData.trialEndsAt = trialEnd;
        updateData.currentPeriodEndsAt = trialEnd;
        break;
      }
      case SubscriptionStatus.PAST_DUE: {
        const graceEnd = new Date(now);
        graceEnd.setDate(graceEnd.getDate() + 7);
        updateData.gracePeriodEndsAt = graceEnd;
        break;
      }
      case SubscriptionStatus.LIFETIME_SPONSOR: {
        updateData.canceledAt = null;
        updateData.endedAt = null;
        updateData.cancelReason = null;
        const distantEnd = new Date('2099-12-31T23:59:59.999Z');
        updateData.currentPeriodEndsAt = distantEnd;
        break;
      }
      case SubscriptionStatus.FROZEN: {
        updateData.cancelReason = reason ?? 'Administrative account frozen';
        break;
      }
    }

    const updated = await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: updateData,
      include: { plan: true },
    });

    this.logger.log({
      event: 'billing_admin_manual_transition',
      subscriptionId: subscription.id,
      oldStatus: subscription.status,
      newStatus: updated.status,
      reason,
    });

    return updated;
  }

  /**
   * Administrative override to extend a trial subscription's end date.
   */
  async extendTrial(subscriptionId: string, daysToAdd: number) {
    const subscription =
      await this.findSubscriptionByIdOrExternal(subscriptionId);

    if (!subscription) {
      throw new NotFoundException(
        `Subscription with ID "${subscriptionId}" not found`,
      );
    }

    const now = new Date();
    const baseDate =
      subscription.trialEndsAt && subscription.trialEndsAt > now
        ? new Date(subscription.trialEndsAt)
        : new Date(now);

    baseDate.setDate(baseDate.getDate() + daysToAdd);

    const updated = await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: SubscriptionStatus.TRIALING,
        trialEndsAt: baseDate,
        currentPeriodEndsAt: baseDate,
        canceledAt: null,
        endedAt: null,
      },
      include: { plan: true },
    });

    this.logger.log({
      event: 'billing_admin_extend_trial',
      subscriptionId: subscription.id,
      daysToAdd,
      newTrialEndsAt: updated.trialEndsAt,
    });

    return updated;
  }

  /**
   * Administrative override to force a subscription plan change.
   */
  async planOverride(subscriptionId: string, newPlanCode: string) {
    const subscription =
      await this.findSubscriptionByIdOrExternal(subscriptionId);

    if (!subscription) {
      throw new NotFoundException(
        `Subscription with ID "${subscriptionId}" not found`,
      );
    }

    const newPlan = await this.prisma.plan.findFirst({
      where: {
        code: newPlanCode,
        isActive: true,
      },
    });

    if (!newPlan) {
      throw new NotFoundException(
        `Plan with code "${newPlanCode}" not found or is inactive`,
      );
    }

    const now = new Date();
    const periodEnd = this.calculatePeriodEnd(now, newPlan.billingInterval);

    const updated = await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        planId: newPlan.id,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStartedAt: now,
        currentPeriodEndsAt: periodEnd,
        trialStartedAt: null,
        trialEndsAt: null,
        canceledAt: null,
        endedAt: null,
        cancelReason: null,
      },
      include: { plan: true },
    });

    this.logger.log({
      event: 'billing_admin_plan_override',
      subscriptionId: subscription.id,
      oldPlanId: subscription.planId,
      newPlanCode,
      newPlanId: newPlan.id,
      status: updated.status,
    });

    return updated;
  }

  /**
   * Retrieves active or trialing subscription for an organization from the database.
   */
  async getOrganizationSubscription(organizationId: string) {
    return this.prisma.subscription.findFirst({
      where: {
        organizationId,
        status: {
          in: ['ACTIVE', 'TRIALING', 'PAST_DUE'],
        },
      },
      include: {
        plan: {
          include: {
            entitlements: {
              include: {
                definition: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Lists all publicly available and active plans.
   */
  async listAvailablePlans() {
    return this.prisma.plan.findMany({
      where: {
        isActive: true,
        isPublic: true,
      },
      include: {
        entitlements: {
          include: {
            definition: true,
          },
        },
      },
      orderBy: {
        sortOrder: 'asc',
      },
    });
  }

  /**
   * Retrieves comprehensive overview of an organization's subscription, plan, quotas, and current usage.
   */
  async getSubscriptionOverview(organizationId: string) {
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

    // If no subscription exists, resolve or fallback to Free/Starter plan
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

    // Determine Quotas (from plan quota relation or tier-based defaults)
    const plan = sub.plan;
    const quota = plan.quota ?? this.getDefaultQuotaForTier(plan.tier);

    // Calculate Real-Time Usage
    const therapistsCount = await this.prisma.organizationMembership.count({
      where: {
        organizationId,
        status: 'ACTIVE',
      },
    });

    const branchesCount = await this.prisma.branch.count({
      where: {
        organizationId,
        isActive: true,
        deletedAt: null,
      },
    });

    // Monthly notification usage
    const now = new Date();
    const periodStart = sub.currentPeriodStart ?? sub.currentPeriodStartedAt ?? now;
    const periodEnd = sub.currentPeriodEnd ?? sub.currentPeriodEndsAt ?? now;

    // Check tracked usage table if present or default
    const trackedUsage = await this.prisma.organizationUsage.findFirst({
      where: {
        organizationId,
        periodStart: { lte: now },
        periodEnd: { gte: now },
      },
      orderBy: { createdAt: 'desc' },
    });

    const isGracePeriod =
      sub.status === SubscriptionStatus.PAST_DUE &&
      sub.gracePeriodEndsAt !== null &&
      sub.gracePeriodEndsAt > now;

    return {
      id: sub.id,
      organizationId,
      status: sub.status,
      stripeCustomerId: sub.stripeCustomerId,
      stripeSubscriptionId: sub.stripeSubscriptionId,
      stripePriceId: sub.stripePriceId,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      gracePeriodEndsAt: sub.gracePeriodEndsAt,
      isGracePeriod,
      plan: {
        id: plan.id,
        tier: plan.tier,
        code: plan.code,
        name: plan.name,
        description: plan.description,
        billingInterval: plan.billingInterval,
        basePrice: plan.basePrice.toString(),
        currency: plan.currency,
        stripePriceId: plan.stripePriceId,
      },
      quotas: {
        maxTherapists: sub.customTherapistsLimit ?? quota.maxTherapists,
        maxBranches: sub.customBranchesLimit ?? quota.maxBranches,
        maxNotificationsPerMonth: quota.maxNotificationsPerMonth,
        maxPatients: sub.customPatientsLimit ?? quota.maxPatients,
        canCustomBrand: quota.canCustomBrand,
        canTeleconsultation: quota.canTeleconsultation,
      },
      usage: {
        therapistsCount,
        branchesCount,
        notificationsCount: trackedUsage?.notificationsCount ?? 0,
        periodStart,
        periodEnd,
      },
    };
  }

  private getDefaultQuotaForTier(tier: PlanTier) {
    switch (tier) {
      case PlanTier.STARTER:
        return {
          maxTherapists: 1,
          maxBranches: 1,
          maxNotificationsPerMonth: 100,
          maxPatients: 100,
          canCustomBrand: false,
          canTeleconsultation: true,
        };
      case PlanTier.PRO:
        return {
          maxTherapists: 3,
          maxBranches: 2,
          maxNotificationsPerMonth: 500,
          maxPatients: 500,
          canCustomBrand: true,
          canTeleconsultation: true,
        };
      case PlanTier.CLINIC:
        return {
          maxTherapists: 10,
          maxBranches: 5,
          maxNotificationsPerMonth: 2000,
          maxPatients: 2000,
          canCustomBrand: true,
          canTeleconsultation: true,
        };
      case PlanTier.ENTERPRISE:
        return {
          maxTherapists: 9999,
          maxBranches: 9999,
          maxNotificationsPerMonth: 999999,
          maxPatients: 999999,
          canCustomBrand: true,
          canTeleconsultation: true,
        };
      default:
        return {
          maxTherapists: 1,
          maxBranches: 1,
          maxNotificationsPerMonth: 50,
          maxPatients: 25,
          canCustomBrand: false,
          canTeleconsultation: true,
        };
    }
  }

  /**
   * Helper to find subscription by internal id or externalSubscriptionId.
   */
  private async findSubscriptionByIdOrExternal(idOrExternalId: string) {
    return this.prisma.subscription.findFirst({
      where: {
        OR: [
          { id: idOrExternalId },
          { externalSubscriptionId: idOrExternalId },
        ],
      },
      include: { plan: true },
    });
  }

  /**
   * Helper to calculate period end date from interval.
   */
  private calculatePeriodEnd(startDate: Date, interval: BillingInterval): Date {
    const end = new Date(startDate);
    switch (interval) {
      case BillingInterval.MONTHLY:
        end.setDate(end.getDate() + 30);
        break;
      case BillingInterval.ANNUAL:
        end.setDate(end.getDate() + 365);
        break;
      case BillingInterval.LIFETIME:
        end.setFullYear(end.getFullYear() + 100);
        break;
      default:
        end.setDate(end.getDate() + 30);
    }
    return end;
  }
}

