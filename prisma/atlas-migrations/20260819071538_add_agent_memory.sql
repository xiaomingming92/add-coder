-- Create enum type "MemoryKind"
CREATE TYPE "public"."MemoryKind" AS ENUM ('DECISION', 'CONSTRAINT', 'PITFALL', 'FAILURE', 'LESSON', 'PATTERN', 'CONVENTION', 'FACT', 'HANDOFF_DIGEST', 'HYPOTHESIS');
-- Create enum type "MemoryStatus"
CREATE TYPE "public"."MemoryStatus" AS ENUM ('CANDIDATE', 'PENDING', 'ACTIVE', 'STALE', 'SUPERSEDED', 'REJECTED', 'ARCHIVED');
-- Create enum type "MemoryScopeType"
CREATE TYPE "public"."MemoryScopeType" AS ENUM ('ORGANIZATION', 'REPOSITORY', 'BRANCH', 'MODULE', 'PATH', 'SYMBOL', 'PLAN', 'SPEC');
-- Create enum type "MemorySourceType"
CREATE TYPE "public"."MemorySourceType" AS ENUM ('PLAN', 'SPEC', 'DPS_GATE', 'DEV_OPERATION', 'RAHS_GATE', 'HANDOFF', 'MANUAL', 'IMPORT');
-- Create enum type "EmbeddingState"
CREATE TYPE "public"."EmbeddingState" AS ENUM ('DISABLED', 'PENDING', 'READY', 'FAILED', 'STALE');
-- Create enum type "RecallOutcome"
CREATE TYPE "public"."RecallOutcome" AS ENUM ('UNKNOWN', 'USED', 'USEFUL', 'IRRELEVANT', 'OUTDATED', 'CONTRADICTED', 'HARMFUL');
-- Create "AddMemoryEvidence" table
CREATE TABLE "public"."AddMemoryEvidence" (
  "id" text NOT NULL,
  "repositoryRef" text NOT NULL,
  "sourceType" "public"."MemorySourceType" NOT NULL,
  "sourceRef" text NOT NULL,
  "planKeyword" text NULL,
  "excerpt" text NOT NULL,
  "contentHash" text NOT NULL,
  "occurredAt" timestamp(3) NULL,
  "metadata" jsonb NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id")
);
-- Create index "AddMemoryEvidence_planKeyword_idx" to table: "AddMemoryEvidence"
CREATE INDEX "AddMemoryEvidence_planKeyword_idx" ON "public"."AddMemoryEvidence" ("planKeyword");
-- Create index "AddMemoryEvidence_repositoryRef_sourceType_sourceRef_conten_key" to table: "AddMemoryEvidence"
CREATE UNIQUE INDEX "AddMemoryEvidence_repositoryRef_sourceType_sourceRef_conten_key" ON "public"."AddMemoryEvidence" ("repositoryRef", "sourceType", "sourceRef", "contentHash");
-- Create index "AddMemoryEvidence_repositoryRef_sourceType_sourceRef_idx" to table: "AddMemoryEvidence"
CREATE INDEX "AddMemoryEvidence_repositoryRef_sourceType_sourceRef_idx" ON "public"."AddMemoryEvidence" ("repositoryRef", "sourceType", "sourceRef");
-- Create "AddMetricSnapshot" table
CREATE TABLE "public"."AddMetricSnapshot" (
  "id" text NOT NULL,
  "repositoryRef" text NOT NULL,
  "metricType" text NOT NULL,
  "value" double precision NOT NULL,
  "baseline" double precision NULL,
  "delta" double precision NULL,
  "unit" text NULL,
  "planKeyword" text NULL,
  "specRef" text NULL,
  "commitSha" text NULL,
  "sourceRef" text NOT NULL,
  "metadata" jsonb NULL,
  "measuredAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id")
);
-- Create index "AddMetricSnapshot_repositoryRef_metricType_measuredAt_idx" to table: "AddMetricSnapshot"
CREATE INDEX "AddMetricSnapshot_repositoryRef_metricType_measuredAt_idx" ON "public"."AddMetricSnapshot" ("repositoryRef", "metricType", "measuredAt");
-- Create index "AddMetricSnapshot_repositoryRef_metricType_sourceRef_key" to table: "AddMetricSnapshot"
CREATE UNIQUE INDEX "AddMetricSnapshot_repositoryRef_metricType_sourceRef_key" ON "public"."AddMetricSnapshot" ("repositoryRef", "metricType", "sourceRef");
-- Create "AddMemory" table
CREATE TABLE "public"."AddMemory" (
  "id" text NOT NULL,
  "kind" "public"."MemoryKind" NOT NULL,
  "status" "public"."MemoryStatus" NOT NULL DEFAULT 'CANDIDATE',
  "topic" text NOT NULL,
  "content" text NOT NULL,
  "summary" text NULL,
  "scopeType" "public"."MemoryScopeType" NOT NULL,
  "scopeValue" text NOT NULL,
  "repositoryRef" text NOT NULL,
  "importance" double precision NOT NULL DEFAULT 0.5,
  "confidence" double precision NOT NULL DEFAULT 0.5,
  "validFrom" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "validUntil" timestamp(3) NULL,
  "supersededById" text NULL,
  "contentHash" text NOT NULL,
  "embeddingModel" text NULL,
  "embeddingDim" integer NULL,
  "embeddingState" "public"."EmbeddingState" NOT NULL DEFAULT 'DISABLED',
  "createdBy" text NULL,
  "approvedBy" text NULL,
  "approvedAt" timestamp(3) NULL,
  "metadata" jsonb NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "AddMemory_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "public"."AddMemory" ("id") ON UPDATE CASCADE ON DELETE SET NULL
);
-- Create index "AddMemory_repositoryRef_contentHash_scopeType_scopeValue_key" to table: "AddMemory"
CREATE UNIQUE INDEX "AddMemory_repositoryRef_contentHash_scopeType_scopeValue_key" ON "public"."AddMemory" ("repositoryRef", "contentHash", "scopeType", "scopeValue");
-- Create index "AddMemory_repositoryRef_status_kind_idx" to table: "AddMemory"
CREATE INDEX "AddMemory_repositoryRef_status_kind_idx" ON "public"."AddMemory" ("repositoryRef", "status", "kind");
-- Create index "AddMemory_scopeType_scopeValue_idx" to table: "AddMemory"
CREATE INDEX "AddMemory_scopeType_scopeValue_idx" ON "public"."AddMemory" ("scopeType", "scopeValue");
-- Create index "AddMemory_status_validUntil_idx" to table: "AddMemory"
CREATE INDEX "AddMemory_status_validUntil_idx" ON "public"."AddMemory" ("status", "validUntil");
-- Create index "AddMemory_supersededById_idx" to table: "AddMemory"
CREATE INDEX "AddMemory_supersededById_idx" ON "public"."AddMemory" ("supersededById");
-- Create "AddMemoryEvidenceLink" table
CREATE TABLE "public"."AddMemoryEvidenceLink" (
  "memoryId" text NOT NULL,
  "evidenceId" text NOT NULL,
  "relation" text NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("memoryId", "evidenceId"),
  CONSTRAINT "AddMemoryEvidenceLink_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "public"."AddMemoryEvidence" ("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT "AddMemoryEvidenceLink_memoryId_fkey" FOREIGN KEY ("memoryId") REFERENCES "public"."AddMemory" ("id") ON UPDATE CASCADE ON DELETE RESTRICT
);
-- Create "AddMemoryRecall" table
CREATE TABLE "public"."AddMemoryRecall" (
  "id" text NOT NULL,
  "repositoryRef" text NOT NULL,
  "query" text NOT NULL,
  "stage" text NOT NULL,
  "consumerRef" text NULL,
  "scopeContext" jsonb NOT NULL,
  "candidateIds" jsonb NOT NULL,
  "selectedIds" jsonb NOT NULL,
  "scoreBreakdown" jsonb NOT NULL,
  "exclusionReasons" jsonb NULL,
  "rankingVersion" text NOT NULL,
  "tokenBudget" integer NOT NULL,
  "injectedTokens" integer NOT NULL,
  "latencyMs" integer NULL,
  "degradedMode" text NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id")
);
-- Create index "AddMemoryRecall_repositoryRef_stage_createdAt_idx" to table: "AddMemoryRecall"
CREATE INDEX "AddMemoryRecall_repositoryRef_stage_createdAt_idx" ON "public"."AddMemoryRecall" ("repositoryRef", "stage", "createdAt");
-- Create "AddMemoryRecallItem" table
CREATE TABLE "public"."AddMemoryRecallItem" (
  "recallId" text NOT NULL,
  "memoryId" text NOT NULL,
  "selected" boolean NOT NULL,
  "rank" integer NULL,
  "outcome" "public"."RecallOutcome" NOT NULL DEFAULT 'UNKNOWN',
  "feedback" text NULL,
  "updatedAt" timestamp(3) NOT NULL,
  PRIMARY KEY ("recallId", "memoryId"),
  CONSTRAINT "AddMemoryRecallItem_memoryId_fkey" FOREIGN KEY ("memoryId") REFERENCES "public"."AddMemory" ("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT "AddMemoryRecallItem_recallId_fkey" FOREIGN KEY ("recallId") REFERENCES "public"."AddMemoryRecall" ("id") ON UPDATE CASCADE ON DELETE RESTRICT
);
