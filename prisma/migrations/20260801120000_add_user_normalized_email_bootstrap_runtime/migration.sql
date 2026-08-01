ALTER TABLE "users"
    ADD COLUMN "normalizedEmail" VARCHAR(255);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "users"
        WHERE btrim("email") = ''
    ) THEN
        RAISE EXCEPTION
            'Cannot add user normalizedEmail: blank legacy email exists; remediate explicitly before migration';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "users"
        WHERE octet_length(lower(btrim("email"))) > 255
    ) THEN
        RAISE EXCEPTION
            'Cannot add user normalizedEmail: normalized legacy email exceeds 255 bytes';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM (
            SELECT lower(btrim("email")) AS normalized_email
            FROM "users"
            GROUP BY lower(btrim("email"))
            HAVING COUNT(*) > 1
        ) AS duplicate_users
    ) THEN
        RAISE EXCEPTION
            'Cannot add user normalizedEmail: duplicate canonical users already exist';
    END IF;
END $$;

UPDATE "users"
SET "normalizedEmail" = lower(btrim("email"));

ALTER TABLE "users"
    ALTER COLUMN "normalizedEmail" SET NOT NULL;

CREATE UNIQUE INDEX "users_normalizedEmail_key"
    ON "users" ("normalizedEmail");
