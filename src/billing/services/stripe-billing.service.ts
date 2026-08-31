import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PlanTier, SubscriptionStatus } from '@prisma/client';
import Stripe from 'stripe';
import { AuditLogService } from '../../audit-logs/audit-logs.service';
import { AuditSeverity } from '../../audit-logs/audit-logs.types';
import { AppConfigService } from '../../config/configuration';
import { PrismaService } from '../../prisma/prisma.service';

const TIER_WEIGHTS: Record<PlanTier, number> = {
  [PlanTier.FREE]: 0,
  [PlanTier.STARTER]: 1,
  [PlanTier.PRO]: 2,
  [PlanTier.CLINIC]: 3,
  [PlanTier.PROFESSIONAL]: 3,
  [PlanTier.ENTERPRISE]: 4,
  [PlanTier.CUSTOM]: 4,
};

@Injectable()
export class StripeBillingService {
  private readonly logger = new Logger(StripeBillingService.name);
  private readonly stripe: Stripe | null = null;

  constructor(
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {
    if (this.config.stripeSecretKey) {
      this.stripe = new Stripe(this.config.stripeSecretKey, {
        apiVersion: '2025-02-24.acacia' as Stripe.LatestApiVersion,
      });
      this.logger.log('Stripe client initialized successfully');
    } else {
      this.logger.warn(
        'STRIPE_SECRET_KEY is not configured. Running Stripe in simulated/mock mode.',
      );
    }
  }

  /**
   * Generates a Stripe Checkout Session URL for subscription purchase or upgrade.
   */
  async createCheckoutSession(
    organizationId: string,
    priceId: string,
    successUrl?: string,
    cancelUrl?: string,
  ): Promise<{ url: string; sessionId: string }> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        subscriptions: {
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

    const existingSub = org.subscriptions[0] ?? null;
    const customerId = existingSub?.stripeCustomerId ?? undefined;

    const defaultSuccessUrl =
      successUrl ?? 'https://app.psicologia.com/billing?session_id={CHECKOUT_SESSION_ID}&success=true';
    const defaultCancelUrl =
      cancelUrl ?? 'https://app.psicologia.com/billing?canceled=true';

    let result: { url: string; sessionId: string };

    if (!this.stripe) {
      this.logger.log({
        event: 'mock_stripe_checkout_session_created',
        organizationId,
        priceId,
      });
      result = {
        url: `https://checkout.stripe.com/mock_pay/${priceId}?org=${organizationId}`,
        sessionId: `cs_mock_${Date.now()}`,
      };
    } else {
      const sessionParams: Stripe.Checkout.SessionCreateParams = {
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        client_reference_id: organizationId,
        metadata: {
          organizationId,
        },
        subscription_data: {
          metadata: {
            organizationId,
          },
        },
        success_url: defaultSuccessUrl,
        cancel_url: defaultCancelUrl,
      };

      if (customerId) {
        sessionParams.customer = customerId;
      } else if (org.email) {
        sessionParams.customer_email = org.email;
      }

      const session = await this.stripe.checkout.sessions.create(sessionParams);

      this.logger.log({
        event: 'stripe_checkout_session_created',
        organizationId,
        sessionId: session.id,
      });

      result = {
        url: session.url ?? '',
        sessionId: session.id,
      };
    }

    await this.auditLogService.create({
      organizationId,
      action: 'BILLING_CHECKOUT_INITIATED',
      resourceType: 'Subscription',
      actorRole: 'ORGANIZATION_ADMIN',
      severity: AuditSeverity.INFO,
      details: {
        priceId,
        stripeCustomerId: customerId ?? null,
        sessionId: result.sessionId,
      },
    });

    return result;
  }

  /**
   * Generates a Stripe Customer Portal Session for self-service billing management.
   */
  async createCustomerPortalSession(
    organizationId: string,
    returnUrl?: string,
  ): Promise<{ url: string }> {
    const sub = await this.prisma.subscription.findFirst({
      where: {
        organizationId,
        stripeCustomerId: { not: null },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!sub || !sub.stripeCustomerId) {
      throw new BadRequestException(
        'Organization does not have an active Stripe customer account associated.',
      );
    }

    const defaultReturnUrl =
      returnUrl ?? 'https://app.psicologia.com/billing';

    let result: { url: string };

    if (!this.stripe) {
      this.logger.log({
        event: 'mock_stripe_portal_session_created',
        organizationId,
        customerId: sub.stripeCustomerId,
      });
      result = {
        url: `https://billing.stripe.com/mock_portal/${sub.stripeCustomerId}`,
      };
    } else {
      const portalSession = await this.stripe.billingPortal.sessions.create({
        customer: sub.stripeCustomerId,
        return_url: defaultReturnUrl,
      });

      this.logger.log({
        event: 'stripe_portal_session_created',
        organizationId,
        customerId: sub.stripeCustomerId,
      });

      result = {
        url: portalSession.url,
      };
    }

    await this.auditLogService.create({
      organizationId,
      action: 'BILLING_PORTAL_SESSION_INITIATED',
      resourceType: 'Subscription',
      resourceId: sub.id,
      actorRole: 'ORGANIZATION_ADMIN',
      severity: AuditSeverity.INFO,
      details: {
        stripeCustomerId: sub.stripeCustomerId,
      },
    });

    return result;
  }

  /**
   * Verifies and handles incoming Stripe webhook events.
   */
  async handleWebhookEvent(
    signature: string,
    rawBody: Buffer | string,
  ): Promise<{ received: boolean; eventType: string }> {
    let event: Stripe.Event;

    if (this.stripe && this.config.stripeWebhookSecret) {
      try {
        event = this.stripe.webhooks.constructEvent(
          rawBody,
          signature,
          this.config.stripeWebhookSecret,
        );
      } catch (err: unknown) {
        const error = err as Error;
        this.logger.error({
          event: 'stripe_webhook_signature_verification_failed',
          error: error.message,
        });
        throw new BadRequestException(
          `Webhook signature verification failed: ${error.message}`,
        );
      }
    } else {
      // Test / development fallback without secret
      try {
        const payloadStr =
          typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
        event = JSON.parse(payloadStr) as Stripe.Event;
      } catch (err: unknown) {
        const error = err as Error;
        throw new BadRequestException(
          `Invalid JSON webhook payload: ${error.message}`,
        );
      }
    }

    this.logger.log({
      event: 'stripe_webhook_event_received',
      type: event.type,
      id: event.id,
    });

    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutSessionCompleted(
          event.data.object as Stripe.Checkout.Session,
        );
        break;

      case 'customer.subscription.updated':
        await this.handleCustomerSubscriptionUpdated(
          event.data.object as Stripe.Subscription,
        );
        break;

      case 'customer.subscription.deleted':
        await this.handleCustomerSubscriptionDeleted(
          event.data.object as Stripe.Subscription,
        );
        break;

      case 'invoice.payment_failed':
        await this.handleInvoicePaymentFailed(
          event.data.object as Stripe.Invoice,
        );
        break;

      case 'invoice.paid':
        await this.handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;

      default:
        this.logger.debug({
          event: 'stripe_webhook_unhandled_event',
          type: event.type,
        });
        break;
    }

    return { received: true, eventType: event.type };
  }

  private async handleCheckoutSessionCompleted(
    session: Stripe.Checkout.Session,
  ) {
    const organizationId =
      session.client_reference_id || session.metadata?.organizationId;

    if (!organizationId) {
      this.logger.warn({
        event: 'checkout_session_missing_org_id',
        sessionId: session.id,
      });
      return;
    }

    const stripeCustomerId = session.customer as string;
    const stripeSubscriptionId = session.subscription as string;

    let stripePriceId: string | null = null;
    let periodStart = new Date();
    let periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    if (this.stripe && stripeSubscriptionId) {
      try {
        const stripeSub =
          await this.stripe.subscriptions.retrieve(stripeSubscriptionId);
        stripePriceId = stripeSub.items.data[0]?.price?.id ?? null;
        const rawSub = stripeSub as unknown as {
          current_period_start?: number;
          current_period_end?: number;
        };
        if (rawSub.current_period_start) {
          periodStart = new Date(rawSub.current_period_start * 1000);
        }
        if (rawSub.current_period_end) {
          periodEnd = new Date(rawSub.current_period_end * 1000);
        }
      } catch (err: unknown) {
        const error = err as Error;
        this.logger.warn({
          event: 'failed_fetching_stripe_subscription_details',
          stripeSubscriptionId,
          error: error.message,
        });
      }
    }

    // Resolve plan by stripePriceId or default to Starter/Pro
    let targetPlan = stripePriceId
      ? await this.prisma.plan.findFirst({
          where: { stripePriceId, isActive: true },
        })
      : null;

    if (!targetPlan) {
      targetPlan = await this.prisma.plan.findFirst({
        where: {
          tier: { in: [PlanTier.STARTER, PlanTier.PRO, PlanTier.CLINIC] },
          isActive: true,
        },
        orderBy: { sortOrder: 'asc' },
      });
    }

    if (!targetPlan) {
      this.logger.error({
        event: 'no_suitable_plan_found_for_checkout',
        organizationId,
        stripePriceId,
      });
      return;
    }

    const existingSub = await this.prisma.subscription.findFirst({
      where: { organizationId },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });

    const previousTier = existingSub?.plan?.tier ?? null;
    const newTier = targetPlan.tier;

    let updatedSub;
    if (existingSub) {
      updatedSub = await this.prisma.subscription.update({
        where: { id: existingSub.id },
        data: {
          planId: targetPlan.id,
          status: SubscriptionStatus.ACTIVE,
          stripeCustomerId,
          stripeSubscriptionId,
          stripePriceId,
          cancelAtPeriodEnd: false,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          currentPeriodStartedAt: periodStart,
          currentPeriodEndsAt: periodEnd,
          gracePeriodEndsAt: null,
          canceledAt: null,
          endedAt: null,
        },
      });
    } else {
      updatedSub = await this.prisma.subscription.create({
        data: {
          organizationId,
          planId: targetPlan.id,
          status: SubscriptionStatus.ACTIVE,
          stripeCustomerId,
          stripeSubscriptionId,
          stripePriceId,
          cancelAtPeriodEnd: false,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          currentPeriodStartedAt: periodStart,
          currentPeriodEndsAt: periodEnd,
          gracePeriodEndsAt: null,
        },
      });
    }

    // Determine appropriate audit action
    let auditAction = 'BILLING_SUBSCRIPTION_CREATED';
    if (previousTier) {
      const prevWeight = TIER_WEIGHTS[previousTier] ?? 0;
      const newWeight = TIER_WEIGHTS[newTier] ?? 0;
      if (newWeight > prevWeight) {
        auditAction = 'BILLING_PLAN_UPGRADED';
      } else if (newWeight < prevWeight) {
        auditAction = 'BILLING_PLAN_DOWNGRADED';
      }
    }

    const amount =
      typeof session.amount_total === 'number'
        ? session.amount_total / 100
        : undefined;

    await this.auditLogService.create({
      organizationId,
      action: auditAction,
      resourceType: 'Subscription',
      resourceId: updatedSub.id,
      actorRole: 'STRIPE_WEBHOOK',
      severity: AuditSeverity.INFO,
      details: {
        stripeCustomerId,
        stripeSubscriptionId,
        planCode: targetPlan.code,
        previousTier,
        newTier,
        amount,
        currency: session.currency?.toUpperCase() ?? 'MXN',
      },
    });

    this.logger.log({
      event: 'subscription_synced_after_checkout',
      organizationId,
      subscriptionId: updatedSub.id,
      planTier: targetPlan.tier,
      action: auditAction,
    });
  }

  private async handleCustomerSubscriptionUpdated(
    stripeSub: Stripe.Subscription,
  ) {
    const rawSub = stripeSub as unknown as {
      current_period_start?: number;
      current_period_end?: number;
      cancel_at_period_end?: boolean;
      canceled_at?: number | null;
      ended_at?: number | null;
    };

    const stripeSubscriptionId = stripeSub.id;
    const stripeCustomerId = stripeSub.customer as string;
    const stripePriceId = stripeSub.items?.data?.[0]?.price?.id ?? null;
    const status = this.mapStripeStatus(stripeSub.status);
    const cancelAtPeriodEnd = rawSub.cancel_at_period_end ?? false;
    const now = new Date();
    const currentPeriodStart = rawSub.current_period_start
      ? new Date(rawSub.current_period_start * 1000)
      : now;
    const currentPeriodEnd = rawSub.current_period_end
      ? new Date(rawSub.current_period_end * 1000)
      : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const existingSub = await this.prisma.subscription.findFirst({
      where: {
        OR: [
          { stripeSubscriptionId },
          { stripeCustomerId },
          { externalSubscriptionId: stripeSubscriptionId },
        ],
      },
      include: { plan: true },
    });

    if (!existingSub) {
      this.logger.warn({
        event: 'subscription_update_target_not_found',
        stripeSubscriptionId,
        stripeCustomerId,
      });
      return;
    }

    // Optional plan switch if price changed
    let planId = existingSub.planId;
    let targetPlan = existingSub.plan;

    if (stripePriceId) {
      const planForPrice = await this.prisma.plan.findFirst({
        where: { stripePriceId, isActive: true },
      });
      if (planForPrice) {
        planId = planForPrice.id;
        targetPlan = planForPrice;
      }
    }

    const previousTier = existingSub.plan?.tier ?? null;
    const newTier = targetPlan.tier;

    const updated = await this.prisma.subscription.update({
      where: { id: existingSub.id },
      data: {
        planId,
        status,
        stripeCustomerId,
        stripeSubscriptionId,
        stripePriceId,
        cancelAtPeriodEnd,
        currentPeriodStart,
        currentPeriodEnd,
        currentPeriodStartedAt: currentPeriodStart,
        currentPeriodEndsAt: currentPeriodEnd,
        canceledAt: rawSub.canceled_at ? new Date(rawSub.canceled_at * 1000) : null,
        endedAt: rawSub.ended_at ? new Date(rawSub.ended_at * 1000) : null,
      },
    });

    // Detect plan tier changes
    let auditAction = 'SUBSCRIPTION_UPDATED_FROM_STRIPE';
    if (previousTier && newTier && previousTier !== newTier) {
      const prevWeight = TIER_WEIGHTS[previousTier] ?? 0;
      const newWeight = TIER_WEIGHTS[newTier] ?? 0;
      if (newWeight > prevWeight) {
        auditAction = 'BILLING_PLAN_UPGRADED';
      } else if (newWeight < prevWeight) {
        auditAction = 'BILLING_PLAN_DOWNGRADED';
      }
    }

    await this.auditLogService.create({
      organizationId: existingSub.organizationId,
      action: auditAction,
      resourceType: 'Subscription',
      resourceId: updated.id,
      actorRole: 'STRIPE_WEBHOOK',
      severity: AuditSeverity.INFO,
      details: {
        oldStatus: existingSub.status,
        newStatus: status,
        previousTier,
        newTier,
        cancelAtPeriodEnd,
        stripeSubscriptionId,
        stripeCustomerId,
      },
    });

    this.logger.log({
      event: 'subscription_updated_from_stripe_webhook',
      subscriptionId: updated.id,
      status: updated.status,
      action: auditAction,
    });
  }

  private async handleCustomerSubscriptionDeleted(
    stripeSub: Stripe.Subscription,
  ) {
    const stripeSubscriptionId = stripeSub.id;

    const existingSub = await this.prisma.subscription.findFirst({
      where: {
        OR: [
          { stripeSubscriptionId },
          { externalSubscriptionId: stripeSubscriptionId },
        ],
      },
      include: { plan: true },
    });

    if (!existingSub) {
      this.logger.warn({
        event: 'subscription_deletion_target_not_found',
        stripeSubscriptionId,
      });
      return;
    }

    const updated = await this.prisma.subscription.update({
      where: { id: existingSub.id },
      data: {
        status: SubscriptionStatus.CANCELED,
        canceledAt: new Date(),
        endedAt: new Date(),
      },
    });

    await this.auditLogService.create({
      organizationId: existingSub.organizationId,
      action: 'BILLING_SUBSCRIPTION_CANCELED',
      resourceType: 'Subscription',
      resourceId: updated.id,
      actorRole: 'STRIPE_WEBHOOK',
      severity: AuditSeverity.HIGH,
      details: {
        stripeSubscriptionId,
        stripeCustomerId: existingSub.stripeCustomerId,
        previousTier: existingSub.plan?.tier ?? null,
      },
    });

    this.logger.log({
      event: 'subscription_canceled_from_stripe_webhook',
      subscriptionId: updated.id,
    });
  }

  /**
   * Handles invoice.payment_failed event:
   * Sets subscription status to PAST_DUE, grants configurable grace period (7 days), and writes high-severity audit log.
   */
  private async handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
    const rawInvoice = invoice as unknown as {
      subscription?: string | null;
      customer?: string | null;
      amount_due?: number;
      currency?: string;
      attempt_count?: number;
      next_payment_attempt?: number | null;
      lines?: {
        data?: Array<{ subscription?: string | null }>;
      };
    };

    const stripeSubscriptionId =
      rawInvoice.subscription ||
      rawInvoice.lines?.data?.[0]?.subscription ||
      null;
    const stripeCustomerId = (rawInvoice.customer as string) || null;

    const existingSub = await this.prisma.subscription.findFirst({
      where: {
        OR: [
          ...(stripeSubscriptionId
            ? [
                { stripeSubscriptionId },
                { externalSubscriptionId: stripeSubscriptionId },
              ]
            : []),
          ...(stripeCustomerId ? [{ stripeCustomerId }] : []),
        ],
      },
      include: { plan: true },
    });

    if (!existingSub) {
      this.logger.warn({
        event: 'invoice_payment_failed_subscription_not_found',
        stripeSubscriptionId,
        stripeCustomerId,
        invoiceId: invoice.id,
      });
      return;
    }

    // Default 7-day grace period from payment failure
    const now = new Date();
    const gracePeriodEndsAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const updated = await this.prisma.subscription.update({
      where: { id: existingSub.id },
      data: {
        status: SubscriptionStatus.PAST_DUE,
        gracePeriodEndsAt,
      },
    });

    const amount =
      typeof rawInvoice.amount_due === 'number'
        ? rawInvoice.amount_due / 100
        : 0;

    await this.auditLogService.create({
      organizationId: existingSub.organizationId,
      action: 'BILLING_PAYMENT_FAILED',
      resourceType: 'Subscription',
      resourceId: updated.id,
      actorRole: 'STRIPE_WEBHOOK',
      severity: AuditSeverity.HIGH,
      details: {
        stripeCustomerId,
        stripeSubscriptionId,
        invoiceId: invoice.id,
        amount,
        currency: rawInvoice.currency?.toUpperCase() ?? 'MXN',
        attemptCount: rawInvoice.attempt_count ?? 1,
        nextPaymentAttempt: rawInvoice.next_payment_attempt
          ? new Date(rawInvoice.next_payment_attempt * 1000).toISOString()
          : null,
        gracePeriodEndsAt: gracePeriodEndsAt.toISOString(),
      },
    });

    this.logger.warn({
      event: 'subscription_dunning_payment_failed',
      organizationId: existingSub.organizationId,
      subscriptionId: updated.id,
      gracePeriodEndsAt,
      invoiceId: invoice.id,
    });
  }

  /**
   * Handles invoice.paid event:
   * Restores status to ACTIVE, clears gracePeriodEndsAt, updates period boundaries, and writes audit log.
   */
  private async handleInvoicePaid(invoice: Stripe.Invoice) {
    const rawInvoice = invoice as unknown as {
      subscription?: string | null;
      customer?: string | null;
      amount_paid?: number;
      currency?: string;
      lines?: {
        data?: Array<{
          subscription?: string | null;
          period?: { start?: number; end?: number };
        }>;
      };
    };

    const stripeSubscriptionId =
      rawInvoice.subscription ||
      rawInvoice.lines?.data?.[0]?.subscription ||
      null;
    const stripeCustomerId = (rawInvoice.customer as string) || null;

    const existingSub = await this.prisma.subscription.findFirst({
      where: {
        OR: [
          ...(stripeSubscriptionId
            ? [
                { stripeSubscriptionId },
                { externalSubscriptionId: stripeSubscriptionId },
              ]
            : []),
          ...(stripeCustomerId ? [{ stripeCustomerId }] : []),
        ],
      },
      include: { plan: true },
    });

    if (!existingSub) {
      this.logger.warn({
        event: 'invoice_paid_subscription_not_found',
        stripeSubscriptionId,
        stripeCustomerId,
        invoiceId: invoice.id,
      });
      return;
    }

    const linePeriod = rawInvoice.lines?.data?.[0]?.period;
    const currentPeriodStart = linePeriod?.start
      ? new Date(linePeriod.start * 1000)
      : existingSub.currentPeriodStart;
    const currentPeriodEnd = linePeriod?.end
      ? new Date(linePeriod.end * 1000)
      : existingSub.currentPeriodEnd;

    const updated = await this.prisma.subscription.update({
      where: { id: existingSub.id },
      data: {
        status: SubscriptionStatus.ACTIVE,
        gracePeriodEndsAt: null,
        currentPeriodStart,
        currentPeriodEnd,
        currentPeriodStartedAt: currentPeriodStart,
        currentPeriodEndsAt: currentPeriodEnd,
        canceledAt: null,
        endedAt: null,
      },
    });

    const amount =
      typeof rawInvoice.amount_paid === 'number'
        ? rawInvoice.amount_paid / 100
        : 0;

    await this.auditLogService.create({
      organizationId: existingSub.organizationId,
      action: 'BILLING_PAYMENT_SUCCEEDED',
      resourceType: 'Subscription',
      resourceId: updated.id,
      actorRole: 'STRIPE_WEBHOOK',
      severity: AuditSeverity.INFO,
      details: {
        stripeCustomerId,
        stripeSubscriptionId,
        invoiceId: invoice.id,
        amount,
        currency: rawInvoice.currency?.toUpperCase() ?? 'MXN',
        previousStatus: existingSub.status,
      },
    });

    this.logger.log({
      event: 'subscription_payment_succeeded_restored',
      organizationId: existingSub.organizationId,
      subscriptionId: updated.id,
      status: updated.status,
      invoiceId: invoice.id,
    });
  }

  private mapStripeStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
    switch (status) {
      case 'active':
        return SubscriptionStatus.ACTIVE;
      case 'past_due':
        return SubscriptionStatus.PAST_DUE;
      case 'canceled':
        return SubscriptionStatus.CANCELED;
      case 'trialing':
        return SubscriptionStatus.TRIALING;
      case 'incomplete':
        return SubscriptionStatus.INCOMPLETE;
      case 'incomplete_expired':
        return SubscriptionStatus.INCOMPLETE_EXPIRED;
      case 'unpaid':
        return SubscriptionStatus.UNPAID;
      case 'paused':
        return SubscriptionStatus.FROZEN;
      default:
        return SubscriptionStatus.ACTIVE;
    }
  }
}
