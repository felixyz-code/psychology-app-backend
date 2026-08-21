-- CreateEnum
CREATE TYPE "AttachmentCategory" AS ENUM ('ESTUDIO_PREVIO', 'REPORTE_ESCOLAR', 'IDENTIFICACION', 'OTRO');

-- CreateTable
CREATE TABLE "case_file_attachments" (
    "id" UUID NOT NULL,
    "organizationId" UUID,
    "caseFileId" UUID NOT NULL,
    "uploadedById" UUID NOT NULL,
    "fileName" VARCHAR(255) NOT NULL,
    "originalName" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "category" "AttachmentCategory" NOT NULL DEFAULT 'OTRO',
    "notes" TEXT,
    "filePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "case_file_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "case_file_attachments_caseFileId_idx" ON "case_file_attachments"("caseFileId");

-- CreateIndex
CREATE INDEX "case_file_attachments_uploadedById_idx" ON "case_file_attachments"("uploadedById");

-- CreateIndex
CREATE INDEX "case_file_attachments_organizationId_createdAt_idx" ON "case_file_attachments"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "case_file_attachments_category_idx" ON "case_file_attachments"("category");

-- AddForeignKey
ALTER TABLE "case_file_attachments" ADD CONSTRAINT "case_file_attachments_caseFileId_fkey" FOREIGN KEY ("caseFileId") REFERENCES "case_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_file_attachments" ADD CONSTRAINT "case_file_attachments_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_file_attachments" ADD CONSTRAINT "case_file_attachments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
