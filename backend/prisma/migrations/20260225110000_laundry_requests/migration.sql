-- CreateTable
CREATE TABLE "laundry_requests" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL DEFAULT 'main',
    "roomNumber" TEXT,
    "item" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "createdByWorkerId" TEXT,
    "createdByWorkerName" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "laundry_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "laundry_requests_businessId_createdAt_idx" ON "laundry_requests"("businessId", "createdAt");

-- AddForeignKey
ALTER TABLE "laundry_requests" ADD CONSTRAINT "laundry_requests_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
