-- CreateTable
CREATE TABLE "admin_alerts" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "senderRole" TEXT NOT NULL,
    "senderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_alert_reads" (
    "id" TEXT NOT NULL,
    "alertId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_alert_reads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admin_alerts_businessId_createdAt_idx" ON "admin_alerts"("businessId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "admin_alert_reads_alertId_userId_key" ON "admin_alert_reads"("alertId", "userId");

-- CreateIndex
CREATE INDEX "admin_alert_reads_userId_idx" ON "admin_alert_reads"("userId");

-- AddForeignKey
ALTER TABLE "admin_alerts" ADD CONSTRAINT "admin_alerts_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_alert_reads" ADD CONSTRAINT "admin_alert_reads_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "admin_alerts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
