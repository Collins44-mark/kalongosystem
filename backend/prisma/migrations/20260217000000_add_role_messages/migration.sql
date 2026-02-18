-- CreateTable
CREATE TABLE "role_messages" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderRole" TEXT NOT NULL,
    "recipientRole" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "role_messages_businessId_createdAt_idx" ON "role_messages"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "role_messages_businessId_recipientRole_idx" ON "role_messages"("businessId", "recipientRole");

-- AddForeignKey
ALTER TABLE "role_messages" ADD CONSTRAINT "role_messages_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
