-- Idempotent HITL migration
DO $$ BEGIN CREATE TYPE "HitlType" AS ENUM ('PLAN', 'PLAN_REVIEW'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "HitlStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'TONGYI', 'BOHUI'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ReviewType" AS ENUM ('PLAN_REVIEW', 'IMPLEMENTATION', 'RUNTIME'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS "HitlRecord" ("id" TEXT NOT NULL PRIMARY KEY, "planName" TEXT NOT NULL, "round" INTEGER NOT NULL DEFAULT 1, "type" "HitlType" NOT NULL DEFAULT 'PLAN', "status" "HitlStatus" NOT NULL DEFAULT 'DRAFT', "proposalPath" TEXT, "approvedAt" TIMESTAMP(3), "rejectedAt" TIMESTAMP(3), "rejectReason" TEXT, "createdBy" TEXT NOT NULL DEFAULT 'ai-assistant', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL);
CREATE TABLE IF NOT EXISTS "PlanRecord" ("id" TEXT NOT NULL PRIMARY KEY, "planName" TEXT NOT NULL, "planPath" TEXT NOT NULL, "specPath" TEXT, "tasksPath" TEXT, "checklistPath" TEXT, "totalTasks" INTEGER NOT NULL DEFAULT 0, "doneTasks" INTEGER NOT NULL DEFAULT 0, "checklistT" INTEGER NOT NULL DEFAULT 0, "checklistTDone" INTEGER NOT NULL DEFAULT 0, "checklistR" INTEGER NOT NULL DEFAULT 0, "planKeyword" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL);
CREATE TABLE IF NOT EXISTS "ReviewRecord" ("id" TEXT NOT NULL PRIMARY KEY, "planName" TEXT NOT NULL, "type" "ReviewType" NOT NULL DEFAULT 'PLAN_REVIEW', "reviewPath" TEXT, "p0Count" INTEGER NOT NULL DEFAULT 0, "p1Count" INTEGER NOT NULL DEFAULT 0, "backflowRate" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL);
CREATE INDEX IF NOT EXISTS "HitlRecord_planName_idx" ON "HitlRecord"("planName");
CREATE INDEX IF NOT EXISTS "HitlRecord_status_idx" ON "HitlRecord"("status");
CREATE UNIQUE INDEX IF NOT EXISTS "HitlRecord_planName_round_key" ON "HitlRecord"("planName", "round");
CREATE UNIQUE INDEX IF NOT EXISTS "PlanRecord_planName_key" ON "PlanRecord"("planName");
CREATE INDEX IF NOT EXISTS "PlanRecord_planKeyword_idx" ON "PlanRecord"("planKeyword");
CREATE INDEX IF NOT EXISTS "ReviewRecord_planName_idx" ON "ReviewRecord"("planName");
CREATE INDEX IF NOT EXISTS "ReviewRecord_type_idx" ON "ReviewRecord"("type");
DO $$ BEGIN ALTER TABLE "HitlRecord" ADD CONSTRAINT "HitlRecord_planName_fkey" FOREIGN KEY ("planName") REFERENCES "PlanRecord"("planName") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ReviewRecord" ADD CONSTRAINT "ReviewRecord_planName_fkey" FOREIGN KEY ("planName") REFERENCES "PlanRecord"("planName") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
