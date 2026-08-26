import { Test, TestingModule } from '@nestjs/testing';
import { PlanTier, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EntitlementKey } from './entitlements.constants';
import { EntitlementsService } from './entitlements.service';
import { FeatureNotAvailableException } from './exceptions/feature-not-available.exception';
import { PlanLimitExceededException } from './exceptions/plan-limit-exceeded.exception';

describe('EntitlementsService', () => {
  let service: EntitlementsService;
  let prisma: {
    subscription: { findFirst: jest.Mock };
    plan: { findFirst: jest.Mock };
    planEntitlement: { findFirst: jest.Mock };
    patient: { count: jest.Mock };
    organizationMembership: { count: jest.Mock };
    organizationLogoAsset: { findUnique: jest.Mock };
  };

  const orgId = '11111111-1111-4000-8000-111111111111';
  const proPlanId = '22222222-2222-4000-8000-222222222222';
  const freePlanId = '33333333-3333-4000-8000-333333333333';

  beforeEach(async () => {
    prisma = {
      subscription: { findFirst: jest.fn() },
      plan: { findFirst: jest.fn() },
      planEntitlement: { findFirst: jest.fn() },
      patient: { count: jest.fn() },
      organizationMembership: { count: jest.fn() },
      organizationLogoAsset: { findUnique: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EntitlementsService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<EntitlementsService>(EntitlementsService);
  });

  describe('resolveSubscriptionContext', () => {
    it('returns active subscription context when organization has an active paid plan', async () => {
      prisma.subscription.findFirst.mockResolvedValue({
        id: 'sub-1',
        organizationId: orgId,
        planId: proPlanId,
        status: SubscriptionStatus.ACTIVE,
        gracePeriodEndsAt: null,
        plan: {
          id: proPlanId,
          code: 'pro-monthly',
          tier: PlanTier.PROFESSIONAL,
        },
      });

      const context = await service.resolveSubscriptionContext(orgId);

      expect(context).toEqual({
        organizationId: orgId,
        subscriptionId: 'sub-1',
        planId: proPlanId,
        planCode: 'pro-monthly',
        planTier: PlanTier.PROFESSIONAL,
        status: SubscriptionStatus.ACTIVE,
        isGracePeriod: false,
        isExempt: undefined,
        customTherapistsLimit: undefined,
        customPatientsLimit: undefined,
        customBranchesLimit: undefined,
      });
    });

    it('returns lifetime sponsor subscription context with exemption', async () => {
      prisma.subscription.findFirst.mockResolvedValue({
        id: 'sub-sponsor',
        organizationId: orgId,
        planId: proPlanId,
        status: SubscriptionStatus.LIFETIME_SPONSOR,
        isExempt: true,
        customTherapistsLimit: 20,
        customPatientsLimit: 500,
        customBranchesLimit: 3,
        gracePeriodEndsAt: null,
        plan: {
          id: proPlanId,
          code: 'pro-monthly',
          tier: PlanTier.PROFESSIONAL,
        },
      });

      const context = await service.resolveSubscriptionContext(orgId);

      expect(context.status).toBe(SubscriptionStatus.LIFETIME_SPONSOR);
      expect(context.isExempt).toBe(true);
      expect(context.customTherapistsLimit).toBe(20);
      expect(context.customPatientsLimit).toBe(500);
      expect(context.customBranchesLimit).toBe(3);
    });

    it('identifies past due subscription within grace period', async () => {
      const futureGrace = new Date(Date.now() + 1000 * 60 * 60 * 24);
      prisma.subscription.findFirst.mockResolvedValue({
        id: 'sub-2',
        organizationId: orgId,
        planId: proPlanId,
        status: SubscriptionStatus.PAST_DUE,
        gracePeriodEndsAt: futureGrace,
        plan: {
          id: proPlanId,
          code: 'pro-monthly',
          tier: PlanTier.PROFESSIONAL,
        },
      });

      const context = await service.resolveSubscriptionContext(orgId);

      expect(context.status).toBe(SubscriptionStatus.PAST_DUE);
      expect(context.isGracePeriod).toBe(true);
    });

    it('falls back to default Free plan when no active subscription is found', async () => {
      prisma.subscription.findFirst.mockResolvedValue(null);
      prisma.plan.findFirst.mockResolvedValue({
        id: freePlanId,
        code: 'free-tier',
        tier: PlanTier.FREE,
      });

      const context = await service.resolveSubscriptionContext(orgId);

      expect(context).toEqual({
        organizationId: orgId,
        planId: freePlanId,
        planCode: 'free-tier',
        planTier: PlanTier.FREE,
        status: SubscriptionStatus.ACTIVE,
        isGracePeriod: false,
        isExempt: false,
      });
    });
  });

  describe('getEntitlement', () => {
    it('returns plan entitlement values for configured keys', async () => {
      prisma.subscription.findFirst.mockResolvedValue({
        id: 'sub-1',
        organizationId: orgId,
        planId: proPlanId,
        status: SubscriptionStatus.ACTIVE,
        gracePeriodEndsAt: null,
        plan: {
          id: proPlanId,
          code: 'pro-monthly',
          tier: PlanTier.PROFESSIONAL,
        },
      });

      prisma.planEntitlement.findFirst.mockResolvedValue({
        numericValue: 250,
        booleanValue: null,
      });

      const result = await service.getEntitlement(
        orgId,
        EntitlementKey.MAX_PATIENTS,
      );

      expect(result).toEqual({
        numericValue: 250,
        booleanValue: null,
        tier: PlanTier.PROFESSIONAL,
      });
      expect(prisma.planEntitlement.findFirst).toHaveBeenCalledWith({
        where: {
          planId: proPlanId,
          definition: { key: EntitlementKey.MAX_PATIENTS },
        },
        include: { definition: true },
      });
    });

    it('returns custom quota override values when set at subscription level', async () => {
      prisma.subscription.findFirst.mockResolvedValue({
        id: 'sub-sponsor',
        organizationId: orgId,
        planId: proPlanId,
        status: SubscriptionStatus.LIFETIME_SPONSOR,
        isExempt: true,
        customTherapistsLimit: 15,
        customPatientsLimit: 300,
        customBranchesLimit: 4,
        plan: {
          id: proPlanId,
          code: 'pro-monthly',
          tier: PlanTier.PROFESSIONAL,
        },
      });

      const staffResult = await service.getEntitlement(
        orgId,
        EntitlementKey.MAX_STAFF_SEATS,
      );
      const patResult = await service.getEntitlement(
        orgId,
        EntitlementKey.MAX_PATIENTS,
      );
      const branchResult = await service.getEntitlement(
        orgId,
        EntitlementKey.MAX_BRANCHES,
      );

      expect(staffResult.numericValue).toBe(15);
      expect(patResult.numericValue).toBe(300);
      expect(branchResult.numericValue).toBe(4);
    });

    it('returns null values if entitlement is not mapped in the plan', async () => {
      prisma.subscription.findFirst.mockResolvedValue(null);
      prisma.plan.findFirst.mockResolvedValue({
        id: freePlanId,
        code: 'free-tier',
        tier: PlanTier.FREE,
      });
      prisma.planEntitlement.findFirst.mockResolvedValue(null);

      const result = await service.getEntitlement(orgId, 'NON_EXISTENT_KEY');

      expect(result).toEqual({
        numericValue: null,
        booleanValue: null,
        tier: PlanTier.FREE,
      });
    });
  });

  describe('checkFeatureAccess', () => {
    it('returns allowed = true when boolean entitlement is enabled', async () => {
      prisma.subscription.findFirst.mockResolvedValue({
        id: 'sub-1',
        organizationId: orgId,
        planId: proPlanId,
        status: SubscriptionStatus.ACTIVE,
        gracePeriodEndsAt: null,
        plan: {
          id: proPlanId,
          code: 'pro-monthly',
          tier: PlanTier.PROFESSIONAL,
        },
      });

      prisma.planEntitlement.findFirst.mockResolvedValue({
        numericValue: null,
        booleanValue: true,
      });

      const check = await service.checkFeatureAccess(
        orgId,
        EntitlementKey.CAN_EXPORT_PDF,
      );

      expect(check).toEqual({
        allowed: true,
        featureKey: EntitlementKey.CAN_EXPORT_PDF,
        planTier: PlanTier.PROFESSIONAL,
      });
    });

    it('throws FeatureNotAvailableException (403) when feature is disabled and throwOnDenial = true', async () => {
      prisma.subscription.findFirst.mockResolvedValue(null);
      prisma.plan.findFirst.mockResolvedValue({
        id: freePlanId,
        code: 'free-tier',
        tier: PlanTier.FREE,
      });

      prisma.planEntitlement.findFirst.mockResolvedValue({
        numericValue: null,
        booleanValue: false,
      });

      await expect(
        service.checkFeatureAccess(orgId, EntitlementKey.CAN_EXPORT_PDF, true),
      ).rejects.toThrow(FeatureNotAvailableException);
    });

    it('returns allowed = false without throwing when throwOnDenial = false', async () => {
      prisma.subscription.findFirst.mockResolvedValue(null);
      prisma.plan.findFirst.mockResolvedValue({
        id: freePlanId,
        code: 'free-tier',
        tier: PlanTier.FREE,
      });

      prisma.planEntitlement.findFirst.mockResolvedValue({
        numericValue: null,
        booleanValue: false,
      });

      const check = await service.checkFeatureAccess(
        orgId,
        EntitlementKey.CAN_CUSTOM_BRAND,
        false,
      );

      expect(check.allowed).toBe(false);
      expect(check.planTier).toBe(PlanTier.FREE);
    });
  });

  describe('countCurrentUsage', () => {
    it('counts patient records for MAX_PATIENTS', async () => {
      prisma.patient.count.mockResolvedValue(15);
      const usage = await service.countCurrentUsage(
        orgId,
        EntitlementKey.MAX_PATIENTS,
      );

      expect(usage).toBe(15);
      expect(prisma.patient.count).toHaveBeenCalledWith({
        where: { organizationId: orgId },
      });
    });

    it('counts active memberships for MAX_STAFF_SEATS', async () => {
      prisma.organizationMembership.count.mockResolvedValue(3);
      const usage = await service.countCurrentUsage(
        orgId,
        EntitlementKey.MAX_STAFF_SEATS,
      );

      expect(usage).toBe(3);
      expect(prisma.organizationMembership.count).toHaveBeenCalledWith({
        where: { organizationId: orgId, status: 'ACTIVE' },
      });
    });

    it('calculates storage MB from organization assets', async () => {
      prisma.organizationLogoAsset.findUnique.mockResolvedValue({
        byteSize: 2 * 1024 * 1024,
      });
      const usage = await service.countCurrentUsage(
        orgId,
        EntitlementKey.MAX_STORAGE_MB,
      );

      expect(usage).toBe(2);
    });
  });

  describe('checkNumericQuota', () => {
    it('allows action when usage + increment is below quota limit', async () => {
      prisma.subscription.findFirst.mockResolvedValue({
        id: 'sub-1',
        organizationId: orgId,
        planId: proPlanId,
        status: SubscriptionStatus.ACTIVE,
        gracePeriodEndsAt: null,
        plan: {
          id: proPlanId,
          code: 'pro-monthly',
          tier: PlanTier.PROFESSIONAL,
        },
      });

      prisma.planEntitlement.findFirst.mockResolvedValue({
        numericValue: 250,
        booleanValue: null,
      });

      prisma.patient.count.mockResolvedValue(20);

      const result = await service.checkNumericQuota(
        orgId,
        EntitlementKey.MAX_PATIENTS,
        { proposedIncrement: 1 },
      );

      expect(result).toEqual({
        allowed: true,
        quotaKey: EntitlementKey.MAX_PATIENTS,
        limit: 250,
        currentUsage: 20,
        remaining: 230,
        isUnlimited: false,
      });
    });

    it('permits unlimited usage when numericValue is -1', async () => {
      prisma.subscription.findFirst.mockResolvedValue({
        id: 'sub-ent',
        organizationId: orgId,
        planId: 'ent-plan',
        status: SubscriptionStatus.ACTIVE,
        gracePeriodEndsAt: null,
        plan: {
          id: 'ent-plan',
          code: 'enterprise-custom',
          tier: PlanTier.ENTERPRISE,
        },
      });

      prisma.planEntitlement.findFirst.mockResolvedValue({
        numericValue: -1,
        booleanValue: null,
      });

      const result = await service.checkNumericQuota(
        orgId,
        EntitlementKey.MAX_PATIENTS,
        { explicitUsage: 500 },
      );

      expect(result).toEqual({
        allowed: true,
        quotaKey: EntitlementKey.MAX_PATIENTS,
        limit: -1,
        currentUsage: 500,
        remaining: Number.POSITIVE_INFINITY,
        isUnlimited: true,
      });
    });

    it('throws PlanLimitExceededException (403) when quota limit is reached', async () => {
      prisma.subscription.findFirst.mockResolvedValue(null);
      prisma.plan.findFirst.mockResolvedValue({
        id: freePlanId,
        code: 'free-tier',
        tier: PlanTier.FREE,
      });

      prisma.planEntitlement.findFirst.mockResolvedValue({
        numericValue: 25,
        booleanValue: null,
      });

      prisma.patient.count.mockResolvedValue(25);

      await expect(
        service.checkNumericQuota(orgId, EntitlementKey.MAX_PATIENTS, {
          proposedIncrement: 1,
          throwOnExceeded: true,
        }),
      ).rejects.toThrow(PlanLimitExceededException);
    });
  });
});
