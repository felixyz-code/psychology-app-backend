-- AlterEnum
ALTER TYPE "PlanTier" ADD VALUE IF NOT EXISTS 'STARTER';
ALTER TYPE "PlanTier" ADD VALUE IF NOT EXISTS 'PRO';
ALTER TYPE "PlanTier" ADD VALUE IF NOT EXISTS 'CLINIC';

-- AlterEnum
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'INCOMPLETE';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'INCOMPLETE_EXPIRED';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'UNPAID';

-- AlterTable
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "stripe_price_id" VARCHAR(255);

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "stripe_customer_id" VARCHAR(255);
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "stripe_subscription_id" VARCHAR(255);
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "stripe_price_id" VARCHAR(255);
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "current_period_start" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "current_period_end" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_stripe_subscription_id_key" ON "subscriptions"("stripe_subscription_id");
CREATE INDEX IF NOT EXISTS "subscriptions_stripe_customer_id_idx" ON "subscriptions"("stripe_customer_id");

-- CreateTable
CREATE TABLE IF NOT EXISTS "plan_quotas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "plan_id" UUID NOT NULL,
    "max_therapists" INTEGER NOT NULL DEFAULT 1,
    "max_branches" INTEGER NOT NULL DEFAULT 1,
    "max_notifications_per_month" INTEGER NOT NULL DEFAULT 100,
    "max_patients" INTEGER,
    "can_custom_brand" BOOLEAN NOT NULL DEFAULT false,
    "can_teleconsultation" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "plan_quotas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "plan_quotas_plan_id_key" ON "plan_quotas"("plan_id");

-- AddForeignKey
ALTER TABLE "plan_quotas" ADD CONSTRAINT "plan_quotas_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE IF NOT EXISTS "organization_usages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "period_start" TIMESTAMPTZ(3) NOT NULL,
    "period_end" TIMESTAMPTZ(3) NOT NULL,
    "therapists_count" INTEGER NOT NULL DEFAULT 0,
    "branches_count" INTEGER NOT NULL DEFAULT 0,
    "notifications_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "organization_usages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "organization_usages_organization_id_period_start_key" ON "organization_usages"("organization_id", "period_start");
CREATE INDEX IF NOT EXISTS "organization_usages_organization_id_period_start_period_end_idx" ON "organization_usages"("organization_id", "period_start", "period_end");

-- AddForeignKey
ALTER TABLE "organization_usages" ADD CONSTRAINT "organization_usages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
