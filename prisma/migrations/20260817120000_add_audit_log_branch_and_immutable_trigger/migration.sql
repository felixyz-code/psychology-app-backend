-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN "branchId" UUID,
ADD COLUMN "statusCode" INTEGER,
ADD COLUMN "executionTimeMs" INTEGER,
ADD COLUMN "actorRole" VARCHAR(50);

-- CreateIndex
CREATE INDEX "audit_logs_organizationId_branchId_timestamp_idx" ON "audit_logs"("organizationId", "branchId", "timestamp");

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Inmutabilidad estricta (Append-Only) en audit_logs para cumplimiento NOM-004 / HIPAA
CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Security Error: audit_logs records are append-only and strictly immutable. Updates and deletions are forbidden by NOM-004 / HIPAA compliance policy.'
    USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON "audit_logs";
CREATE TRIGGER trg_audit_logs_immutable
BEFORE UPDATE OR DELETE ON "audit_logs"
FOR EACH ROW
EXECUTE FUNCTION prevent_audit_log_mutation();
