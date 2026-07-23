-- Invitation lifecycle persistence. This migration is additive and does not
-- materialize time-derived expiry, invent recipient identities, or touch
-- clinical records.
BEGIN;

ALTER TABLE "organization_invitations"
    ADD COLUMN "normalizedEmail" VARCHAR(255),
    ADD COLUMN "invitedUserId" UUID,
    ADD COLUMN "acceptedByUserId" UUID,
    ADD COLUMN "rejectedAt" TIMESTAMPTZ(3),
    ADD COLUMN "expiredAt" TIMESTAMPTZ(3);

-- Existing invitation email is required in the pre-2.1C1 schema. Values that
-- cannot become the defined canonical key fail closed rather than being
-- guessed, discarded, or emitted in the error text.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "organization_invitations"
        WHERE btrim("email") = ''
    ) THEN
        RAISE EXCEPTION
            'Cannot add invitation normalizedEmail: blank legacy email exists; remediate explicitly before migration';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "organization_invitations"
        WHERE octet_length(lower(btrim("email"))) > 255
    ) THEN
        RAISE EXCEPTION
            'Cannot add invitation normalizedEmail: normalized legacy email exceeds 255 bytes';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM (
            SELECT "organizationId", lower(btrim("email"))
            FROM "organization_invitations"
            WHERE "acceptedAt" IS NULL
              AND "revokedAt" IS NULL
            GROUP BY "organizationId", lower(btrim("email"))
            HAVING count(*) > 1
        ) AS duplicate_pending_invitations
    ) THEN
        RAISE EXCEPTION
            'Cannot add invitation pending-email uniqueness: duplicate legacy pending invitations exist; remediate explicitly before migration';
    END IF;
END $$;

-- Canonical normalization is trim followed by PostgreSQL lower() under the
-- database collation. Application validation is intentionally deferred to the
-- API phase; the database does not apply a complex email-format regex.
UPDATE "organization_invitations"
SET "normalizedEmail" = lower(btrim("email"));

ALTER TABLE "organization_invitations"
    ALTER COLUMN "normalizedEmail" SET NOT NULL;

ALTER TABLE "organization_invitations"
    ADD CONSTRAINT "organization_invitations_one_terminal_state_check"
    CHECK (num_nonnulls("acceptedAt", "rejectedAt", "revokedAt", "expiredAt") <= 1),
    ADD CONSTRAINT "organization_invitations_expired_at_after_expires_at_check"
    CHECK ("expiredAt" IS NULL OR "expiredAt" >= "expiresAt"),
    ADD CONSTRAINT "organization_invitations_accepted_by_requires_accepted_at_check"
    CHECK ("acceptedByUserId" IS NULL OR "acceptedAt" IS NOT NULL);

ALTER TABLE "organization_invitations"
    ADD CONSTRAINT "organization_invitations_invitedUserId_fkey"
    FOREIGN KEY ("invitedUserId") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "organization_invitations_acceptedByUserId_fkey"
    FOREIGN KEY ("acceptedByUserId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- PostgreSQL partial indexes cannot be represented in Prisma schema. Expiry is
-- materialized by a future serializable lifecycle/create transaction before
-- it inserts an equivalent pending invitation; a dynamic clock predicate is
-- deliberately absent.
CREATE UNIQUE INDEX "organization_invitations_organizationId_normalizedEmail_pending_key"
    ON "organization_invitations" ("organizationId", "normalizedEmail")
    WHERE "acceptedAt" IS NULL
      AND "rejectedAt" IS NULL
      AND "revokedAt" IS NULL
      AND "expiredAt" IS NULL;

COMMIT;
