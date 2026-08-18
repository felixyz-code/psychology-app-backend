import { NotFoundException } from '@nestjs/common';
import {
  BillingInterval,
  PaymentProvider,
  PlanTier,
  SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ManualBillingAdapter } from './manual-billing.adapter';

describe('ManualBillingAdapter', () => {
  let adapter: ManualBillingAdapter;
  let prismaMock: {
    organization: {
      findUnique: jest.Mock;
    };
    plan: {
      findFirst: jest.Mock;
    };
    subscription: {
      findFirst: jest.Mock;
      updateMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };

  const mockOrgId = 'a1111111-1111-4000-8000-111111111111';
  const mockOrg = {
    id: mockOrgId,
    slug: 'clinic-alpha',
    displayName: 'Clinic Alpha',
  };

  const mockFreePlan = {
    id: 'p1111111-1111-4000-8000-111111111111',
    code: 'free-tier',
    tier: PlanTier.FREE,
    name: 'Free Plan',
    trialDays: 0,
    billingInterval: BillingInterval.MONTHLY,
    isActive: true,
  };

  const mockProPlan = {
    id: 'p2222222-2222-4000-8000-222222222222',
    code: 'pro-monthly',
    tier: PlanTier.PROFESSIONAL,
    name: 'Professional Plan',
    trialDays: 14,
    billingInterval: BillingInterval.MONTHLY,
    isActive: true,
  };

  const mockEnterprisePlan = {
    id: 'p3333333-3333-4000-8000-333333333333',
    code: 'enterprise-annual',
    tier: PlanTier.ENTERPRISE,
    name: 'Enterprise Plan',
    trialDays: 0,
    billingInterval: BillingInterval.ANNUAL,
    isActive: true,
  };

  beforeEach(() => {
    prismaMock = {
      organization: {
        findUnique: jest.fn(),
      },
      plan: {
        findFirst: jest.fn(),
      },
      subscription: {
        findFirst: jest.fn(),
        updateMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    adapter = new ManualBillingAdapter(prismaMock as unknown as PrismaService);
  });

  describe('createCustomer', () => {
    it('generates a deterministic external customer ID when organization exists', async () => {
      prismaMock.organization.findUnique.mockResolvedValue(mockOrg);

      const result = await adapter.createCustomer(
        mockOrgId,
        'billing@alpha.com',
        'Clinic Alpha',
      );

      expect(prismaMock.organization.findUnique).toHaveBeenCalledWith({
        where: { id: mockOrgId },
      });
      expect(result.externalCustomerId).toBe(`manual_cus_${mockOrgId}`);
    });

    it('throws NotFoundException when organization is not found', async () => {
      prismaMock.organization.findUnique.mockResolvedValue(null);

      await expect(
        adapter.createCustomer(
          'non-existent-org',
          'billing@alpha.com',
          'Clinic Alpha',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('createSubscription', () => {
    it('creates a TRIALING subscription when plan has trialDays > 0', async () => {
      prismaMock.organization.findUnique.mockResolvedValue(mockOrg);
      prismaMock.plan.findFirst.mockResolvedValue(mockProPlan);
      prismaMock.subscription.updateMany.mockResolvedValue({ count: 0 });

      prismaMock.subscription.create.mockImplementation(
        ({ data }: { data: Record<string, unknown> }) => ({
          id: 'sub-created-uuid',
          ...data,
        }),
      );

      const result = await adapter.createSubscription(mockOrgId, 'pro-monthly');

      expect(prismaMock.subscription.updateMany).toHaveBeenCalledWith({
        where: {
          organizationId: mockOrgId,
          status: {
            in: [
              SubscriptionStatus.ACTIVE,
              SubscriptionStatus.TRIALING,
              SubscriptionStatus.PAST_DUE,
            ],
          },
        },
        data: expect.objectContaining({
          status: SubscriptionStatus.CANCELED,
        }) as Record<string, unknown>,
      });

      expect(prismaMock.subscription.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: mockOrgId,
          planId: mockProPlan.id,
          status: SubscriptionStatus.TRIALING,
          externalProvider: PaymentProvider.MANUAL,
          externalCustomerId: `manual_cus_${mockOrgId}`,
          seatQuantity: 1,
        }) as Record<string, unknown>,
      });

      expect(result.status).toBe(SubscriptionStatus.TRIALING);
      expect(result.externalSubscriptionId).toMatch(/^manual_sub_/);
      expect(result.currentPeriodEndsAt).toBeInstanceOf(Date);
    });

    it('creates an ACTIVE subscription when plan has trialDays === 0', async () => {
      prismaMock.organization.findUnique.mockResolvedValue(mockOrg);
      prismaMock.plan.findFirst.mockResolvedValue(mockFreePlan);
      prismaMock.subscription.updateMany.mockResolvedValue({ count: 0 });

      prismaMock.subscription.create.mockImplementation(
        ({ data }: { data: Record<string, unknown> }) => ({
          id: 'sub-free-uuid',
          ...data,
        }),
      );

      const result = await adapter.createSubscription(
        mockOrgId,
        'free-tier',
        'custom_cus_123',
      );

      expect(prismaMock.subscription.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: mockOrgId,
          planId: mockFreePlan.id,
          status: SubscriptionStatus.ACTIVE,
          externalCustomerId: 'custom_cus_123',
          trialStartedAt: null,
          trialEndsAt: null,
        }) as Record<string, unknown>,
      });

      expect(result.status).toBe(SubscriptionStatus.ACTIVE);
      expect(result.externalSubscriptionId).toMatch(/^manual_sub_/);
    });

    it('throws NotFoundException if organization does not exist', async () => {
      prismaMock.organization.findUnique.mockResolvedValue(null);

      await expect(
        adapter.createSubscription('invalid-org', 'pro-monthly'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException if plan is not found or inactive', async () => {
      prismaMock.organization.findUnique.mockResolvedValue(mockOrg);
      prismaMock.plan.findFirst.mockResolvedValue(null);

      await expect(
        adapter.createSubscription(mockOrgId, 'unknown-plan'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('changePlan', () => {
    it('successfully switches subscription to new plan', async () => {
      const existingSub = {
        id: 'sub-existing-1',
        externalSubscriptionId: 'manual_sub_abc123',
        organizationId: mockOrgId,
        planId: mockProPlan.id,
        status: SubscriptionStatus.TRIALING,
      };

      prismaMock.subscription.findFirst.mockResolvedValue(existingSub);
      prismaMock.plan.findFirst.mockResolvedValue(mockEnterprisePlan);
      prismaMock.subscription.update.mockImplementation(
        ({ data }: { data: Record<string, unknown> }) => ({
          ...existingSub,
          ...data,
        }),
      );

      const result = await adapter.changePlan(
        'manual_sub_abc123',
        'enterprise-annual',
      );

      expect(prismaMock.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-existing-1' },
        data: expect.objectContaining({
          planId: mockEnterprisePlan.id,
          status: SubscriptionStatus.ACTIVE,
          trialStartedAt: null,
          trialEndsAt: null,
          canceledAt: null,
          endedAt: null,
          cancelReason: null,
        }) as Record<string, unknown>,
      });

      expect(result.status).toBe(SubscriptionStatus.ACTIVE);
      expect(result.currentPeriodEndsAt).toBeInstanceOf(Date);
    });

    it('throws NotFoundException when subscription external id does not exist', async () => {
      prismaMock.subscription.findFirst.mockResolvedValue(null);

      await expect(
        adapter.changePlan('non-existent-sub', 'enterprise-annual'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when target plan is invalid', async () => {
      const existingSub = {
        id: 'sub-existing-1',
        externalSubscriptionId: 'manual_sub_abc123',
      };
      prismaMock.subscription.findFirst.mockResolvedValue(existingSub);
      prismaMock.plan.findFirst.mockResolvedValue(null);

      await expect(
        adapter.changePlan('manual_sub_abc123', 'invalid-plan-code'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('cancelSubscription', () => {
    it('marks subscription as CANCELED with timestamp and reason', async () => {
      const existingSub = {
        id: 'sub-to-cancel',
        externalSubscriptionId: 'manual_sub_cancel_1',
        status: SubscriptionStatus.ACTIVE,
      };

      prismaMock.subscription.findFirst.mockResolvedValue(existingSub);
      prismaMock.subscription.update.mockImplementation(
        ({ data }: { data: Record<string, unknown> }) => ({
          ...existingSub,
          ...data,
        }),
      );

      const result = await adapter.cancelSubscription(
        'manual_sub_cancel_1',
        'Customer requested cancellation via help desk',
      );

      expect(prismaMock.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-to-cancel' },
        data: expect.objectContaining({
          status: SubscriptionStatus.CANCELED,
          cancelReason: 'Customer requested cancellation via help desk',
        }) as Record<string, unknown>,
      });

      expect(result.status).toBe(SubscriptionStatus.CANCELED);
      expect(result.canceledAt).toBeInstanceOf(Date);
    });

    it('applies default cancellation reason when none is provided', async () => {
      const existingSub = {
        id: 'sub-to-cancel-2',
        externalSubscriptionId: 'manual_sub_cancel_2',
        status: SubscriptionStatus.ACTIVE,
      };

      prismaMock.subscription.findFirst.mockResolvedValue(existingSub);
      prismaMock.subscription.update.mockImplementation(
        ({ data }: { data: Record<string, unknown> }) => ({
          ...existingSub,
          ...data,
        }),
      );

      const result = await adapter.cancelSubscription('manual_sub_cancel_2');

      expect(prismaMock.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-to-cancel-2' },
        data: expect.objectContaining({
          status: SubscriptionStatus.CANCELED,
          cancelReason: 'Manually canceled by administrator/user',
        }) as Record<string, unknown>,
      });

      expect(result.status).toBe(SubscriptionStatus.CANCELED);
    });

    it('throws NotFoundException when subscription is not found', async () => {
      prismaMock.subscription.findFirst.mockResolvedValue(null);

      await expect(
        adapter.cancelSubscription('missing_sub_id'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
