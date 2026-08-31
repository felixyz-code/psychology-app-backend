import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  MembershipStatus,
  PlanTier,
  SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  QuotaExceededException,
  QuotaResource,
} from '../exceptions/quota-exceeded.exception';
import { QuotaEnforcementService } from './quota-enforcement.service';

describe('QuotaEnforcementService', () => {
  let service: QuotaEnforcementService;
  let prisma: {
    organization: {
      findUnique: jest.Mock;
    };
    plan: {
      findFirst: jest.Mock;
    };
    subscription: {
      create: jest.Mock;
    };
    organizationMembership: {
      count: jest.Mock;
    };
    branch: {
      count: jest.Mock;
    };
    organizationUsage: {
      findFirst: jest.Mock;
    };
  };

  const orgId = 'org-11111111-1111-4000-8000-111111111111';

  beforeEach(async () => {
    prisma = {
      organization: {
        findUnique: jest.fn(),
      },
      plan: {
        findFirst: jest.fn(),
      },
      subscription: {
        create: jest.fn(),
      },
      organizationMembership: {
        count: jest.fn(),
      },
      branch: {
        count: jest.fn(),
      },
      organizationUsage: {
        findFirst: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuotaEnforcementService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<QuotaEnforcementService>(QuotaEnforcementService);
  });

  describe('assertCanAddTherapist', () => {
    it('allows adding therapist when usage is strictly below tier quota limit', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        id: orgId,
        subscriptions: [
          {
            id: 'sub-1',
            status: SubscriptionStatus.ACTIVE,
            isExempt: false,
            plan: {
              id: 'plan-starter',
              tier: PlanTier.STARTER,
              quota: {
                maxTherapists: 1,
                maxBranches: 1,
                maxNotificationsPerMonth: 100,
              },
            },
          },
        ],
      });

      prisma.organizationMembership.count.mockResolvedValue(0);

      await expect(service.assertCanAddTherapist(orgId)).resolves.toBeUndefined();
      expect(prisma.organizationMembership.count).toHaveBeenCalledWith({
        where: {
          organizationId: orgId,
          status: MembershipStatus.ACTIVE,
        },
      });
    });

    it('throws QuotaExceededException (402) when therapist quota is reached on STARTER tier', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        id: orgId,
        subscriptions: [
          {
            id: 'sub-1',
            status: SubscriptionStatus.ACTIVE,
            isExempt: false,
            plan: {
              id: 'plan-starter',
              tier: PlanTier.STARTER,
              quota: {
                maxTherapists: 1,
                maxBranches: 1,
                maxNotificationsPerMonth: 100,
              },
            },
          },
        ],
      });

      prisma.organizationMembership.count.mockResolvedValue(1);

      try {
        await service.assertCanAddTherapist(orgId);
        fail('Should have thrown QuotaExceededException');
      } catch (error) {
        expect(error).toBeInstanceOf(QuotaExceededException);
        const quotaError = error as QuotaExceededException;
        expect(quotaError.getStatus()).toBe(402);
        const response = quotaError.getResponse() as Record<string, unknown>;
        expect(response.error).toBe('QUOTA_EXCEEDED');
        expect(response.resource).toBe(QuotaResource.THERAPISTS);
        expect(response.currentUsage).toBe(1);
        expect(response.maxAllowed).toBe(1);
        expect(response.currentTier).toBe(PlanTier.STARTER);
        expect(response.suggestedTier).toBe(PlanTier.PRO);
      }
    });

    it('suggests CLINIC tier when PRO therapist quota limit (3) is exceeded', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        id: orgId,
        subscriptions: [
          {
            id: 'sub-pro',
            status: SubscriptionStatus.ACTIVE,
            isExempt: false,
            plan: {
              id: 'plan-pro',
              tier: PlanTier.PRO,
              quota: {
                maxTherapists: 3,
                maxBranches: 2,
                maxNotificationsPerMonth: 500,
              },
            },
          },
        ],
      });

      prisma.organizationMembership.count.mockResolvedValue(3);

      try {
        await service.assertCanAddTherapist(orgId);
        fail('Should have thrown QuotaExceededException');
      } catch (error) {
        expect(error).toBeInstanceOf(QuotaExceededException);
        const quotaError = error as QuotaExceededException;
        expect(quotaError.getStatus()).toBe(402);
        const response = quotaError.getResponse() as Record<string, unknown>;
        expect(response.currentTier).toBe(PlanTier.PRO);
        expect(response.suggestedTier).toBe(PlanTier.CLINIC);
      }
    });

    it('respects customTherapistsLimit override over plan quota', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        id: orgId,
        subscriptions: [
          {
            id: 'sub-starter-override',
            status: SubscriptionStatus.ACTIVE,
            isExempt: false,
            customTherapistsLimit: 5,
            plan: {
              id: 'plan-starter',
              tier: PlanTier.STARTER,
              quota: {
                maxTherapists: 1,
              },
            },
          },
        ],
      });

      // 3 active therapists is under the custom limit of 5
      prisma.organizationMembership.count.mockResolvedValue(3);

      await expect(service.assertCanAddTherapist(orgId)).resolves.toBeUndefined();
    });

    it('bypasses quota validation for ENTERPRISE tier (unlimited)', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        id: orgId,
        subscriptions: [
          {
            id: 'sub-enterprise',
            status: SubscriptionStatus.ACTIVE,
            isExempt: false,
            plan: {
              id: 'plan-enterprise',
              tier: PlanTier.ENTERPRISE,
            },
          },
        ],
      });

      await expect(service.assertCanAddTherapist(orgId)).resolves.toBeUndefined();
      expect(prisma.organizationMembership.count).not.toHaveBeenCalled();
    });

    it('bypasses quota validation when subscription is LIFETIME_SPONSOR', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        id: orgId,
        subscriptions: [
          {
            id: 'sub-sponsor',
            status: SubscriptionStatus.LIFETIME_SPONSOR,
            isExempt: false,
            plan: {
              id: 'plan-starter',
              tier: PlanTier.STARTER,
            },
          },
        ],
      });

      await expect(service.assertCanAddTherapist(orgId)).resolves.toBeUndefined();
      expect(prisma.organizationMembership.count).not.toHaveBeenCalled();
    });

    it('bypasses quota validation when subscription has isExempt flag true', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        id: orgId,
        subscriptions: [
          {
            id: 'sub-exempt',
            status: SubscriptionStatus.ACTIVE,
            isExempt: true,
            plan: {
              id: 'plan-starter',
              tier: PlanTier.STARTER,
            },
          },
        ],
      });

      await expect(service.assertCanAddTherapist(orgId)).resolves.toBeUndefined();
      expect(prisma.organizationMembership.count).not.toHaveBeenCalled();
    });

    it('blocks therapist creation when subscription status is FROZEN', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        id: orgId,
        subscriptions: [
          {
            id: 'sub-frozen',
            organizationId: orgId,
            status: SubscriptionStatus.FROZEN,
            isExempt: false,
            plan: {
              id: 'plan-starter',
              tier: PlanTier.STARTER,
            },
          },
        ],
      });

      try {
        await service.assertCanAddTherapist(orgId);
        fail('Should have thrown QuotaExceededException');
      } catch (error) {
        expect(error).toBeInstanceOf(QuotaExceededException);
        const quotaError = error as QuotaExceededException;
        expect(quotaError.getStatus()).toBe(402);
        const response = quotaError.getResponse() as Record<string, unknown>;
        expect(response.message).toContain('FROZEN');
      }
    });

    it('allows therapist creation when subscription is PAST_DUE but within active grace period', async () => {
      const futureGrace = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
      prisma.organization.findUnique.mockResolvedValue({
        id: orgId,
        subscriptions: [
          {
            id: 'sub-past-due-grace',
            organizationId: orgId,
            status: SubscriptionStatus.PAST_DUE,
            gracePeriodEndsAt: futureGrace,
            isExempt: false,
            plan: {
              id: 'plan-starter',
              tier: PlanTier.STARTER,
              quota: {
                maxTherapists: 2,
              },
            },
          },
        ],
      });

      prisma.organizationMembership.count.mockResolvedValue(0);

      await expect(service.assertCanAddTherapist(orgId)).resolves.toBeUndefined();
    });

    it('blocks therapist creation when subscription is PAST_DUE and grace period has expired', async () => {
      const pastGrace = new Date(Date.now() - 24 * 60 * 60 * 1000);
      prisma.organization.findUnique.mockResolvedValue({
        id: orgId,
        subscriptions: [
          {
            id: 'sub-past-due-expired',
            organizationId: orgId,
            status: SubscriptionStatus.PAST_DUE,
            gracePeriodEndsAt: pastGrace,
            isExempt: false,
            plan: {
              id: 'plan-starter',
              tier: PlanTier.STARTER,
              quota: {
                maxTherapists: 2,
              },
            },
          },
        ],
      });

      try {
        await service.assertCanAddTherapist(orgId);
        fail('Should have thrown QuotaExceededException');
      } catch (error) {
        expect(error).toBeInstanceOf(QuotaExceededException);
        const quotaError = error as QuotaExceededException;
        expect(quotaError.getStatus()).toBe(402);
        const response = quotaError.getResponse() as Record<string, unknown>;
        expect(response.message).toContain('grace period for this organization has expired');
      }
    });

    it('blocks therapist creation when subscription status is CANCELED or UNPAID', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        id: orgId,
        subscriptions: [
          {
            id: 'sub-unpaid',
            organizationId: orgId,
            status: SubscriptionStatus.UNPAID,
            isExempt: false,
            plan: {
              id: 'plan-starter',
              tier: PlanTier.STARTER,
            },
          },
        ],
      });

      await expect(service.assertCanAddTherapist(orgId)).rejects.toThrow(
        QuotaExceededException,
      );
    });

    it('throws NotFoundException when organization does not exist', async () => {
      prisma.organization.findUnique.mockResolvedValue(null);

      await expect(service.assertCanAddTherapist('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('assertCanCreateBranch', () => {
    it('allows branch creation when branch count is below tier limit', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        id: orgId,
        subscriptions: [
          {
            id: 'sub-1',
            status: SubscriptionStatus.ACTIVE,
            isExempt: false,
            plan: {
              id: 'plan-pro',
              tier: PlanTier.PRO,
              quota: {
                maxBranches: 2,
              },
            },
          },
        ],
      });

      prisma.branch.count.mockResolvedValue(1);

      await expect(service.assertCanCreateBranch(orgId)).resolves.toBeUndefined();
      expect(prisma.branch.count).toHaveBeenCalledWith({
        where: {
          organizationId: orgId,
          isActive: true,
          deletedAt: null,
        },
      });
    });

    it('throws QuotaExceededException (402) when branch count reaches maximum', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        id: orgId,
        subscriptions: [
          {
            id: 'sub-1',
            status: SubscriptionStatus.ACTIVE,
            isExempt: false,
            plan: {
              id: 'plan-pro',
              tier: PlanTier.PRO,
              quota: {
                maxBranches: 2,
              },
            },
          },
        ],
      });

      prisma.branch.count.mockResolvedValue(2);

      try {
        await service.assertCanCreateBranch(orgId);
        fail('Should have thrown QuotaExceededException');
      } catch (error) {
        expect(error).toBeInstanceOf(QuotaExceededException);
        const quotaError = error as QuotaExceededException;
        expect(quotaError.getStatus()).toBe(402);
        const response = quotaError.getResponse() as Record<string, unknown>;
        expect(response.resource).toBe(QuotaResource.BRANCHES);
        expect(response.currentUsage).toBe(2);
        expect(response.maxAllowed).toBe(2);
        expect(response.suggestedTier).toBe(PlanTier.CLINIC);
      }
    });

    it('respects customBranchesLimit override', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        id: orgId,
        subscriptions: [
          {
            id: 'sub-custom',
            status: SubscriptionStatus.ACTIVE,
            isExempt: false,
            customBranchesLimit: 10,
            plan: {
              id: 'plan-starter',
              tier: PlanTier.STARTER,
              quota: {
                maxBranches: 1,
              },
            },
          },
        ],
      });

      prisma.branch.count.mockResolvedValue(5);

      await expect(service.assertCanCreateBranch(orgId)).resolves.toBeUndefined();
    });
  });

  describe('assertCanSendNotification', () => {
    it('allows sending notification when monthly count is below quota', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        id: orgId,
        subscriptions: [
          {
            id: 'sub-1',
            status: SubscriptionStatus.ACTIVE,
            isExempt: false,
            plan: {
              id: 'plan-starter',
              tier: PlanTier.STARTER,
              quota: {
                maxNotificationsPerMonth: 100,
              },
            },
          },
        ],
      });

      prisma.organizationUsage.findFirst.mockResolvedValue({
        notificationsCount: 45,
      });

      await expect(
        service.assertCanSendNotification(orgId),
      ).resolves.toBeUndefined();
    });

    it('throws QuotaExceededException (402) when monthly notifications quota is exhausted', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        id: orgId,
        subscriptions: [
          {
            id: 'sub-1',
            status: SubscriptionStatus.ACTIVE,
            isExempt: false,
            plan: {
              id: 'plan-starter',
              tier: PlanTier.STARTER,
              quota: {
                maxNotificationsPerMonth: 100,
              },
            },
          },
        ],
      });

      prisma.organizationUsage.findFirst.mockResolvedValue({
        notificationsCount: 100,
      });

      try {
        await service.assertCanSendNotification(orgId);
        fail('Should have thrown QuotaExceededException');
      } catch (error) {
        expect(error).toBeInstanceOf(QuotaExceededException);
        const quotaError = error as QuotaExceededException;
        expect(quotaError.getStatus()).toBe(402);
        const response = quotaError.getResponse() as Record<string, unknown>;
        expect(response.resource).toBe(QuotaResource.NOTIFICATIONS);
        expect(response.currentUsage).toBe(100);
        expect(response.maxAllowed).toBe(100);
      }
    });
  });
});
