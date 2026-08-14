import {
  BillingInterval,
  EntitlementCategory,
  EntitlementType,
  PaymentProvider,
  PlanTier,
  Prisma,
  PrismaClient,
  SubscriptionStatus,
} from '@prisma/client';

export function seedUuid(namespace: number, value: number) {
  return `${namespace.toString().padStart(8, '0')}-0000-4000-8000-${value
    .toString()
    .padStart(12, '0')}`;
}

export const commercialIds = {
  // Entitlement Definitions
  entMaxPatients: seedUuid(31000000, 1),
  entMaxStaffSeats: seedUuid(31000000, 2),
  entCanExportPdf: seedUuid(31000000, 3),
  entCanUseFinancialModule: seedUuid(31000000, 4),
  entCanCustomBrand: seedUuid(31000000, 5),
  entMaxStorageMb: seedUuid(31000000, 6),
  entApiAccessEnabled: seedUuid(31000000, 7),

  // Plans
  planFree: seedUuid(32000000, 1),
  planPro: seedUuid(32000000, 2),
  planEnterprise: seedUuid(32000000, 3),

  // Subscriptions
  subOrgA: seedUuid(33000000, 1),
  subOrgB: seedUuid(33000000, 2),
  subOrgSuspended: seedUuid(33000000, 3),
};

export const entitlementDefinitions: Prisma.EntitlementDefinitionCreateInput[] = [
  {
    id: commercialIds.entMaxPatients,
    key: 'MAX_PATIENTS',
    name: 'Maximum Active Patients',
    description: 'Maximum number of patient records allowed per organization.',
    type: EntitlementType.NUMERIC,
    category: EntitlementCategory.CAPACITY,
    defaultValue: { value: 25 },
  },
  {
    id: commercialIds.entMaxStaffSeats,
    key: 'MAX_STAFF_SEATS',
    name: 'Maximum Staff Seats',
    description: 'Maximum active user memberships in the clinic organization.',
    type: EntitlementType.NUMERIC,
    category: EntitlementCategory.CAPACITY,
    defaultValue: { value: 1 },
  },
  {
    id: commercialIds.entCanExportPdf,
    key: 'CAN_EXPORT_PDF',
    name: 'Export Case Files & Records to PDF',
    description: 'Enables high-resolution clinical PDF report and record export.',
    type: EntitlementType.BOOLEAN,
    category: EntitlementCategory.FEATURE_FLAG,
    defaultValue: { enabled: false },
  },
  {
    id: commercialIds.entCanUseFinancialModule,
    key: 'CAN_USE_FINANCIAL_MODULE',
    name: 'Financial & Transaction Management Module',
    description: 'Access to the practice income, expense, and payment tracking suite.',
    type: EntitlementType.BOOLEAN,
    category: EntitlementCategory.FEATURE_FLAG,
    defaultValue: { enabled: false },
  },
  {
    id: commercialIds.entCanCustomBrand,
    key: 'CAN_CUSTOM_BRAND',
    name: 'Custom Clinic Branding & Colors',
    description: 'Ability to configure custom portal themes, visual names, and clinic logos.',
    type: EntitlementType.BOOLEAN,
    category: EntitlementCategory.FEATURE_FLAG,
    defaultValue: { enabled: false },
  },
  {
    id: commercialIds.entMaxStorageMb,
    key: 'MAX_STORAGE_MB',
    name: 'Maximum Document & Asset Storage (MB)',
    description: 'Storage quota allocation for uploaded clinical documents and assets in MB.',
    type: EntitlementType.NUMERIC,
    category: EntitlementCategory.CAPACITY,
    defaultValue: { value: 100 },
  },
  {
    id: commercialIds.entApiAccessEnabled,
    key: 'API_ACCESS_ENABLED',
    name: 'External REST API & Webhook Access',
    description: 'Access to developer APIs, EHR integrations, and webhooks.',
    type: EntitlementType.BOOLEAN,
    category: EntitlementCategory.INTEGRATION,
    defaultValue: { enabled: false },
  },
];

export const plans = [
  {
    id: commercialIds.planFree,
    tier: PlanTier.FREE,
    code: 'free-tier',
    name: 'Free Plan',
    description: 'Essential solo practice clinical management.',
    billingInterval: BillingInterval.MONTHLY,
    basePrice: new Prisma.Decimal('0.00'),
    currency: 'MXN',
    trialDays: 0,
    isActive: true,
    isPublic: true,
    sortOrder: 1,
    entitlements: [
      { definitionId: commercialIds.entMaxPatients, numericValue: 25, booleanValue: null },
      { definitionId: commercialIds.entMaxStaffSeats, numericValue: 1, booleanValue: null },
      { definitionId: commercialIds.entCanExportPdf, numericValue: null, booleanValue: false },
      { definitionId: commercialIds.entCanUseFinancialModule, numericValue: null, booleanValue: false },
      { definitionId: commercialIds.entCanCustomBrand, numericValue: null, booleanValue: false },
      { definitionId: commercialIds.entMaxStorageMb, numericValue: 100, booleanValue: null },
      { definitionId: commercialIds.entApiAccessEnabled, numericValue: null, booleanValue: false },
    ],
  },
  {
    id: commercialIds.planPro,
    tier: PlanTier.PROFESSIONAL,
    code: 'pro-monthly',
    name: 'Professional Plan',
    description: 'Comprehensive clinical & practice management for growing psychology teams.',
    billingInterval: BillingInterval.MONTHLY,
    basePrice: new Prisma.Decimal('499.00'),
    currency: 'MXN',
    trialDays: 14,
    isActive: true,
    isPublic: true,
    sortOrder: 2,
    entitlements: [
      { definitionId: commercialIds.entMaxPatients, numericValue: 250, booleanValue: null },
      { definitionId: commercialIds.entMaxStaffSeats, numericValue: 5, booleanValue: null },
      { definitionId: commercialIds.entCanExportPdf, numericValue: null, booleanValue: true },
      { definitionId: commercialIds.entCanUseFinancialModule, numericValue: null, booleanValue: true },
      { definitionId: commercialIds.entCanCustomBrand, numericValue: null, booleanValue: false },
      { definitionId: commercialIds.entMaxStorageMb, numericValue: 5000, booleanValue: null },
      { definitionId: commercialIds.entApiAccessEnabled, numericValue: null, booleanValue: false },
    ],
  },
  {
    id: commercialIds.planEnterprise,
    tier: PlanTier.ENTERPRISE,
    code: 'enterprise-custom',
    name: 'Enterprise Plan',
    description: 'Uncapped clinical multi-location platform with custom integrations & white-label.',
    billingInterval: BillingInterval.MONTHLY,
    basePrice: new Prisma.Decimal('1999.00'),
    currency: 'MXN',
    trialDays: 30,
    isActive: true,
    isPublic: true,
    sortOrder: 3,
    entitlements: [
      { definitionId: commercialIds.entMaxPatients, numericValue: -1, booleanValue: null },
      { definitionId: commercialIds.entMaxStaffSeats, numericValue: -1, booleanValue: null },
      { definitionId: commercialIds.entCanExportPdf, numericValue: null, booleanValue: true },
      { definitionId: commercialIds.entCanUseFinancialModule, numericValue: null, booleanValue: true },
      { definitionId: commercialIds.entCanCustomBrand, numericValue: null, booleanValue: true },
      { definitionId: commercialIds.entMaxStorageMb, numericValue: -1, booleanValue: null },
      { definitionId: commercialIds.entApiAccessEnabled, numericValue: null, booleanValue: true },
    ],
  },
];

export type CommercialSeedPrismaClient = {
  entitlementDefinition: {
    upsert: (args: Prisma.EntitlementDefinitionUpsertArgs) => Promise<unknown>;
  };
  plan: {
    upsert: (args: Prisma.PlanUpsertArgs) => Promise<unknown>;
  };
  planEntitlement: {
    upsert: (args: Prisma.PlanEntitlementUpsertArgs) => Promise<unknown>;
  };
  subscription: {
    upsert: (args: Prisma.SubscriptionUpsertArgs) => Promise<unknown>;
  };
};

export async function seedCommercialCoreData(
  prisma: CommercialSeedPrismaClient,
  organizationIds?: { orgA: string; orgB: string; orgSuspended: string },
) {
  // 1. Seed Entitlement Definitions
  for (const def of entitlementDefinitions) {
    await prisma.entitlementDefinition.upsert({
      where: { key: def.key },
      update: {
        name: def.name,
        description: def.description,
        type: def.type,
        category: def.category,
        defaultValue: def.defaultValue as Prisma.InputJsonValue,
      },
      create: {
        id: def.id,
        key: def.key,
        name: def.name,
        description: def.description,
        type: def.type,
        category: def.category,
        defaultValue: def.defaultValue as Prisma.InputJsonValue,
      },
    });
  }

  // 2. Seed Plans & PlanEntitlements
  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { code: plan.code },
      update: {
        tier: plan.tier,
        name: plan.name,
        description: plan.description,
        billingInterval: plan.billingInterval,
        basePrice: plan.basePrice,
        currency: plan.currency,
        trialDays: plan.trialDays,
        isActive: plan.isActive,
        isPublic: plan.isPublic,
        sortOrder: plan.sortOrder,
      },
      create: {
        id: plan.id,
        tier: plan.tier,
        code: plan.code,
        name: plan.name,
        description: plan.description,
        billingInterval: plan.billingInterval,
        basePrice: plan.basePrice,
        currency: plan.currency,
        trialDays: plan.trialDays,
        isActive: plan.isActive,
        isPublic: plan.isPublic,
        sortOrder: plan.sortOrder,
      },
    });

    for (const ent of plan.entitlements) {
      await prisma.planEntitlement.upsert({
        where: {
          planId_entitlementDefinitionId: {
            planId: plan.id,
            entitlementDefinitionId: ent.definitionId,
          },
        },
        update: {
          numericValue: ent.numericValue,
          booleanValue: ent.booleanValue,
        },
        create: {
          planId: plan.id,
          entitlementDefinitionId: ent.definitionId,
          numericValue: ent.numericValue,
          booleanValue: ent.booleanValue,
        },
      });
    }
  }

  // 3. Seed Organization Subscriptions if organization IDs are provided
  if (organizationIds) {
    const now = new Date();
    const futureDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const pastDate = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const expiredDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Tenant A -> Pro Subscription
    await prisma.subscription.upsert({
      where: { id: commercialIds.subOrgA },
      update: {
        organizationId: organizationIds.orgA,
        planId: commercialIds.planPro,
        status: SubscriptionStatus.ACTIVE,
        externalProvider: PaymentProvider.MANUAL,
        currentPeriodStartedAt: now,
        currentPeriodEndsAt: futureDate,
      },
      create: {
        id: commercialIds.subOrgA,
        organizationId: organizationIds.orgA,
        planId: commercialIds.planPro,
        status: SubscriptionStatus.ACTIVE,
        externalProvider: PaymentProvider.MANUAL,
        currentPeriodStartedAt: now,
        currentPeriodEndsAt: futureDate,
      },
    });

    // Tenant B -> Free Subscription
    await prisma.subscription.upsert({
      where: { id: commercialIds.subOrgB },
      update: {
        organizationId: organizationIds.orgB,
        planId: commercialIds.planFree,
        status: SubscriptionStatus.ACTIVE,
        externalProvider: PaymentProvider.MANUAL,
        currentPeriodStartedAt: now,
        currentPeriodEndsAt: futureDate,
      },
      create: {
        id: commercialIds.subOrgB,
        organizationId: organizationIds.orgB,
        planId: commercialIds.planFree,
        status: SubscriptionStatus.ACTIVE,
        externalProvider: PaymentProvider.MANUAL,
        currentPeriodStartedAt: now,
        currentPeriodEndsAt: futureDate,
      },
    });

    // Suspended Org -> Expired Subscription
    await prisma.subscription.upsert({
      where: { id: commercialIds.subOrgSuspended },
      update: {
        organizationId: organizationIds.orgSuspended,
        planId: commercialIds.planPro,
        status: SubscriptionStatus.EXPIRED,
        externalProvider: PaymentProvider.MANUAL,
        currentPeriodStartedAt: pastDate,
        currentPeriodEndsAt: expiredDate,
        endedAt: expiredDate,
      },
      create: {
        id: commercialIds.subOrgSuspended,
        organizationId: organizationIds.orgSuspended,
        planId: commercialIds.planPro,
        endedAt: expiredDate,
      },
    });
  }
}

if (require.main === module) {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is required to run seed-commercial.');
    process.exit(1);
  }
  const { PrismaPg } = require('@prisma/adapter-pg');
  const adapter = new PrismaPg(connectionString);
  const client = new PrismaClient({ adapter });

  console.log('Seeding canonical commercial core data (plans & entitlements)...');
  seedCommercialCoreData(client as unknown as CommercialSeedPrismaClient)
    .then(() => {
      console.log('Commercial core seeding completed successfully.');
    })
    .catch((error) => {
      console.error('Commercial core seeding failed:', error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await client.$disconnect();
    });
}

