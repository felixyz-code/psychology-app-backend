-- CreateEnum
CREATE TYPE "InstrumentVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'DEPRECATED');

-- CreateTable
CREATE TABLE "instruments" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "target_population" VARCHAR(150),
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "instruments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instrument_versions" (
    "id" UUID NOT NULL,
    "instrument_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL DEFAULT 1,
    "status" "InstrumentVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "definition_json" JSONB NOT NULL,
    "scoring_spec_json" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(3),

    CONSTRAINT "instrument_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "instruments_organization_id_is_system_idx" ON "instruments"("organization_id", "is_system");

-- CreateIndex
CREATE INDEX "instruments_code_is_system_idx" ON "instruments"("code", "is_system");

-- CreateIndex
CREATE UNIQUE INDEX "instruments_organization_id_code_key" ON "instruments"("organization_id", "code");

-- CreateIndex
CREATE INDEX "instrument_versions_instrument_id_status_idx" ON "instrument_versions"("instrument_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "instrument_versions_instrument_id_version_number_key" ON "instrument_versions"("instrument_id", "version_number");

-- AddForeignKey
ALTER TABLE "instruments" ADD CONSTRAINT "instruments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instrument_versions" ADD CONSTRAINT "instrument_versions_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "instruments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
