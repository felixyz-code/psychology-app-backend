import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PlanTier, SubscriptionStatus } from '@prisma/client';
import { AuditLogService } from '../../audit-logs/audit-logs.service';
import { AppConfigService } from '../../config/configuration';
import { PrismaService } from '../../prisma/prisma.service';
import { StripeBillingService } from './stripe-billing.service';

describe('StripeBillingService', () => {
  let service: StripeBillingService;
  let prisma: {
    organization: { findUnique: jest.Mock };
    plan: { findFirst: jest.Mock };
    subscription: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
  };
  let auditLogService: { create: jest.Mock };
  let configService: { stripeSecretKey: string | null; stripeWebhookSecret: string | null };

  const orgId = 'org-uuid-1111-2222-3333-444444444444';
  const subId = 'sub-uuid-1111-2222-3333-444444444444';

  beforeEach(async () => {
    prisma = {
      organization: {
        findUnique: jest.fn(),
      },
      plan: {
        findFirst: jest.fn(),
      },
      subscription: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    auditLogService = {
      create: jest.fn().mockResolvedValue({ id: 'audit-log-1' }),
    };

    configService = {
      stripeSecretKey: null, // Running in mock mode for unit tests
      stripeWebhookSecret: null,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StripeBillingService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogService, useValue: auditLogService },
        { provide: AppConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<StripeBillingService>(StripeBillingService);
  });

  describe('createCheckoutSession', () => {
    it('throws NotFoundException if organization does not exist', async () => {
      prisma.organization.findUnique.mockResolvedValue(null);

      await expect(
        service.createCheckoutSession('non-existent', 'price_123'),
      ).rejects.toThrow(NotFoundException);
    });

    it('creates mock checkout session and emits BILLING_CHECKOUT_INITIATED audit log', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        id: orgId,
        subscriptions: [],
      });

      const session = await service.createCheckoutSession(orgId, 'price_starter');

      expect(session.url).toContain('https://checkout.stripe.com/mock_pay/price_starter');
      expect(session.sessionId).toContain('cs_mock_');
      expect(auditLogService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: orgId,
          action: 'BILLING_CHECKOUT_INITIATED',
          resourceType: 'Subscription',
          details: expect.objectContaining({
            priceId: 'price_starter',
          }),
        }),
      );
    });
  });

  describe('createCustomerPortalSession', () => {
    it('throws BadRequestException if organization has no Stripe customer ID', async () => {
      prisma.subscription.findFirst.mockResolvedValue(null);

      await expect(
        service.createCustomerPortalSession(orgId),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates mock portal session and emits BILLING_PORTAL_SESSION_INITIATED audit log', async () => {
      prisma.subscription.findFirst.mockResolvedValue({
        id: subId,
        organizationId: orgId,
        stripeCustomerId: 'cus_mock_123',
      });

      const session = await service.createCustomerPortalSession(orgId);

      expect(session.url).toContain('https://billing.stripe.com/mock_portal/cus_mock_123');
      expect(auditLogService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: orgId,
          action: 'BILLING_PORTAL_SESSION_INITIATED',
          resourceType: 'Subscription',
          details: {
            stripeCustomerId: 'cus_mock_123',
          },
        }),
      );
    });
  });

  describe('handleWebhookEvent: invoice.payment_failed (Dunning)', () => {
    it('transitions subscription to PAST_DUE, assigns 7-day grace period, and emits BILLING_PAYMENT_FAILED', async () => {
      const mockSub = {
        id: subId,
        organizationId: orgId,
        status: SubscriptionStatus.ACTIVE,
        stripeSubscriptionId: 'sub_stripe_123',
        stripeCustomerId: 'cus_stripe_123',
        plan: { tier: PlanTier.PRO },
      };

      prisma.subscription.findFirst.mockResolvedValue(mockSub);
      prisma.subscription.update.mockResolvedValue({
        ...mockSub,
        status: SubscriptionStatus.PAST_DUE,
        gracePeriodEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      const invoicePayload = {
        id: 'evt_invoice_failed',
        type: 'invoice.payment_failed',
        data: {
          object: {
            id: 'in_failed_123',
            customer: 'cus_stripe_123',
            subscription: 'sub_stripe_123',
            amount_due: 99900,
            currency: 'mxn',
            attempt_count: 2,
            next_payment_attempt: Math.floor((Date.now() + 86400000) / 1000),
          },
        },
      };

      const result = await service.handleWebhookEvent(
        'mock-sig',
        JSON.stringify(invoicePayload),
      );

      expect(result.received).toBe(true);
      expect(result.eventType).toBe('invoice.payment_failed');

      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { id: subId },
        data: expect.objectContaining({
          status: SubscriptionStatus.PAST_DUE,
          gracePeriodEndsAt: expect.any(Date),
        }),
      });

      expect(auditLogService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: orgId,
          action: 'BILLING_PAYMENT_FAILED',
          resourceType: 'Subscription',
          resourceId: subId,
          severity: 'HIGH',
          details: expect.objectContaining({
            stripeCustomerId: 'cus_stripe_123',
            stripeSubscriptionId: 'sub_stripe_123',
            invoiceId: 'in_failed_123',
            amount: 999,
            currency: 'MXN',
            attemptCount: 2,
          }),
        }),
      );
    });
  });

  describe('handleWebhookEvent: invoice.paid (Payment Recovery)', () => {
    it('restores subscription to ACTIVE, clears grace period, and emits BILLING_PAYMENT_SUCCEEDED', async () => {
      const mockSub = {
        id: subId,
        organizationId: orgId,
        status: SubscriptionStatus.PAST_DUE,
        gracePeriodEndsAt: new Date(),
        stripeSubscriptionId: 'sub_stripe_123',
        stripeCustomerId: 'cus_stripe_123',
        currentPeriodStart: new Date('2026-08-01T00:00:00Z'),
        currentPeriodEnd: new Date('2026-08-31T00:00:00Z'),
        plan: { tier: PlanTier.PRO },
      };

      prisma.subscription.findFirst.mockResolvedValue(mockSub);
      prisma.subscription.update.mockResolvedValue({
        ...mockSub,
        status: SubscriptionStatus.ACTIVE,
        gracePeriodEndsAt: null,
      });

      const invoicePayload = {
        id: 'evt_invoice_paid',
        type: 'invoice.paid',
        data: {
          object: {
            id: 'in_paid_123',
            customer: 'cus_stripe_123',
            subscription: 'sub_stripe_123',
            amount_paid: 99900,
            currency: 'mxn',
            lines: {
              data: [
                {
                  subscription: 'sub_stripe_123',
                  period: {
                    start: 1788134400,
                    end: 1790812800,
                  },
                },
              ],
            },
          },
        },
      };

      const result = await service.handleWebhookEvent(
        'mock-sig',
        JSON.stringify(invoicePayload),
      );

      expect(result.received).toBe(true);
      expect(result.eventType).toBe('invoice.paid');

      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { id: subId },
        data: expect.objectContaining({
          status: SubscriptionStatus.ACTIVE,
          gracePeriodEndsAt: null,
          canceledAt: null,
          endedAt: null,
        }),
      });

      expect(auditLogService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: orgId,
          action: 'BILLING_PAYMENT_SUCCEEDED',
          resourceType: 'Subscription',
          details: expect.objectContaining({
            stripeCustomerId: 'cus_stripe_123',
            stripeSubscriptionId: 'sub_stripe_123',
            invoiceId: 'in_paid_123',
            amount: 999,
            currency: 'MXN',
          }),
        }),
      );
    });
  });

  describe('handleWebhookEvent: customer.subscription.deleted', () => {
    it('sets subscription to CANCELED and emits BILLING_SUBSCRIPTION_CANCELED', async () => {
      const mockSub = {
        id: subId,
        organizationId: orgId,
        status: SubscriptionStatus.ACTIVE,
        stripeSubscriptionId: 'sub_stripe_del_123',
        stripeCustomerId: 'cus_stripe_123',
        plan: { tier: PlanTier.CLINIC },
      };

      prisma.subscription.findFirst.mockResolvedValue(mockSub);
      prisma.subscription.update.mockResolvedValue({
        ...mockSub,
        status: SubscriptionStatus.CANCELED,
      });

      const eventPayload = {
        id: 'evt_sub_deleted',
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_stripe_del_123',
            customer: 'cus_stripe_123',
          },
        },
      };

      const result = await service.handleWebhookEvent(
        'mock-sig',
        JSON.stringify(eventPayload),
      );

      expect(result.received).toBe(true);
      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { id: subId },
        data: expect.objectContaining({
          status: SubscriptionStatus.CANCELED,
          canceledAt: expect.any(Date),
          endedAt: expect.any(Date),
        }),
      });

      expect(auditLogService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: orgId,
          action: 'BILLING_SUBSCRIPTION_CANCELED',
          resourceType: 'Subscription',
          severity: 'HIGH',
          details: expect.objectContaining({
            stripeSubscriptionId: 'sub_stripe_del_123',
            previousTier: PlanTier.CLINIC,
          }),
        }),
      );
    });
  });

  describe('handleWebhookEvent: customer.subscription.updated (Upgrades & Downgrades)', () => {
    it('detects upgrade when switching from STARTER to PRO and emits BILLING_PLAN_UPGRADED', async () => {
      const mockSub = {
        id: subId,
        organizationId: orgId,
        planId: 'plan-starter-id',
        status: SubscriptionStatus.ACTIVE,
        stripeSubscriptionId: 'sub_stripe_upg_123',
        stripeCustomerId: 'cus_stripe_123',
        plan: { id: 'plan-starter-id', tier: PlanTier.STARTER },
      };

      const proPlan = {
        id: 'plan-pro-id',
        tier: PlanTier.PRO,
        stripePriceId: 'price_pro_123',
      };

      prisma.subscription.findFirst.mockResolvedValue(mockSub);
      prisma.plan.findFirst.mockResolvedValue(proPlan);
      prisma.subscription.update.mockResolvedValue({
        ...mockSub,
        planId: proPlan.id,
      });

      const eventPayload = {
        id: 'evt_sub_updated_upg',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_stripe_upg_123',
            customer: 'cus_stripe_123',
            status: 'active',
            items: {
              data: [{ price: { id: 'price_pro_123' } }],
            },
          },
        },
      };

      await service.handleWebhookEvent(
        'mock-sig',
        JSON.stringify(eventPayload),
      );

      expect(auditLogService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: orgId,
          action: 'BILLING_PLAN_UPGRADED',
          resourceType: 'Subscription',
          details: expect.objectContaining({
            previousTier: PlanTier.STARTER,
            newTier: PlanTier.PRO,
          }),
        }),
      );
    });

    it('detects downgrade when switching from CLINIC to STARTER and emits BILLING_PLAN_DOWNGRADED', async () => {
      const mockSub = {
        id: subId,
        organizationId: orgId,
        planId: 'plan-clinic-id',
        status: SubscriptionStatus.ACTIVE,
        stripeSubscriptionId: 'sub_stripe_down_123',
        stripeCustomerId: 'cus_stripe_123',
        plan: { id: 'plan-clinic-id', tier: PlanTier.CLINIC },
      };

      const starterPlan = {
        id: 'plan-starter-id',
        tier: PlanTier.STARTER,
        stripePriceId: 'price_starter_123',
      };

      prisma.subscription.findFirst.mockResolvedValue(mockSub);
      prisma.plan.findFirst.mockResolvedValue(starterPlan);
      prisma.subscription.update.mockResolvedValue({
        ...mockSub,
        planId: starterPlan.id,
      });

      const eventPayload = {
        id: 'evt_sub_updated_down',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_stripe_down_123',
            customer: 'cus_stripe_123',
            status: 'active',
            items: {
              data: [{ price: { id: 'price_starter_123' } }],
            },
          },
        },
      };

      await service.handleWebhookEvent(
        'mock-sig',
        JSON.stringify(eventPayload),
      );

      expect(auditLogService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: orgId,
          action: 'BILLING_PLAN_DOWNGRADED',
          resourceType: 'Subscription',
          details: expect.objectContaining({
            previousTier: PlanTier.CLINIC,
            newTier: PlanTier.STARTER,
          }),
        }),
      );
    });
  });
});
