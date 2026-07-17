-- Additive SaaS foundation. This migration intentionally does not create a
-- legacy organization, backfill organizationId, or activate tenant enforcement.

-- CreateEnum
CREATE TYPE "OrganizationStatus" AS ENUM ('PROVISIONING', 'ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('OWNER', 'ADMIN', 'PSYCHOLOGIST', 'RECEPTIONIST', 'BILLING', 'AUDITOR', 'READ_ONLY');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "PsychologistProfileStatus" AS ENUM ('LEGACY_UNVERIFIED', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "PatientAssignmentRole" AS ENUM ('PRIMARY', 'COLLABORATOR', 'CONSULTING');

-- CreateEnum
CREATE TYPE "PatientAssignmentStatus" AS ENUM ('ACTIVE', 'ENDED', 'REVOKED');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "legalName" VARCHAR(255) NOT NULL,
    "displayName" VARCHAR(150) NOT NULL,
    "status" "OrganizationStatus" NOT NULL DEFAULT 'PROVISIONING',
    "timezone" VARCHAR(100) NOT NULL DEFAULT 'UTC',
    "locale" VARCHAR(20) NOT NULL DEFAULT 'es-MX',
    "currency" CHAR(3) NOT NULL DEFAULT 'MXN',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "psychologist_profiles" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "professionalName" VARCHAR(150) NOT NULL,
    "licenseNumber" VARCHAR(100),
    "status" "PsychologistProfileStatus" NOT NULL DEFAULT 'LEGACY_UNVERIFIED',
    "verifiedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "psychologist_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_memberships" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'INVITED',
    "joinedAt" TIMESTAMPTZ(3),
    "suspendedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "organization_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_settings" (
    "organizationId" UUID NOT NULL,
    "weekStartsOn" INTEGER NOT NULL DEFAULT 1,
    "defaultAppointmentDuration" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "organization_settings_pkey" PRIMARY KEY ("organizationId")
);

-- CreateTable
CREATE TABLE "organization_branding" (
    "organizationId" UUID NOT NULL,
    "visualName" VARCHAR(150),
    "primaryColor" VARCHAR(7),
    "accentColor" VARCHAR(7),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "organization_branding_pkey" PRIMARY KEY ("organizationId")
);

-- CreateTable
CREATE TABLE "organization_invitations" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "tokenDigest" CHAR(64) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "acceptedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "organization_invitations_pkey" PRIMARY KEY ("id")
);

-- Add nullable tenant references to legacy entities. No data is populated here.
ALTER TABLE "patients" ADD COLUMN "organizationId" UUID;
ALTER TABLE "case_files" ADD COLUMN "organizationId" UUID;
ALTER TABLE "session_notes" ADD COLUMN "organizationId" UUID;
ALTER TABLE "documents" ADD COLUMN "organizationId" UUID;
ALTER TABLE "appointments" ADD COLUMN "organizationId" UUID;
ALTER TABLE "financial_transactions" ADD COLUMN "organizationId" UUID;

-- CreateTable
CREATE TABLE "patient_assignments" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "role" "PatientAssignmentRole" NOT NULL,
    "status" "PatientAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMPTZ(3),
    "creationReason" VARCHAR(500),
    "closureReason" VARCHAR(500),
    "createdByMembershipId" UUID,
    "closedByMembershipId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "patient_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");
CREATE UNIQUE INDEX "psychologist_profiles_userId_key" ON "psychologist_profiles"("userId");
CREATE UNIQUE INDEX "organization_memberships_organizationId_userId_key" ON "organization_memberships"("organizationId", "userId");
CREATE INDEX "organization_memberships_organizationId_status_role_idx" ON "organization_memberships"("organizationId", "status", "role");
CREATE INDEX "organization_memberships_userId_status_idx" ON "organization_memberships"("userId", "status");
CREATE UNIQUE INDEX "organization_invitations_tokenDigest_key" ON "organization_invitations"("tokenDigest");
CREATE INDEX "organization_invitations_organizationId_email_idx" ON "organization_invitations"("organizationId", "email");
CREATE INDEX "patients_organizationId_createdAt_idx" ON "patients"("organizationId", "createdAt");
CREATE INDEX "case_files_organizationId_createdAt_idx" ON "case_files"("organizationId", "createdAt");
CREATE INDEX "session_notes_organizationId_sessionDate_idx" ON "session_notes"("organizationId", "sessionDate");
CREATE INDEX "documents_organizationId_uploadedAt_idx" ON "documents"("organizationId", "uploadedAt");
CREATE INDEX "appointments_organizationId_scheduledAt_idx" ON "appointments"("organizationId", "scheduledAt");
CREATE INDEX "financial_transactions_organizationId_occurredAt_idx" ON "financial_transactions"("organizationId", "occurredAt");
CREATE INDEX "patient_assignments_organizationId_patientId_status_idx" ON "patient_assignments"("organizationId", "patientId", "status");
CREATE INDEX "patient_assignments_organizationId_membershipId_status_idx" ON "patient_assignments"("organizationId", "membershipId", "status");

-- AddForeignKey
ALTER TABLE "psychologist_profiles" ADD CONSTRAINT "psychologist_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "organization_settings" ADD CONSTRAINT "organization_settings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_branding" ADD CONSTRAINT "organization_branding_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "patients" ADD CONSTRAINT "patients_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "case_files" ADD CONSTRAINT "case_files_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "session_notes" ADD CONSTRAINT "session_notes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "documents" ADD CONSTRAINT "documents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "patient_assignments" ADD CONSTRAINT "patient_assignments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "patient_assignments" ADD CONSTRAINT "patient_assignments_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "patient_assignments" ADD CONSTRAINT "patient_assignments_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "organization_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "patient_assignments" ADD CONSTRAINT "patient_assignments_createdByMembershipId_fkey" FOREIGN KEY ("createdByMembershipId") REFERENCES "organization_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "patient_assignments" ADD CONSTRAINT "patient_assignments_closedByMembershipId_fkey" FOREIGN KEY ("closedByMembershipId") REFERENCES "organization_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;
