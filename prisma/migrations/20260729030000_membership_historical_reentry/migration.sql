-- Permit historical revoked membership rows while preserving at most one
-- non-terminal membership per organization and user.
BEGIN;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM (
            SELECT "organizationId", "userId"
            FROM "organization_memberships"
            WHERE "status" IN ('INVITED', 'ACTIVE', 'SUSPENDED')
            GROUP BY "organizationId", "userId"
            HAVING count(*) > 1
        ) AS duplicate_non_terminal_memberships
    ) THEN
        RAISE EXCEPTION
            'Cannot create membership historical re-entry index: duplicate non-terminal memberships already exist; remediate explicitly before migration';
    END IF;
END $$;

DROP INDEX "organization_memberships_organizationId_userId_key";

CREATE INDEX "organization_memberships_organizationId_userId_idx"
    ON "organization_memberships" ("organizationId", "userId");

CREATE UNIQUE INDEX "organization_memberships_active_window_key"
    ON "organization_memberships" ("organizationId", "userId")
    WHERE "status" IN ('INVITED', 'ACTIVE', 'SUSPENDED');

COMMIT;
