-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "address" TEXT,
ADD COLUMN     "email" VARCHAR(255),
ADD COLUMN     "phone" VARCHAR(30),
ADD COLUMN     "taxId" VARCHAR(50),
ADD COLUMN     "tradeName" VARCHAR(150),
ADD COLUMN     "website" VARCHAR(500);
