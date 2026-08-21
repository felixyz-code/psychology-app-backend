-- CreateEnum
CREATE TYPE "AdministrationStatus" AS ENUM ('ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "assessment_administrations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID,
    "patient_id" UUID NOT NULL,
    "professional_id" UUID NOT NULL,
    "case_file_id" UUID,
    "instrument_version_id" UUID NOT NULL,
    "status" "AdministrationStatus" NOT NULL DEFAULT 'ASSIGNED',
    "access_token" VARCHAR(128),
    "expires_at" TIMESTAMPTZ(3),
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "assessment_administrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_responses" (
    "id" UUID NOT NULL,
    "administration_id" UUID NOT NULL,
    "item_code" VARCHAR(50) NOT NULL,
    "response_value" JSONB NOT NULL,
    "numeric_weight" DOUBLE PRECISION,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "assessment_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_results" (
    "id" UUID NOT NULL,
    "administration_id" UUID NOT NULL,
    "raw_score" DOUBLE PRECISION NOT NULL,
    "normalized_score" DOUBLE PRECISION,
    "strata_code" VARCHAR(50),
    "strata_title" VARCHAR(150),
    "severity" VARCHAR(50),
    "subscale_scores_json" JSONB,
    "flags_json" JSONB,
    "scoring_spec_snapshot_json" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "assessment_administrations_access_token_key" ON "assessment_administrations"("access_token");

-- CreateIndex
CREATE INDEX "assessment_administrations_organization_id_status_idx" ON "assessment_administrations"("organization_id", "status");

-- CreateIndex
CREATE INDEX "assessment_administrations_patient_id_status_idx" ON "assessment_administrations"("patient_id", "status");

-- CreateIndex
CREATE INDEX "assessment_administrations_professional_id_status_idx" ON "assessment_administrations"("professional_id", "status");

-- CreateIndex
CREATE INDEX "assessment_administrations_case_file_id_idx" ON "assessment_administrations"("case_file_id");

-- CreateIndex
CREATE INDEX "assessment_administrations_instrument_version_id_idx" ON "assessment_administrations"("instrument_version_id");

-- CreateIndex
CREATE INDEX "assessment_administrations_access_token_idx" ON "assessment_administrations"("access_token");

-- CreateIndex
CREATE INDEX "assessment_administrations_organization_id_created_at_idx" ON "assessment_administrations"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "assessment_responses_administration_id_idx" ON "assessment_responses"("administration_id");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_responses_administration_id_item_code_key" ON "assessment_responses"("administration_id", "item_code");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_results_administration_id_key" ON "assessment_results"("administration_id");

-- CreateIndex
CREATE INDEX "assessment_results_administration_id_idx" ON "assessment_results"("administration_id");

-- AddForeignKey
ALTER TABLE "assessment_administrations" ADD CONSTRAINT "assessment_administrations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_administrations" ADD CONSTRAINT "assessment_administrations_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_administrations" ADD CONSTRAINT "assessment_administrations_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_administrations" ADD CONSTRAINT "assessment_administrations_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_administrations" ADD CONSTRAINT "assessment_administrations_case_file_id_fkey" FOREIGN KEY ("case_file_id") REFERENCES "case_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_administrations" ADD CONSTRAINT "assessment_administrations_instrument_version_id_fkey" FOREIGN KEY ("instrument_version_id") REFERENCES "instrument_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_responses" ADD CONSTRAINT "assessment_responses_administration_id_fkey" FOREIGN KEY ("administration_id") REFERENCES "assessment_administrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_administration_id_fkey" FOREIGN KEY ("administration_id") REFERENCES "assessment_administrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
