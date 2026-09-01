import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BillingInterval, PlanTier, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BILLING_PROVIDER } from './billing.constants';
import { BillingService } from './billing.service';

describe('BillingService', () => {
  let service: BillingService;
  let providerMock: {
    createCustomer: jest.Mock;
    createSubscription: jest.Mock;
    changePlan: jest.Mock;
    cancelSubscription: jest.Mock;
  };
  let prismaMock: {
    subscription: {
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    plan: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    providerMock = {
      createCustomer: jest.fn(),
      createSubscription: jest.fn(),
      changePlan: jest.fn(),
      cancelSubscription: jest.fn(),
    };

    prismaMock = {
      subscription: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      plan: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingService,
        {
          provide: BILLING_PROVIDER,
          useValue: providerMock,
        },
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<BillingService>(BillingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createCustomer', () => {
    it('delegates to billing provider', async () => {
      providerMock.createCustomer.mockResolvedValue({
        externalCustomerId: 'cus_xyz_123',
      });

      const result = await service.createCustomer(
        'org-1',
        'test@test.com',
        'Clinic Test',
      );

      expect(providerMock.createCustomer).toHaveBeenCalledWith(
        'org-1',
        'test@test.com',
        'Clinic Test',
      );
      expect(result).toEqual({ externalCustomerId: 'cus_xyz_123' });
    });
  });

  describe('createSubscription', () => {
    it('delegates to billing provider with optional customer ID', async () => {
      const now = new Date();
      providerMock.createSubscription.mockResolvedValue({
        externalSubscriptionId: 'sub_xyz_123',
        status: 'TRIALING',
        currentPeriodEndsAt: now,
      });

      const result = await service.createSubscription(
        'org-1',
        'pro-monthly',
        'cus_xyz_123',
      );

      expect(providerMock.createSubscription).toHaveBeenCalledWith(
        'org-1',
        'pro-monthly',
        'cus_xyz_123',
      );
      expect(result).toEqual({
        externalSubscriptionId: 'sub_xyz_123',
        status: 'TRIALING',
        currentPeriodEndsAt: now,
      });
    });
  });

  describe('changePlan', () => {
    it('delegates to billing provider', async () => {
      const now = new Date();
      providerMock.changePlan.mockResolvedValue({
        status: 'ACTIVE',
        currentPeriodEndsAt: now,
      });

      const result = await service.changePlan(
        'sub_xyz_123',
        'enterprise-custom',
      );

      expect(providerMock.changePlan).toHaveBeenCalledWith(
        'sub_xyz_123',
        'enterprise-custom',
      );
      expect(result).toEqual({
        status: 'ACTIVE',
        currentPeriodEndsAt: now,
      });
    });
  });

  describe('cancelSubscription', () => {
    it('delegates to billing provider with optional reason', async () => {
      const now = new Date();
      providerMock.cancelSubscription.mockResolvedValue({
        status: 'CANCELED',
        canceledAt: now,
      });

      const result = await service.cancelSubscription(
        'sub_xyz_123',
        'Customer downsizing',
      );

      expect(providerMock.cancelSubscription).toHaveBeenCalledWith(
        'sub_xyz_123',
        'Customer downsizing',
      );
      expect(result).toEqual({
        status: 'CANCELED',
        canceledAt: now,
      });
    });
  });

  describe('manualTransition', () => {
    it('updates status to CANCELED and records cancellation timestamps', async () => {
      const existing = {
        id: 'sub-1',
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEndsAt: new Date('2026-09-01'),
      };
      prismaMock.subscription.findFirst.mockResolvedValue(existing);
      prismaMock.subscription.update.mockImplementation(
        ({ data }: { data: Record<string, unknown> }) => ({
          ...existing,
          ...data,
        }),
      );

      const result = await service.manualTransition(
        'sub-1',
        SubscriptionStatus.CANCELED,
        'Fraud investigation',
      );

      expect(prismaMock.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: expect.objectContaining({
          status: SubscriptionStatus.CANCELED,
          cancelReason: 'Fraud investigation',
        }) as Record<string, unknown>,
        include: { plan: true },
      });
      expect(result.status).toBe(SubscriptionStatus.CANCELED);
    });

    it('updates status to ACTIVE and extends past period if expired', async () => {
      const past = new Date(Date.now() - 1000000);
      const existing = {
        id: 'sub-2',
        status: SubscriptionStatus.EXPIRED,
        currentPeriodEndsAt: past,
      };
      prismaMock.subscription.findFirst.mockResolvedValue(existing);
      prismaMock.subscription.update.mockImplementation(
        ({ data }: { data: Record<string, unknown> }) => ({
          ...existing,
          ...data,
        }),
      );

      const result = await service.manualTransition(
        'sub-2',
        SubscriptionStatus.ACTIVE,
      );

      expect(prismaMock.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-2' },
        data: expect.objectContaining({
          status: SubscriptionStatus.ACTIVE,
          canceledAt: null,
          endedAt: null,
          cancelReason: null,
        }) as Record<string, unknown>,
        include: { plan: true },
      });
      expect(result.status).toBe(SubscriptionStatus.ACTIVE);
    });

    it('throws NotFoundException when subscription is not found', async () => {
      prismaMock.subscription.findFirst.mockResolvedValue(null);

      await expect(
        service.manualTransition('missing-id', SubscriptionStatus.ACTIVE),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('extendTrial', () => {
    it('extends trial period and updates end dates', async () => {
      const future = new Date(Date.now() + 5 * 86400000);
      const existing = {
        id: 'sub-trial',
        status: SubscriptionStatus.TRIALING,
        trialEndsAt: future,
      };
      prismaMock.subscription.findFirst.mockResolvedValue(existing);
      prismaMock.subscription.update.mockImplementation(
        ({ data }: { data: Record<string, unknown> }) => ({
          ...existing,
          ...data,
        }),
      );

      const result = await service.extendTrial('sub-trial', 7);

      expect(prismaMock.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-trial' },
        data: expect.objectContaining({
          status: SubscriptionStatus.TRIALING,
        }) as Record<string, unknown>,
        include: { plan: true },
      });
      expect(result.status).toBe(SubscriptionStatus.TRIALING);
    });

    it('throws NotFoundException when subscription does not exist', async () => {
      prismaMock.subscription.findFirst.mockResolvedValue(null);

      await expect(service.extendTrial('missing-id', 7)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('planOverride', () => {
    it('forces a plan change and resets period dates', async () => {
      const existing = {
        id: 'sub-override',
        planId: 'old-plan-id',
        status: SubscriptionStatus.ACTIVE,
      };
      const newPlan = {
        id: 'new-plan-id',
        code: 'enterprise-custom',
        tier: PlanTier.ENTERPRISE,
        billingInterval: BillingInterval.ANNUAL,
        isActive: true,
      };

      prismaMock.subscription.findFirst.mockResolvedValue(existing);
      prismaMock.plan.findFirst.mockResolvedValue(newPlan);
      prismaMock.subscription.update.mockImplementation(
        ({ data }: { data: Record<string, unknown> }) => ({
          ...existing,
          ...data,
          plan: newPlan,
        }),
      );

      const result = await service.planOverride(
        'sub-override',
        'enterprise-custom',
      );

      expect(prismaMock.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-override' },
        data: expect.objectContaining({
          planId: 'new-plan-id',
          status: SubscriptionStatus.ACTIVE,
        }) as Record<string, unknown>,
        include: { plan: true },
      });
      expect(result.planId).toBe('new-plan-id');
    });

    it('throws NotFoundException if subscription not found', async () => {
      prismaMock.subscription.findFirst.mockResolvedValue(null);

      await expect(
        service.planOverride('missing-sub', 'pro-monthly'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException if new plan is not found', async () => {
      prismaMock.subscription.findFirst.mockResolvedValue({ id: 'sub-1' });
      prismaMock.plan.findFirst.mockResolvedValue(null);

      await expect(
        service.planOverride('sub-1', 'invalid-plan'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getOrganizationSubscription', () => {
    it('queries active subscription including plan & entitlements', async () => {
      const mockSub = {
        id: 'sub-1',
        organizationId: 'org-1',
        status: 'ACTIVE',
        plan: {
          id: 'plan-1',
          code: 'pro-monthly',
          entitlements: [],
        },
      };

      prismaMock.subscription.findFirst.mockResolvedValue(mockSub);

      const result = await service.getOrganizationSubscription('org-1');

      expect(prismaMock.subscription.findFirst).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
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
      expect(result).toEqual(mockSub);
    });
  });

  describe('listAvailablePlans', () => {
    it('queries active public plans ordered by sortOrder', async () => {
      const mockPlans = [
        { id: 'plan-1', code: 'free-tier', sortOrder: 1 },
        { id: 'plan-2', code: 'pro-monthly', sortOrder: 2 },
      ];

      prismaMock.plan.findMany.mockResolvedValue(mockPlans);

      const result = await service.listAvailablePlans();

      expect(prismaMock.plan.findMany).toHaveBeenCalledWith({
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
      expect(result).toEqual(mockPlans);
    });
  });

  describe('getSubscriptionOverview', () => {
    it('throws NotFoundException if organization does not exist', async () => {
      (prismaMock as any).organization = {
        findUnique: jest.fn().mockResolvedValue(null),
      };

      await expect(
        service.getSubscriptionOverview('non-existent-org'),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns formatted subscription overview with quotas and usage metrics', async () => {
      const now = new Date();
      const mockSub = {
        id: 'sub-1',
        status: SubscriptionStatus.ACTIVE,
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_123',
        stripePriceId: 'price_123',
        cancelAtPeriodEnd: false,
        currentPeriodStart: now,
        currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        plan: {
          id: 'plan-pro-id',
          tier: PlanTier.PRO,
          code: 'pro-monthly',
          name: 'Pro Plan',
          description: 'Pro description',
          billingInterval: BillingInterval.MONTHLY,
          basePrice: { toString: () => '999.00' },
          currency: 'MXN',
          stripePriceId: 'price_123',
          quota: {
            maxTherapists: 3,
            maxBranches: 2,
            maxNotificationsPerMonth: 500,
            maxPatients: 500,
            canCustomBrand: true,
            canTeleconsultation: true,
          },
        },
      };

      (prismaMock as any).organization = {
        findUnique: jest.fn().mockResolvedValue({
          id: 'org-1',
          subscriptions: [mockSub],
        }),
      };
      (prismaMock as any).organizationMembership = {
        count: jest.fn().mockResolvedValue(2),
      };
      (prismaMock as any).branch = {
        count: jest.fn().mockResolvedValue(1),
      };
      (prismaMock as any).organizationUsage = {
        findFirst: jest.fn().mockResolvedValue({
          notificationsCount: 85,
        }),
      };

      const result = await service.getSubscriptionOverview('org-1');

      expect(result.id).toBe('sub-1');
      expect(result.status).toBe(SubscriptionStatus.ACTIVE);
      expect(result.plan.tier).toBe(PlanTier.PRO);
      expect(result.quotas.maxTherapists).toBe(3);
      expect(result.quotas.maxBranches).toBe(2);
      expect(result.quotas.maxNotificationsPerMonth).toBe(500);
      expect(result.usage.therapistsCount).toBe(2);
      expect(result.usage.branchesCount).toBe(1);
      expect(result.usage.notificationsCount).toBe(85);
    });
  });
});
