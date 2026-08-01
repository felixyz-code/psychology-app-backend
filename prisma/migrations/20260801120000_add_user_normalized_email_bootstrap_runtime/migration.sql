ALTER TABLE "users"
    ADD COLUMN "normalizedEmail" VARCHAR(255);

CREATE TEMP TABLE "_user_email_identity_candidates" AS
SELECT
    "id",
    regexp_replace("email", '^[[:space:]]+|[[:space:]]+$', '', 'g') AS trimmed_email,
    lower(regexp_replace("email", '^[[:space:]]+|[[:space:]]+$', '', 'g')) AS normalized_email
FROM "users";

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "_user_email_identity_candidates"
        WHERE trimmed_email = ''
    ) THEN
        RAISE EXCEPTION
            'Cannot add user normalizedEmail: blank legacy email exists; remediate explicitly before migration';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "_user_email_identity_candidates"
        WHERE octet_length(trimmed_email) <> char_length(trimmed_email)
    ) THEN
        RAISE EXCEPTION
            'Cannot add user normalizedEmail: unsupported non-ASCII legacy email exists; remediate explicitly before migration';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "_user_email_identity_candidates"
        WHERE octet_length(normalized_email) > 255
    ) THEN
        RAISE EXCEPTION
            'Cannot add user normalizedEmail: normalized legacy email exceeds 255 bytes';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM (
            SELECT normalized_email
            FROM "_user_email_identity_candidates"
            GROUP BY normalized_email
            HAVING COUNT(*) > 1
        ) AS duplicate_users
    ) THEN
        RAISE EXCEPTION
            'Cannot add user normalizedEmail: duplicate canonical users already exist';
    END IF;
END $$;

UPDATE "users"
SET "normalizedEmail" = candidates.normalized_email
FROM "_user_email_identity_candidates" AS candidates
WHERE candidates."id" = "users"."id";

DROP TABLE "_user_email_identity_candidates";

ALTER TABLE "users"
    ALTER COLUMN "normalizedEmail" SET NOT NULL;

CREATE UNIQUE INDEX "users_normalizedEmail_key"
    ON "users" ("normalizedEmail");
