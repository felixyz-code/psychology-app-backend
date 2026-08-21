-- CreateTable
CREATE TABLE "schedule_blocks" (
    "id" UUID NOT NULL,
    "organizationId" UUID,
    "therapistId" UUID NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "reason" TEXT,
    "startTime" TIMESTAMPTZ(3) NOT NULL,
    "endTime" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "schedule_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "schedule_blocks_organizationId_therapistId_idx" ON "schedule_blocks"("organizationId", "therapistId");

-- CreateIndex
CREATE INDEX "schedule_blocks_therapistId_startTime_endTime_idx" ON "schedule_blocks"("therapistId", "startTime", "endTime");

-- CreateIndex
CREATE INDEX "schedule_blocks_startTime_endTime_idx" ON "schedule_blocks"("startTime", "endTime");

-- AddForeignKey
ALTER TABLE "schedule_blocks" ADD CONSTRAINT "schedule_blocks_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_blocks" ADD CONSTRAINT "schedule_blocks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
