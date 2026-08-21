-- CreateEnum
CREATE TYPE "AuditSeverity" AS ENUM ('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN "severity" "AuditSeverity" NOT NULL DEFAULT 'INFO';

-- CreateIndex
CREATE INDEX "audit_logs_organizationId_severity_timestamp_idx" ON "audit_logs"("organizationId", "severity", "timestamp");
