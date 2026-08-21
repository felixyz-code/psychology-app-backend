-- CreateEnum
CREATE TYPE "UserTimeFormat" AS ENUM ('TWELVE_HOUR', 'TWENTY_FOUR_HOUR');

-- CreateEnum
CREATE TYPE "UserDateFormat" AS ENUM ('DD_MM_YYYY', 'YYYY_MM_DD', 'MM_DD_YYYY');

-- CreateTable
CREATE TABLE "user_preferences" (
    "userId" UUID NOT NULL,
    "emailNotifications" BOOLEAN NOT NULL DEFAULT true,
    "inAppNotifications" BOOLEAN NOT NULL DEFAULT true,
    "appointmentReminders" BOOLEAN NOT NULL DEFAULT true,
    "reminderAdvanceMinutes" INTEGER NOT NULL DEFAULT 60,
    "sessionDigest" BOOLEAN NOT NULL DEFAULT true,
    "timeZone" VARCHAR(100) NOT NULL DEFAULT 'America/Mexico_City',
    "timeFormat" "UserTimeFormat" NOT NULL DEFAULT 'TWELVE_HOUR',
    "dateFormat" "UserDateFormat" NOT NULL DEFAULT 'DD_MM_YYYY',
    "locale" VARCHAR(20) NOT NULL DEFAULT 'es-MX',
    "weekStartsOn" SMALLINT NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
