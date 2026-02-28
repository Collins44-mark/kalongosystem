-- DropIndex
DROP INDEX IF EXISTS "rooms_businessId_branchId_roomNumber_key";

-- CreateIndex
CREATE UNIQUE INDEX "rooms_businessId_branchId_categoryId_roomNumber_key" ON "rooms"("businessId", "branchId", "categoryId", "roomNumber");
