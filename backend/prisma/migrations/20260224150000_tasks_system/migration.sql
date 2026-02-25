-- =========================
-- TASKS SYSTEM (structured operations tasks)
-- =========================

-- CreateTable: tasks
CREATE TABLE IF NOT EXISTS "tasks" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL DEFAULT 'main',
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" TEXT,
    "dueDate" TIMESTAMP(3),
    "isAllStaff" BOOLEAN NOT NULL DEFAULT false,
    "targetRole" TEXT,
    "targetWorkerId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdByRole" TEXT NOT NULL DEFAULT 'MANAGER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "completedByUserId" TEXT,
    "completedByWorkerId" TEXT,
    "completionNote" TEXT,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable: task_reads
CREATE TABLE IF NOT EXISTS "task_reads" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_reads_pkey" PRIMARY KEY ("id")
);

-- Foreign keys: tasks
ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "businesses"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_targetWorkerId_fkey"
  FOREIGN KEY ("targetWorkerId") REFERENCES "staff_workers"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_completedByUserId_fkey"
  FOREIGN KEY ("completedByUserId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_completedByWorkerId_fkey"
  FOREIGN KEY ("completedByWorkerId") REFERENCES "staff_workers"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Foreign keys: task_reads
ALTER TABLE "task_reads"
  ADD CONSTRAINT "task_reads_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "businesses"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "task_reads"
  ADD CONSTRAINT "task_reads_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "tasks"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "task_reads"
  ADD CONSTRAINT "task_reads_workerId_fkey"
  FOREIGN KEY ("workerId") REFERENCES "staff_workers"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "task_reads"
  ADD CONSTRAINT "task_reads_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Unique constraint: one read receipt per worker per task
CREATE UNIQUE INDEX IF NOT EXISTS "task_reads_taskId_workerId_key" ON "task_reads"("taskId", "workerId");

-- Indexes
CREATE INDEX IF NOT EXISTS "tasks_businessId_createdAt_idx" ON "tasks"("businessId", "createdAt");
CREATE INDEX IF NOT EXISTS "tasks_businessId_type_createdAt_idx" ON "tasks"("businessId", "type", "createdAt");
CREATE INDEX IF NOT EXISTS "tasks_businessId_targetRole_idx" ON "tasks"("businessId", "targetRole");
CREATE INDEX IF NOT EXISTS "tasks_businessId_targetWorkerId_idx" ON "tasks"("businessId", "targetWorkerId");
CREATE INDEX IF NOT EXISTS "tasks_businessId_dueDate_idx" ON "tasks"("businessId", "dueDate");
CREATE INDEX IF NOT EXISTS "tasks_businessId_completedAt_idx" ON "tasks"("businessId", "completedAt");

CREATE INDEX IF NOT EXISTS "task_reads_businessId_readAt_idx" ON "task_reads"("businessId", "readAt");
CREATE INDEX IF NOT EXISTS "task_reads_businessId_workerId_idx" ON "task_reads"("businessId", "workerId");

