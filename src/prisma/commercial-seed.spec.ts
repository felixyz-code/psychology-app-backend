import {
  commercialIds,
  entitlementDefinitions,
  plans,
  seedCommercialCoreData,
} from '../../prisma/seed-commercial';
import { PlanTier } from '@prisma/client';

describe('Commercial Seed Data & Catalog Integrity', () => {
  it('defines the required 9 baseline entitlement keys', () => {
    const keys = entitlementDefinitions.map((d) => d.key);
    expect(keys).toContain('MAX_PATIENTS');
    expect(keys).toContain('MAX_STAFF_SEATS');
    expect(keys).toContain('CAN_EXPORT_PDF');
    expect(keys).toContain('CAN_USE_FINANCIAL_MODULE');
    expect(keys).toContain('CAN_CUSTOM_BRAND');
    expect(keys).toContain('MAX_STORAGE_MB');
    expect(keys).toContain('API_ACCESS_ENABLED');
    expect(keys).toContain('MULTI_BRANCH');
    expect(keys).toContain('MAX_BRANCHES');
    expect(keys).toHaveLength(9);
  });

  it('defines the commercial tiers including STARTER, PRO, CLINIC, ENTERPRISE', () => {
    const tiers = plans.map((p) => p.tier);
    expect(tiers).toContain(PlanTier.FREE);
    expect(tiers).toContain(PlanTier.STARTER);
    expect(tiers).toContain(PlanTier.PRO);
    expect(tiers).toContain(PlanTier.CLINIC);
    expect(tiers).toContain(PlanTier.ENTERPRISE);
  });

  it('maps all 9 entitlements on each commercial plan', () => {
    for (const plan of plans) {
      expect(plan.entitlements).toHaveLength(9);
    }
  });

  it('configures Free plan with proper restricted caps', () => {
    const freePlan = plans.find((p) => p.tier === PlanTier.FREE);
    expect(freePlan).toBeDefined();
    expect(freePlan?.basePrice.toNumber()).toBe(0);

    const patientsEnt = freePlan?.entitlements.find(
      (e) => e.definitionId === commercialIds.entMaxPatients,
    );
    expect(patientsEnt?.numericValue).toBe(25);

    const pdfEnt = freePlan?.entitlements.find(
      (e) => e.definitionId === commercialIds.entCanExportPdf,
    );
    expect(pdfEnt?.booleanValue).toBe(false);

    const multiBranchEnt = freePlan?.entitlements.find(
      (e) => e.definitionId === commercialIds.entMultiBranch,
    );
    expect(multiBranchEnt?.booleanValue).toBe(false);

    const maxBranchesEnt = freePlan?.entitlements.find(
      (e) => e.definitionId === commercialIds.entMaxBranches,
    );
    expect(maxBranchesEnt?.numericValue).toBe(1);
  });

  it('configures Starter, Pro and Clinic plans with appropriate quotas', () => {
    const starter = plans.find((p) => p.tier === PlanTier.STARTER);
    expect(starter?.quota?.maxTherapists).toBe(1);
    expect(starter?.quota?.maxBranches).toBe(1);
    expect(starter?.quota?.maxNotificationsPerMonth).toBe(100);

    const pro = plans.find((p) => p.tier === PlanTier.PRO);
    expect(pro?.quota?.maxTherapists).toBe(3);
    expect(pro?.quota?.maxBranches).toBe(2);
    expect(pro?.quota?.maxNotificationsPerMonth).toBe(500);

    const clinic = plans.find((p) => p.tier === PlanTier.CLINIC);
    expect(clinic?.quota?.maxTherapists).toBe(10);
    expect(clinic?.quota?.maxBranches).toBe(5);
    expect(clinic?.quota?.maxNotificationsPerMonth).toBe(2000);
  });

  it('configures Enterprise plan with uncapped limits and all features', () => {
    const entPlan = plans.find((p) => p.tier === PlanTier.ENTERPRISE);
    expect(entPlan).toBeDefined();

    const patientsEnt = entPlan?.entitlements.find(
      (e) => e.definitionId === commercialIds.entMaxPatients,
    );
    expect(patientsEnt?.numericValue).toBe(-1);

    const pdfEnt = entPlan?.entitlements.find(
      (e) => e.definitionId === commercialIds.entCanExportPdf,
    );
    expect(pdfEnt?.booleanValue).toBe(true);

    const brandEnt = entPlan?.entitlements.find(
      (e) => e.definitionId === commercialIds.entCanCustomBrand,
    );
    expect(brandEnt?.booleanValue).toBe(true);

    const maxBranchesEnt = entPlan?.entitlements.find(
      (e) => e.definitionId === commercialIds.entMaxBranches,
    );
    expect(maxBranchesEnt?.numericValue).toBe(999);
  });

  it('executes seedCommercialCoreData upserts against prisma client', async () => {
    const prisma = {
      entitlementDefinition: { upsert: jest.fn().mockResolvedValue({}) },
      plan: { upsert: jest.fn().mockResolvedValue({}) },
      planEntitlement: { upsert: jest.fn().mockResolvedValue({}) },
      planQuota: { upsert: jest.fn().mockResolvedValue({}) },
      subscription: { upsert: jest.fn().mockResolvedValue({}) },
    };

    await seedCommercialCoreData(prisma, {
      orgA: 'org-a-uuid',
      orgB: 'org-b-uuid',
      orgSuspended: 'org-suspended-uuid',
    });

    expect(prisma.entitlementDefinition.upsert).toHaveBeenCalledTimes(9);
    expect(prisma.plan.upsert).toHaveBeenCalledTimes(5);
    expect(prisma.planEntitlement.upsert).toHaveBeenCalledTimes(45);
    expect(prisma.planQuota.upsert).toHaveBeenCalledTimes(5);
    expect(prisma.subscription.upsert).toHaveBeenCalledTimes(3);
  });
});
