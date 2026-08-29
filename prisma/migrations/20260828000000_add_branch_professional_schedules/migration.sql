-- CreateTable
CREATE TABLE "branch_professional_schedules" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "start_time" VARCHAR(5) NOT NULL,
    "end_time" VARCHAR(5) NOT NULL,
    "duration_slot_minutes" INTEGER NOT NULL DEFAULT 60,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "branch_professional_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "branch_professional_schedules_organization_id_branch_id_user_id_idx" ON "branch_professional_schedules"("organization_id", "branch_id", "user_id");

-- CreateIndex
CREATE INDEX "branch_professional_schedules_branch_id_day_of_week_idx" ON "branch_professional_schedules"("branch_id", "day_of_week");

-- AddForeignKey
ALTER TABLE "branch_professional_schedules" ADD CONSTRAINT "branch_professional_schedules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_professional_schedules" ADD CONSTRAINT "branch_professional_schedules_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_professional_schedules" ADD CONSTRAINT "branch_professional_schedules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
