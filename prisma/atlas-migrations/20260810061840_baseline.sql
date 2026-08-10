-- Create enum type "HitlType"
CREATE TYPE "public"."HitlType" AS ENUM ('PLAN', 'PLAN_REVIEW', 'COLLAB_CONTRACT');
-- Create enum type "HitlStatus"
CREATE TYPE "public"."HitlStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'TONGYI', 'BOHUI');
-- Create enum type "ReviewType"
CREATE TYPE "public"."ReviewType" AS ENUM ('PLAN_REVIEW', 'IMPLEMENTATION', 'RUNTIME');
-- Create enum type "ContractRole"
CREATE TYPE "public"."ContractRole" AS ENUM ('MASTER', 'SUB');
-- Create "AddUser" table
CREATE TABLE "public"."AddUser" (
  "id" text NOT NULL,
  "username" text NOT NULL,
  "email" text NULL,
  PRIMARY KEY ("id")
);
-- Create index "AddUser_username_key" to table: "AddUser"
CREATE UNIQUE INDEX "AddUser_username_key" ON "public"."AddUser" ("username");
-- Create "AuditLog" table
CREATE TABLE "public"."AuditLog" (
  "id" text NOT NULL,
  "userId" text NOT NULL,
  "action" text NOT NULL,
  "targetType" text NOT NULL,
  "targetId" text NOT NULL,
  "traceId" text NULL,
  "beforeState" jsonb NULL,
  "afterState" jsonb NULL,
  "reason" text NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id"),
  CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."AddUser" ("id") ON UPDATE CASCADE ON DELETE CASCADE
);
-- Create index "AuditLog_traceId_idx" to table: "AuditLog"
CREATE INDEX "AuditLog_traceId_idx" ON "public"."AuditLog" ("traceId");
-- Create "PlanRecord" table
CREATE TABLE "public"."PlanRecord" (
  "id" text NOT NULL,
  "planName" text NOT NULL,
  "planPath" text NOT NULL,
  "specPath" text NULL,
  "tasksPath" text NULL,
  "checklistPath" text NULL,
  "addRoutePath" text NULL,
  "totalTasks" integer NOT NULL DEFAULT 0,
  "doneTasks" integer NOT NULL DEFAULT 0,
  "checklistT" integer NOT NULL DEFAULT 0,
  "checklistTDone" integer NOT NULL DEFAULT 0,
  "checklistR" integer NOT NULL DEFAULT 0,
  "planKeyword" text NULL,
  "contractRole" "public"."ContractRole" NULL,
  "contractName" text NULL,
  "dpsSemScore" integer NULL,
  "dpsEntropyScore" integer NULL,
  "dpsCpmScore" integer NULL,
  "dpsStructScore" integer NULL,
  "dpsComposite" integer NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL,
  PRIMARY KEY ("id")
);
-- Create index "PlanRecord_contractName_idx" to table: "PlanRecord"
CREATE INDEX "PlanRecord_contractName_idx" ON "public"."PlanRecord" ("contractName");
-- Create index "PlanRecord_planKeyword_idx" to table: "PlanRecord"
CREATE INDEX "PlanRecord_planKeyword_idx" ON "public"."PlanRecord" ("planKeyword");
-- Create index "PlanRecord_planName_key" to table: "PlanRecord"
CREATE UNIQUE INDEX "PlanRecord_planName_key" ON "public"."PlanRecord" ("planName");
-- Create "CollabContract" table
CREATE TABLE "public"."CollabContract" (
  "id" text NOT NULL,
  "contractName" text NOT NULL,
  "contractPath" text NOT NULL,
  "masterPlanName" text NOT NULL,
  "participants" jsonb NOT NULL,
  "abilityMatrix" jsonb NULL,
  "stages" jsonb NOT NULL,
  "dependencyGraph" text NULL,
  "fileBoundaries" jsonb NOT NULL,
  "completionCriteria" jsonb NULL,
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "version" integer NOT NULL DEFAULT 1,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "CollabContract_masterPlanName_fkey" FOREIGN KEY ("masterPlanName") REFERENCES "public"."PlanRecord" ("planName") ON UPDATE CASCADE ON DELETE RESTRICT
);
-- Create index "CollabContract_contractName_key" to table: "CollabContract"
CREATE UNIQUE INDEX "CollabContract_contractName_key" ON "public"."CollabContract" ("contractName");
-- Create index "CollabContract_masterPlanName_idx" to table: "CollabContract"
CREATE INDEX "CollabContract_masterPlanName_idx" ON "public"."CollabContract" ("masterPlanName");
-- Create index "CollabContract_masterPlanName_key" to table: "CollabContract"
CREATE UNIQUE INDEX "CollabContract_masterPlanName_key" ON "public"."CollabContract" ("masterPlanName");
-- Create "DevOperation" table
CREATE TABLE "public"."DevOperation" (
  "id" text NOT NULL,
  "userId" text NOT NULL,
  "planKeyword" text NOT NULL,
  "action" text NOT NULL,
  "targetType" text NOT NULL,
  "targetId" text NOT NULL,
  "beforeState" jsonb NULL,
  "afterState" jsonb NULL,
  "reason" text NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id"),
  CONSTRAINT "DevOperation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."AddUser" ("id") ON UPDATE CASCADE ON DELETE CASCADE
);
-- Create index "DevOperation_planKeyword_idx" to table: "DevOperation"
CREATE INDEX "DevOperation_planKeyword_idx" ON "public"."DevOperation" ("planKeyword");
-- Create "HitlRecord" table
CREATE TABLE "public"."HitlRecord" (
  "id" text NOT NULL,
  "planName" text NOT NULL,
  "round" integer NOT NULL DEFAULT 1,
  "type" "public"."HitlType" NOT NULL DEFAULT 'PLAN',
  "status" "public"."HitlStatus" NOT NULL DEFAULT 'DRAFT',
  "proposalPath" text NULL,
  "approvedAt" timestamp(3) NULL,
  "rejectedAt" timestamp(3) NULL,
  "rejectReason" text NULL,
  "createdBy" text NOT NULL DEFAULT 'ai-assistant',
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "HitlRecord_planName_fkey" FOREIGN KEY ("planName") REFERENCES "public"."PlanRecord" ("planName") ON UPDATE CASCADE ON DELETE RESTRICT
);
-- Create index "HitlRecord_planName_idx" to table: "HitlRecord"
CREATE INDEX "HitlRecord_planName_idx" ON "public"."HitlRecord" ("planName");
-- Create index "HitlRecord_planName_round_key" to table: "HitlRecord"
CREATE UNIQUE INDEX "HitlRecord_planName_round_key" ON "public"."HitlRecord" ("planName", "round");
-- Create index "HitlRecord_status_idx" to table: "HitlRecord"
CREATE INDEX "HitlRecord_status_idx" ON "public"."HitlRecord" ("status");
-- Create "ReviewRecord" table
CREATE TABLE "public"."ReviewRecord" (
  "id" text NOT NULL,
  "planName" text NOT NULL,
  "type" "public"."ReviewType" NOT NULL DEFAULT 'PLAN_REVIEW',
  "reviewPath" text NULL,
  "p0Count" integer NOT NULL DEFAULT 0,
  "p1Count" integer NOT NULL DEFAULT 0,
  "backflowRate" integer NOT NULL DEFAULT 0,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "ReviewRecord_planName_fkey" FOREIGN KEY ("planName") REFERENCES "public"."PlanRecord" ("planName") ON UPDATE CASCADE ON DELETE CASCADE
);
-- Create index "ReviewRecord_planName_idx" to table: "ReviewRecord"
CREATE INDEX "ReviewRecord_planName_idx" ON "public"."ReviewRecord" ("planName");
-- Create index "ReviewRecord_type_idx" to table: "ReviewRecord"
CREATE INDEX "ReviewRecord_type_idx" ON "public"."ReviewRecord" ("type");
