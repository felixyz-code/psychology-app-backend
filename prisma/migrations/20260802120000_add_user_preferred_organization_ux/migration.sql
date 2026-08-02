-- Add a nullable UX-only preferred organization reference on users.
ALTER TABLE "users"
ADD COLUMN "preferredOrganizationId" UUID NULL;

ALTER TABLE "users"
ADD CONSTRAINT "users_preferredOrganizationId_fkey"
FOREIGN KEY ("preferredOrganizationId")
REFERENCES "organizations"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

CREATE INDEX "users_preferredOrganizationId_idx"
ON "users"("preferredOrganizationId");
