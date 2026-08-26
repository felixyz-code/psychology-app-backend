import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  MembershipStatus,
  OrganizationStatus,
  PlanTier,
  SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EntitlementKey } from '../../entitlements/entitlements.constants';
import { AdminTenantsService } from './admin-tenants.service';

describe('AdminTenantsService', () => {
  let service: AdminTenantsService;
  let prisma: {
    organization: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    subscription: {
      create: jest.Mock;
      update: jest.Mock;
    };
    plan: {
      findFirst: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      organization: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      subscription: {
        create: jest.fn(),
        update: jest.fn(),
      },
      plan: {
        findFirst: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminTenantsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<AdminTenantsService>(AdminTenantsService);
  });

  describe('listTenants', () => {
    it('returns consolidated organizations with subscriptions, quotas and usage', async () => {
      const mockOrgs = [
        {
          id: 'org-1',
          slug: 'org-alpha',
          displayName: 'Org Alpha',
          legalName: 'Alpha Health S.A.',
          status: OrganizationStatus.ACTIVE,
          timezone: 'America/Hermosillo',
          createdAt: new Date('2026-01-01'),
          subscriptions: [
            {
              id: 'sub-1',
              status: SubscriptionStatus.LIFETIME_SPONSOR,
              trialEndsAt: null,
              currentPeriodEndsAt: new Date('2099-12-31'),
              isExempt: true,
              sponsorNotes: 'Convenio Fundación Sonora',
              customTherapistsLimit: 15,
              customPatientsLimit: 300,
              customBranchesLimit: 4,
              plan: {
                tier: PlanTier.ENTERPRISE,
                code: 'enterprise-custom',
                name: 'Enterprise Sponsor',
                entitlements: [
                  {
                    definition: { key: EntitlementKey.MAX_STAFF_SEATS },
                    numericValue: 10,
                  },
                  {
                    definition: { key: EntitlementKey.MAX_PATIENTS },
                    numericValue: 100,
                  },
                  {
                    definition: { key: EntitlementKey.MAX_BRANCHES },
                    numericValue: 2,
                  },
                ],
              },
            },
          ],
          _count: {
            memberships: 5,
            patients: 42,
            branches: 2,
          },
        },
      ];

      prisma.organization.findMany.mockResolvedValue(mockOrgs);

      const result = await service.listTenants();

      expect(result).toHaveLength(1);
      expect(result[0].displayName).toBe('Org Alpha');
      expect(result[0].subscription?.status).toBe(
        SubscriptionStatus.LIFETIME_SPONSOR,
      );
      expect(result[0].subscription?.isExempt).toBe(true);
      expect(result[0].subscription?.sponsorNotes).toBe(
        'Convenio Fundación Sonora',
      );
      expect(result[0].usage.therapistsLimit).toBe(15);
      expect(result[0].usage.patientsLimit).toBe(300);
      expect(result[0].usage.branchesLimit).toBe(4);
      expect(result[0].usage.therapistsCount).toBe(5);
    });
  });

  describe('extendTrial', () => {
    it('extends trial end date for existing subscription', async () => {
      const existingSub = {
        id: 'sub-trial',
        trialEndsAt: new Date('2026-09-01T00:00:00Z'),
        currentPeriodEndsAt: new Date('2026-09-01T00:00:00Z'),
      };

      prisma.organization.findUnique.mockResolvedValue({
        id: 'org-1',
        subscriptions: [existingSub],
      });

      prisma.subscription.update.mockResolvedValue({
        id: 'sub-trial',
        status: SubscriptionStatus.TRIALING,
        trialEndsAt: new Date('2026-09-15T00:00:00Z'),
        currentPeriodEndsAt: new Date('2026-09-15T00:00:00Z'),
      });

      const result = await service.extendTrial('org-1', { daysToAdd: 14 });

      expect(prisma.subscription.update).toHaveBeenCalled();
      expect(result.status).toBe(SubscriptionStatus.TRIALING);
    });

    it('throws NotFoundException if organization does not exist', async () => {
      prisma.organization.findUnique.mockResolvedValue(null);

      await expect(
        service.extendTrial('invalid-org', { daysToAdd: 14 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('grantLifetime', () => {
    it('grants lifetime sponsor membership with custom quotas and exemption', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        id: 'org-1',
        subscriptions: [
          {
            id: 'sub-1',
            status: SubscriptionStatus.ACTIVE,
            sponsorNotes: null,
          },
        ],
      });

      prisma.subscription.update.mockResolvedValue({
        id: 'sub-1',
        status: SubscriptionStatus.LIFETIME_SPONSOR,
        isExempt: true,
        sponsorNotes: 'Convenio Aliado',
        customTherapistsLimit: 25,
      });

      const result = await service.grantLifetime('org-1', {
        sponsorNotes: 'Convenio Aliado',
        customTherapistsLimit: 25,
      });

      expect(prisma.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sub-1' },
          data: expect.objectContaining({
            status: SubscriptionStatus.LIFETIME_SPONSOR,
            isExempt: true,
            sponsorNotes: 'Convenio Aliado',
            customTherapistsLimit: 25,
          }),
        }),
      );
      expect(result.status).toBe(SubscriptionStatus.LIFETIME_SPONSOR);
    });
  });

  describe('updateQuotas', () => {
    it('updates custom quotas on subscription', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        id: 'org-1',
        subscriptions: [{ id: 'sub-1' }],
      });

      prisma.subscription.update.mockResolvedValue({
        id: 'sub-1',
        customTherapistsLimit: 30,
        customPatientsLimit: 600,
        customBranchesLimit: 5,
      });

      const result = await service.updateQuotas('org-1', {
        customTherapistsLimit: 30,
        customPatientsLimit: 600,
        customBranchesLimit: 5,
      });

      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: {
          customTherapistsLimit: 30,
          customPatientsLimit: 600,
          customBranchesLimit: 5,
        },
        include: { plan: true },
      });
      expect(result.customTherapistsLimit).toBe(30);
    });
  });

  describe('freezeTenant', () => {
    it('freezes organization and sets subscription to FROZEN', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        id: 'org-1',
        subscriptions: [{ id: 'sub-1', status: SubscriptionStatus.ACTIVE }],
      });

      const result = await service.freezeTenant('org-1', {
        freeze: true,
        reason: 'Violation of Terms',
      });

      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: { status: OrganizationStatus.SUSPENDED },
      });
      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: {
          status: SubscriptionStatus.FROZEN,
          cancelReason: 'Violation of Terms',
        },
      });
      expect(result.isFrozen).toBe(true);
    });

    it('unfreezes organization and restores ACTIVE status', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        id: 'org-1',
        subscriptions: [
          {
            id: 'sub-1',
            status: SubscriptionStatus.FROZEN,
            isExempt: false,
          },
        ],
      });

      const result = await service.freezeTenant('org-1', {
        freeze: false,
      });

      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: { status: OrganizationStatus.ACTIVE },
      });
      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: {
          status: SubscriptionStatus.ACTIVE,
          cancelReason: null,
        },
      });
      expect(result.isFrozen).toBe(false);
    });
  });
});
