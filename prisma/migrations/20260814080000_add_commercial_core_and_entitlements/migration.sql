-- CreateEnum
CREATE TYPE "PlanTier" AS ENUM ('FREE', 'PROFESSIONAL', 'ENTERPRISE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('MONTHLY', 'ANNUAL', 'LIFETIME');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('MANUAL', 'INTERNAL', 'STRIPE', 'MERCADOPAGO');

-- CreateEnum
CREATE TYPE "EntitlementType" AS ENUM ('NUMERIC', 'BOOLEAN');

-- CreateEnum
CREATE TYPE "EntitlementCategory" AS ENUM ('CAPACITY', 'FEATURE_FLAG', 'INTEGRATION', 'SUPPORT');

-- CreateTable
CREATE TABLE "plans" (
    "id" UUID NOT NULL,
    "tier" "PlanTier" NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "billingInterval" "BillingInterval" NOT NULL DEFAULT 'MONTHLY',
    "basePrice" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "currency" CHAR(3) NOT NULL DEFAULT 'MXN',
    "trialDays" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "externalProvider" "PaymentProvider" NOT NULL DEFAULT 'MANUAL',
    "externalSubscriptionId" VARCHAR(255),
    "externalCustomerId" VARCHAR(255),
    "trialStartedAt" TIMESTAMPTZ(3),
    "trialEndsAt" TIMESTAMPTZ(3),
    "currentPeriodStartedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentPeriodEndsAt" TIMESTAMPTZ(3) NOT NULL,
    "gracePeriodEndsAt" TIMESTAMPTZ(3),
    "canceledAt" TIMESTAMPTZ(3),
    "endedAt" TIMESTAMPTZ(3),
    "seatQuantity" INTEGER NOT NULL DEFAULT 1,
    "cancelReason" VARCHAR(500),
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entitlement_definitions" (
    "id" UUID NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "type" "EntitlementType" NOT NULL,
    "category" "EntitlementCategory" NOT NULL DEFAULT 'FEATURE_FLAG',
    "defaultValue" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "entitlement_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_entitlements" (
    "id" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "entitlementDefinitionId" UUID NOT NULL,
    "numericValue" INTEGER,
    "booleanValue" BOOLEAN,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "plan_entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plans_code_key" ON "plans"("code");

-- CreateIndex
CREATE INDEX "plans_tier_isActive_idx" ON "plans"("tier", "isActive");

-- CreateIndex
CREATE INDEX "plans_isPublic_sortOrder_idx" ON "plans"("isPublic", "sortOrder");

-- CreateIndex
CREATE INDEX "subscriptions_organizationId_status_idx" ON "subscriptions"("organizationId", "status");

-- CreateIndex
CREATE INDEX "subscriptions_status_currentPeriodEndsAt_idx" ON "subscriptions"("status", "currentPeriodEndsAt");

-- CreateIndex
CREATE INDEX "subscriptions_externalProvider_externalSubscriptionId_idx" ON "subscriptions"("externalProvider", "externalSubscriptionId");

-- CreateIndex
CREATE INDEX "subscriptions_externalCustomerId_idx" ON "subscriptions"("externalCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "entitlement_definitions_key_key" ON "entitlement_definitions"("key");

-- CreateIndex
CREATE INDEX "entitlement_definitions_category_idx" ON "entitlement_definitions"("category");

-- CreateIndex
CREATE INDEX "plan_entitlements_entitlementDefinitionId_idx" ON "plan_entitlements"("entitlementDefinitionId");

-- CreateIndex
CREATE UNIQUE INDEX "plan_entitlements_planId_entitlementDefinitionId_key" ON "plan_entitlements"("planId", "entitlementDefinitionId");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_entitlements" ADD CONSTRAINT "plan_entitlements_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_entitlements" ADD CONSTRAINT "plan_entitlements_entitlementDefinitionId_fkey" FOREIGN KEY ("entitlementDefinitionId") REFERENCES "entitlement_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
