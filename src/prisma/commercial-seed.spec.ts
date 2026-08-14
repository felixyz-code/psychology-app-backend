import {
  commercialIds,
  entitlementDefinitions,
  plans,
  seedCommercialCoreData,
} from '../../prisma/seed-commercial';
import { PlanTier } from '@prisma/client';

describe('Commercial Seed Data & Catalog Integrity', () => {
  it('defines the required 7 baseline entitlement keys', () => {
    const keys = entitlementDefinitions.map((d) => d.key);
    expect(keys).toContain('MAX_PATIENTS');
    expect(keys).toContain('MAX_STAFF_SEATS');
    expect(keys).toContain('CAN_EXPORT_PDF');
    expect(keys).toContain('CAN_USE_FINANCIAL_MODULE');
    expect(keys).toContain('CAN_CUSTOM_BRAND');
    expect(keys).toContain('MAX_STORAGE_MB');
    expect(keys).toContain('API_ACCESS_ENABLED');
    expect(keys).toHaveLength(7);
  });

  it('defines the 3 baseline commercial tiers: FREE, PROFESSIONAL, ENTERPRISE', () => {
    const tiers = plans.map((p) => p.tier);
    expect(tiers).toContain(PlanTier.FREE);
    expect(tiers).toContain(PlanTier.PROFESSIONAL);
    expect(tiers).toContain(PlanTier.ENTERPRISE);
  });

  it('maps all 7 entitlements on each commercial plan', () => {
    for (const plan of plans) {
      expect(plan.entitlements).toHaveLength(7);
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
  });

  it('configures Enterprise plan with uncapped limits (-1) and all features', () => {
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
  });

  it('executes seedCommercialCoreData upserts against prisma client', async () => {
    const prisma = {
      entitlementDefinition: { upsert: jest.fn().mockResolvedValue({}) },
      plan: { upsert: jest.fn().mockResolvedValue({}) },
      planEntitlement: { upsert: jest.fn().mockResolvedValue({}) },
      subscription: { upsert: jest.fn().mockResolvedValue({}) },
    };

    await seedCommercialCoreData(prisma, {
      orgA: 'org-a-uuid',
      orgB: 'org-b-uuid',
      orgSuspended: 'org-suspended-uuid',
    });

    expect(prisma.entitlementDefinition.upsert).toHaveBeenCalledTimes(7);
    expect(prisma.plan.upsert).toHaveBeenCalledTimes(3);
    expect(prisma.planEntitlement.upsert).toHaveBeenCalledTimes(21);
    expect(prisma.subscription.upsert).toHaveBeenCalledTimes(3);
  });
});
