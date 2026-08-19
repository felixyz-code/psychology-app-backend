-- AlterTable
ALTER TABLE "psychologist_profiles" ADD COLUMN     "bio" TEXT,
ADD COLUMN     "phone" VARCHAR(30),
ADD COLUMN     "specialties" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "user_avatar_assets" (
    "userId" UUID NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "user_avatar_assets_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "user_signature_assets" (
    "userId" UUID NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "user_signature_assets_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_avatar_assets_storageKey_key" ON "user_avatar_assets"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "user_signature_assets_storageKey_key" ON "user_signature_assets"("storageKey");

-- AddForeignKey
ALTER TABLE "user_avatar_assets" ADD CONSTRAINT "user_avatar_assets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "psychologist_profiles"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_signature_assets" ADD CONSTRAINT "user_signature_assets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "psychologist_profiles"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
