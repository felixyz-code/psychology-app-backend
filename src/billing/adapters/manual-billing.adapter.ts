import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  BillingInterval,
  PaymentProvider,
  SubscriptionStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import {
  BillingCustomerResult,
  BillingProvider,
  BillingSubscriptionResult,
  CancelSubscriptionResult,
  ChangePlanResult,
} from '../interfaces/billing-provider.interface';

@Injectable()
export class ManualBillingAdapter implements BillingProvider {
  private readonly logger = new Logger(ManualBillingAdapter.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generates and registers a provider-agnostic customer ID for the given organization.
   */
  async createCustomer(
    organizationId: string,
    email: string,
    name: string,
  ): Promise<BillingCustomerResult> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new NotFoundException(
        `Organization with id "${organizationId}" not found`,
      );
    }

    const externalCustomerId = `manual_cus_${organizationId}`;

    this.logger.log({
      event: 'billing_manual_customer_created',
      organizationId,
      email,
      name,
      externalCustomerId,
    });

    return { externalCustomerId };
  }

  /**
   * Creates or activates a subscription for the given organization under the Manual provider.
   */
  async createSubscription(
    organizationId: string,
    planCode: string,
    externalCustomerId?: string,
  ): Promise<BillingSubscriptionResult> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new NotFoundException(
        `Organization with id "${organizationId}" not found`,
      );
    }

    const plan = await this.prisma.plan.findFirst({
      where: {
        code: planCode,
        isActive: true,
      },
    });

    if (!plan) {
      throw new NotFoundException(
        `Plan with code "${planCode}" not found or is inactive`,
      );
    }

    const now = new Date();
    let status: SubscriptionStatus;
    let trialStartedAt: Date | null = null;
    let trialEndsAt: Date | null = null;
    let currentPeriodEndsAt: Date;

    if (plan.trialDays > 0) {
      status = SubscriptionStatus.TRIALING;
      trialStartedAt = now;
      trialEndsAt = new Date(
        now.getTime() + plan.trialDays * 24 * 60 * 60 * 1000,
      );
      currentPeriodEndsAt = trialEndsAt;
    } else {
      status = SubscriptionStatus.ACTIVE;
      currentPeriodEndsAt = this.calculatePeriodEnd(now, plan.billingInterval);
    }

    const assignedCustomerId =
      externalCustomerId ?? `manual_cus_${organizationId}`;
    const assignedSubscriptionId = `manual_sub_${randomUUID()}`;

    // Deactivate previous active/trialing subscriptions for this organization
    await this.prisma.subscription.updateMany({
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
      data: {
        status: SubscriptionStatus.CANCELED,
        canceledAt: now,
        endedAt: now,
        cancelReason: 'Superseded by new manual subscription creation',
      },
    });

    const subscription = await this.prisma.subscription.create({
      data: {
        organizationId,
        planId: plan.id,
        status,
        externalProvider: PaymentProvider.MANUAL,
        externalSubscriptionId: assignedSubscriptionId,
        externalCustomerId: assignedCustomerId,
        trialStartedAt,
        trialEndsAt,
        currentPeriodStartedAt: now,
        currentPeriodEndsAt,
        seatQuantity: 1,
      },
    });

    this.logger.log({
      event: 'billing_manual_subscription_created',
      organizationId,
      planCode,
      subscriptionId: subscription.id,
      externalSubscriptionId: subscription.externalSubscriptionId,
      status: subscription.status,
      currentPeriodEndsAt: subscription.currentPeriodEndsAt,
    });

    return {
      externalSubscriptionId: subscription.externalSubscriptionId!,
      status: subscription.status,
      currentPeriodEndsAt: subscription.currentPeriodEndsAt,
    };
  }

  /**
   * Switches the active plan for an existing manual subscription.
   */
  async changePlan(
    externalSubscriptionId: string,
    newPlanCode: string,
  ): Promise<ChangePlanResult> {
    const subscription = await this.prisma.subscription.findFirst({
      where: {
        externalSubscriptionId,
      },
    });

    if (!subscription) {
      throw new NotFoundException(
        `Subscription with external ID "${externalSubscriptionId}" not found`,
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
    const currentPeriodEndsAt = this.calculatePeriodEnd(
      now,
      newPlan.billingInterval,
    );

    const updated = await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        planId: newPlan.id,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStartedAt: now,
        currentPeriodEndsAt,
        trialStartedAt: null,
        trialEndsAt: null,
        canceledAt: null,
        endedAt: null,
        cancelReason: null,
      },
    });

    this.logger.log({
      event: 'billing_manual_plan_changed',
      externalSubscriptionId,
      oldPlanId: subscription.planId,
      newPlanCode,
      newPlanId: newPlan.id,
      status: updated.status,
      currentPeriodEndsAt: updated.currentPeriodEndsAt,
    });

    return {
      status: updated.status,
      currentPeriodEndsAt: updated.currentPeriodEndsAt,
    };
  }

  /**
   * Cancels a manual subscription.
   */
  async cancelSubscription(
    externalSubscriptionId: string,
    reason?: string,
  ): Promise<CancelSubscriptionResult> {
    const subscription = await this.prisma.subscription.findFirst({
      where: {
        externalSubscriptionId,
      },
    });

    if (!subscription) {
      throw new NotFoundException(
        `Subscription with external ID "${externalSubscriptionId}" not found`,
      );
    }

    const now = new Date();

    const updated = await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: SubscriptionStatus.CANCELED,
        canceledAt: now,
        endedAt: now,
        cancelReason: reason ?? 'Manually canceled by administrator/user',
      },
    });

    this.logger.log({
      event: 'billing_manual_subscription_canceled',
      externalSubscriptionId,
      reason,
      canceledAt: updated.canceledAt,
    });

    return {
      status: updated.status,
      canceledAt: updated.canceledAt!,
    };
  }

  /**
   * Helper to calculate period end date according to the billing interval.
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
