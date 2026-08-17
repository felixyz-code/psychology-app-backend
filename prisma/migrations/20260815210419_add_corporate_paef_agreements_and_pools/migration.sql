-- CreateEnum
CREATE TYPE "PaefAgreementStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'TERMINATED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "BenefitPoolStatus" AS ENUM ('ACTIVE', 'DEPLETED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EmployeeEligibilityStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "BenefitDebitStatus" AS ENUM ('RESERVED', 'CONFIRMED', 'RELEASED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "BenefitDebitType" AS ENUM ('SESSION_BOOKING', 'MANUAL_ADJUSTMENT', 'SESSION_CANCEL_REFUND');

-- CreateTable
CREATE TABLE "corporate_clients" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "commercial_name" VARCHAR(150),
    "tax_id" VARCHAR(50),
    "contact_email" VARCHAR(255),
    "contact_phone" VARCHAR(30),
    "domain_whitelist" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "corporate_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paef_agreements" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "corporate_client_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "status" "PaefAgreementStatus" NOT NULL DEFAULT 'ACTIVE',
    "is_multi_branch" BOOLEAN NOT NULL DEFAULT true,
    "allowed_branch_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "default_max_sessions_per_employee" INTEGER NOT NULL DEFAULT 5,
    "valid_from" TIMESTAMPTZ(3) NOT NULL,
    "valid_until" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "paef_agreements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "benefit_pools" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "agreement_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "total_sessions" INTEGER NOT NULL,
    "consumed_sessions" INTEGER NOT NULL DEFAULT 0,
    "reserved_sessions" INTEGER NOT NULL DEFAULT 0,
    "status" "BenefitPoolStatus" NOT NULL DEFAULT 'ACTIVE',
    "valid_from" TIMESTAMPTZ(3) NOT NULL,
    "valid_until" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "benefit_pools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_eligibilities" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "agreement_id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "employee_number" VARCHAR(60),
    "national_id" VARCHAR(60),
    "first_name" VARCHAR(100),
    "last_name" VARCHAR(100),
    "department" VARCHAR(100),
    "max_sessions_allowed" INTEGER NOT NULL,
    "consumed_sessions" INTEGER NOT NULL DEFAULT 0,
    "reserved_sessions" INTEGER NOT NULL DEFAULT 0,
    "status" "EmployeeEligibilityStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "employee_eligibilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "benefit_debit_logs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "agreement_id" UUID NOT NULL,
    "pool_id" UUID NOT NULL,
    "eligibility_id" UUID,
    "branch_id" UUID,
    "appointment_id" UUID,
    "patient_id" UUID,
    "user_id" UUID,
    "transaction_type" "BenefitDebitType" NOT NULL,
    "session_quantity" INTEGER NOT NULL DEFAULT 1,
    "status" "BenefitDebitStatus" NOT NULL,
    "reason" VARCHAR(255),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "benefit_debit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "corporate_clients_organization_id_is_active_idx" ON "corporate_clients"("organization_id", "is_active");

-- CreateIndex
CREATE INDEX "corporate_clients_organization_id_name_idx" ON "corporate_clients"("organization_id", "name");

-- CreateIndex
CREATE INDEX "paef_agreements_organization_id_status_idx" ON "paef_agreements"("organization_id", "status");

-- CreateIndex
CREATE INDEX "paef_agreements_corporate_client_id_idx" ON "paef_agreements"("corporate_client_id");

-- CreateIndex
CREATE INDEX "paef_agreements_valid_from_valid_until_idx" ON "paef_agreements"("valid_from", "valid_until");

-- CreateIndex
CREATE UNIQUE INDEX "paef_agreements_organization_id_code_key" ON "paef_agreements"("organization_id", "code");

-- CreateIndex
CREATE INDEX "benefit_pools_agreement_id_status_idx" ON "benefit_pools"("agreement_id", "status");

-- CreateIndex
CREATE INDEX "benefit_pools_organization_id_status_idx" ON "benefit_pools"("organization_id", "status");

-- CreateIndex
CREATE INDEX "employee_eligibilities_agreement_id_email_idx" ON "employee_eligibilities"("agreement_id", "email");

-- CreateIndex
CREATE INDEX "employee_eligibilities_organization_id_email_idx" ON "employee_eligibilities"("organization_id", "email");

-- CreateIndex
CREATE INDEX "employee_eligibilities_agreement_id_employee_number_idx" ON "employee_eligibilities"("agreement_id", "employee_number");

-- CreateIndex
CREATE UNIQUE INDEX "employee_eligibilities_agreement_id_email_key" ON "employee_eligibilities"("agreement_id", "email");

-- CreateIndex
CREATE INDEX "benefit_debit_logs_organization_id_created_at_idx" ON "benefit_debit_logs"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "benefit_debit_logs_agreement_id_idx" ON "benefit_debit_logs"("agreement_id");

-- CreateIndex
CREATE INDEX "benefit_debit_logs_pool_id_idx" ON "benefit_debit_logs"("pool_id");

-- CreateIndex
CREATE INDEX "benefit_debit_logs_eligibility_id_idx" ON "benefit_debit_logs"("eligibility_id");

-- CreateIndex
CREATE INDEX "benefit_debit_logs_appointment_id_idx" ON "benefit_debit_logs"("appointment_id");

-- AddForeignKey
ALTER TABLE "corporate_clients" ADD CONSTRAINT "corporate_clients_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paef_agreements" ADD CONSTRAINT "paef_agreements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paef_agreements" ADD CONSTRAINT "paef_agreements_corporate_client_id_fkey" FOREIGN KEY ("corporate_client_id") REFERENCES "corporate_clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benefit_pools" ADD CONSTRAINT "benefit_pools_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benefit_pools" ADD CONSTRAINT "benefit_pools_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "paef_agreements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_eligibilities" ADD CONSTRAINT "employee_eligibilities_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_eligibilities" ADD CONSTRAINT "employee_eligibilities_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "paef_agreements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benefit_debit_logs" ADD CONSTRAINT "benefit_debit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benefit_debit_logs" ADD CONSTRAINT "benefit_debit_logs_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "paef_agreements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benefit_debit_logs" ADD CONSTRAINT "benefit_debit_logs_pool_id_fkey" FOREIGN KEY ("pool_id") REFERENCES "benefit_pools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benefit_debit_logs" ADD CONSTRAINT "benefit_debit_logs_eligibility_id_fkey" FOREIGN KEY ("eligibility_id") REFERENCES "employee_eligibilities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benefit_debit_logs" ADD CONSTRAINT "benefit_debit_logs_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
