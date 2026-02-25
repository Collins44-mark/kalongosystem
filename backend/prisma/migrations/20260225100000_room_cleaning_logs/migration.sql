-- CreateTable
CREATE TABLE "room_cleaning_logs" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL DEFAULT 'main',
    "roomId" TEXT NOT NULL,
    "cleanedByWorkerId" TEXT,
    "cleanedByWorkerName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_cleaning_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "room_cleaning_logs_businessId_roomId_idx" ON "room_cleaning_logs"("businessId", "roomId");

-- CreateIndex
CREATE INDEX "room_cleaning_logs_businessId_createdAt_idx" ON "room_cleaning_logs"("businessId", "createdAt");

-- AddForeignKey
ALTER TABLE "room_cleaning_logs" ADD CONSTRAINT "room_cleaning_logs_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_cleaning_logs" ADD CONSTRAINT "room_cleaning_logs_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
