-- CreateTable: bar_restocks
CREATE TABLE IF NOT EXISTS "bar_restocks" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL DEFAULT 'main',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT NOT NULL,
  "createdByRole" TEXT NOT NULL,
  "createdByWorkerId" TEXT,
  "createdByWorkerName" TEXT,
  "approvedById" TEXT NOT NULL,
  "approvedByRole" TEXT NOT NULL,
  "approvedByWorkerId" TEXT,
  "approvedByWorkerName" TEXT,
  "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bar_restocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable: bar_restock_items
CREATE TABLE IF NOT EXISTS "bar_restock_items" (
  "id" TEXT NOT NULL,
  "restockId" TEXT NOT NULL,
  "barItemId" TEXT NOT NULL,
  "inventoryItemId" TEXT,
  "stockBefore" INTEGER NOT NULL,
  "quantityAdded" INTEGER NOT NULL,
  "stockAfter" INTEGER NOT NULL,
  CONSTRAINT "bar_restock_items_pkey" PRIMARY KEY ("id")
);

-- Foreign keys
ALTER TABLE "bar_restocks"
  ADD CONSTRAINT "bar_restocks_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "businesses"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "bar_restock_items"
  ADD CONSTRAINT "bar_restock_items_restockId_fkey"
  FOREIGN KEY ("restockId") REFERENCES "bar_restocks"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "bar_restock_items"
  ADD CONSTRAINT "bar_restock_items_barItemId_fkey"
  FOREIGN KEY ("barItemId") REFERENCES "bar_items"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

