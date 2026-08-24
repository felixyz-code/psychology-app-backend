-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'SMS', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "NotificationEventType" AS ENUM ('APPOINTMENT_CONFIRMATION', 'APPOINTMENT_REMINDER_24H', 'APPOINTMENT_REMINDER_2H', 'APPOINTMENT_RESCHEDULED', 'APPOINTMENT_CANCELLED');

-- CreateTable
CREATE TABLE "notification_templates" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "event_type" "NotificationEventType" NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "subject" VARCHAR(255),
    "body" TEXT NOT NULL,
    "variables" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_templates_organization_id_channel_event_type_key" ON "notification_templates"("organization_id", "channel", "event_type");

-- CreateIndex
CREATE INDEX "notification_templates_organization_id_channel_idx" ON "notification_templates"("organization_id", "channel");

-- CreateIndex
CREATE INDEX "notification_templates_organization_id_event_type_idx" ON "notification_templates"("organization_id", "event_type");

-- CreateIndex
CREATE INDEX "notification_templates_organization_id_is_active_idx" ON "notification_templates"("organization_id", "is_active");

-- AddForeignKey
ALTER TABLE "notification_templates" ADD CONSTRAINT "notification_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
