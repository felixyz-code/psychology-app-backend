-- Add optional, organization-owned logo metadata without a legacy backfill.
CREATE TABLE "organization_logo_assets" (
    "organizationId" UUID NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "organization_logo_assets_pkey" PRIMARY KEY ("organizationId")
);

CREATE UNIQUE INDEX "organization_logo_assets_storageKey_key"
ON "organization_logo_assets"("storageKey");

ALTER TABLE "organization_logo_assets"
ADD CONSTRAINT "organization_logo_assets_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
