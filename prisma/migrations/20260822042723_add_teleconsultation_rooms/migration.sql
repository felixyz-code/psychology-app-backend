-- CreateEnum
CREATE TYPE "TeleconsultationRoomStatus" AS ENUM ('PENDING', 'ACTIVE', 'EXPIRED', 'TERMINATED');

-- CreateTable
CREATE TABLE "teleconsultation_rooms" (
    "id" UUID NOT NULL,
    "organizationId" UUID,
    "appointmentId" UUID NOT NULL,
    "roomCode" VARCHAR(64) NOT NULL,
    "provider" VARCHAR(50) NOT NULL DEFAULT 'internal',
    "therapistPasscode" VARCHAR(128) NOT NULL,
    "patientToken" VARCHAR(256) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "status" "TeleconsultationRoomStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "teleconsultation_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "teleconsultation_rooms_appointmentId_key" ON "teleconsultation_rooms"("appointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "teleconsultation_rooms_roomCode_key" ON "teleconsultation_rooms"("roomCode");

-- CreateIndex
CREATE INDEX "teleconsultation_rooms_organizationId_status_idx" ON "teleconsultation_rooms"("organizationId", "status");

-- CreateIndex
CREATE INDEX "teleconsultation_rooms_appointmentId_idx" ON "teleconsultation_rooms"("appointmentId");

-- CreateIndex
CREATE INDEX "teleconsultation_rooms_expiresAt_status_idx" ON "teleconsultation_rooms"("expiresAt", "status");

-- AddForeignKey
ALTER TABLE "teleconsultation_rooms" ADD CONSTRAINT "teleconsultation_rooms_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teleconsultation_rooms" ADD CONSTRAINT "teleconsultation_rooms_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
