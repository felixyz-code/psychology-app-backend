-- AlterTable
ALTER TABLE "patients" ADD COLUMN "branch_id" UUID;

-- CreateIndex
CREATE INDEX "patients_branch_id_idx" ON "patients"("branch_id");

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
