-- CreateTable
CREATE TABLE "tenant_instrument_configs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "instrument_id" UUID NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tenant_instrument_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenant_instrument_configs_organization_id_instrument_id_key" ON "tenant_instrument_configs"("organization_id", "instrument_id");

-- CreateIndex
CREATE INDEX "tenant_instrument_configs_organization_id_is_enabled_idx" ON "tenant_instrument_configs"("organization_id", "is_enabled");

-- CreateIndex
CREATE INDEX "tenant_instrument_configs_instrument_id_idx" ON "tenant_instrument_configs"("instrument_id");

-- AddForeignKey
ALTER TABLE "tenant_instrument_configs" ADD CONSTRAINT "tenant_instrument_configs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_instrument_configs" ADD CONSTRAINT "tenant_instrument_configs_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "instruments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
