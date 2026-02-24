-- AlterTable
ALTER TABLE "User" ADD COLUMN "inboundEmailCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_inboundEmailCode_key" ON "User"("inboundEmailCode");
