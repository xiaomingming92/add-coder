-- RuntimeContextKey + scoped lifecycle + Linux-style NOTIFY prerequisites.
-- Backfill policy: Plan scope comes from its persisted adapter path. Ambiguous legacy
-- rows abort the migration; they are never guessed from whichever IDE runs first.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE "public"."PlanLifecycleStatus" AS ENUM (
  'DRAFT', 'ACTIVE', 'BLOCKED', 'REJECTED', 'CLOSED', 'ABANDONED'
);
CREATE TYPE "public"."CollaborationBindingRole" AS ENUM ('MASTER', 'MEMBER');

-- 1. PlanRecord is the parent scope authority. Keep the old planName unique index
-- until every legacy child foreign key has moved to the composite identity.
ALTER TABLE "public"."PlanRecord"
  ADD COLUMN "projectKey" text NOT NULL DEFAULT 'legacy-unknown',
  ADD COLUMN "adapterKey" text NOT NULL DEFAULT 'legacy-unknown',
  ADD COLUMN "lifecycle" "public"."PlanLifecycleStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "revision" integer NOT NULL DEFAULT 0;

UPDATE "public"."PlanRecord"
SET "adapterKey" = CASE
  WHEN "planPath" ~ '(^|/)\.add/' THEN 'add'
  WHEN "planPath" ~ '(^|/)\.claude/' THEN 'claude'
  WHEN "planPath" ~ '(^|/)\.codex/' THEN 'codex'
  WHEN "planPath" ~ '(^|/)\.qoder/' THEN 'qoder'
  WHEN "planPath" ~ '(^|/)\.trae/' THEN 'trae'
  WHEN "planPath" ~ '(^|/)\.vscode/' THEN 'vscode'
  ELSE 'legacy-unknown'
END;

WITH absolute_plan AS (
  SELECT
    "id",
    regexp_replace(
      "planPath",
      '/\.(add|claude|codex|qoder|trae|vscode)/(plans|reviews|specs)/.*$',
      ''
    ) AS project_root
  FROM "public"."PlanRecord"
  WHERE "planPath" LIKE '/%'
    AND "adapterKey" <> 'legacy-unknown'
)
UPDATE "public"."PlanRecord" AS plan
SET "projectKey" = encode(
  digest(
    convert_to('add-project', 'UTF8') || decode('00', 'hex') || convert_to(source.project_root, 'UTF8'),
    'sha256'
  ),
  'hex'
)
FROM absolute_plan AS source
WHERE plan."id" = source."id";

-- A legacy relative path is accepted only when the DB contains one unambiguous
-- absolute project scope. Multi-project ambiguity fails closed below.
WITH single_project AS (
  SELECT min("projectKey") AS "projectKey"
  FROM "public"."PlanRecord"
  WHERE "projectKey" <> 'legacy-unknown'
  HAVING count(DISTINCT "projectKey") = 1
)
UPDATE "public"."PlanRecord" AS plan
SET "projectKey" = source."projectKey"
FROM single_project AS source
WHERE plan."projectKey" = 'legacy-unknown'
  AND plan."adapterKey" <> 'legacy-unknown';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "public"."PlanRecord"
    WHERE "projectKey" = 'legacy-unknown' OR "adapterKey" = 'legacy-unknown'
  ) THEN
    RAISE EXCEPTION 'runtime scope migration aborted: ambiguous PlanRecord path';
  END IF;
END
$$;

UPDATE "public"."PlanRecord" AS plan
SET "lifecycle" = CASE latest."status"
  WHEN 'TONGYI' THEN 'ACTIVE'::"public"."PlanLifecycleStatus"
  WHEN 'BOHUI' THEN 'REJECTED'::"public"."PlanLifecycleStatus"
  ELSE 'DRAFT'::"public"."PlanLifecycleStatus"
END
FROM (
  SELECT DISTINCT ON ("planName") "planName", "status"
  FROM "public"."HitlRecord"
  WHERE "type" = 'PLAN'
  ORDER BY "planName", "round" DESC
) AS latest
WHERE plan."planName" = latest."planName";

CREATE UNIQUE INDEX "PlanRecord_projectKey_adapterKey_planName_key"
  ON "public"."PlanRecord" ("projectKey", "adapterKey", "planName");
CREATE INDEX "PlanRecord_projectKey_adapterKey_lifecycle_idx"
  ON "public"."PlanRecord" ("projectKey", "adapterKey", "lifecycle");

-- 2. Child governance rows inherit the exact parent scope before FK replacement.
ALTER TABLE "public"."HitlRecord"
  ADD COLUMN "projectKey" text NOT NULL DEFAULT 'legacy-unknown',
  ADD COLUMN "adapterKey" text NOT NULL DEFAULT 'legacy-unknown';
UPDATE "public"."HitlRecord" AS child
SET "projectKey" = parent."projectKey", "adapterKey" = parent."adapterKey"
FROM "public"."PlanRecord" AS parent
WHERE child."planName" = parent."planName";
ALTER TABLE "public"."HitlRecord" DROP CONSTRAINT "HitlRecord_planName_fkey";
DROP INDEX "public"."HitlRecord_planName_idx";
DROP INDEX "public"."HitlRecord_planName_round_key";
ALTER TABLE "public"."HitlRecord"
  ADD CONSTRAINT "HitlRecord_projectKey_adapterKey_planName_fkey"
  FOREIGN KEY ("projectKey", "adapterKey", "planName")
  REFERENCES "public"."PlanRecord" ("projectKey", "adapterKey", "planName")
  ON UPDATE CASCADE ON DELETE CASCADE;
CREATE INDEX "HitlRecord_projectKey_adapterKey_planName_idx"
  ON "public"."HitlRecord" ("projectKey", "adapterKey", "planName");
CREATE UNIQUE INDEX "HitlRecord_projectKey_adapterKey_planName_type_round_key"
  ON "public"."HitlRecord" ("projectKey", "adapterKey", "planName", "type", "round");

ALTER TABLE "public"."ReviewRecord"
  ADD COLUMN "projectKey" text NOT NULL DEFAULT 'legacy-unknown',
  ADD COLUMN "adapterKey" text NOT NULL DEFAULT 'legacy-unknown';
UPDATE "public"."ReviewRecord" AS child
SET "projectKey" = parent."projectKey", "adapterKey" = parent."adapterKey"
FROM "public"."PlanRecord" AS parent
WHERE child."planName" = parent."planName";
ALTER TABLE "public"."ReviewRecord" DROP CONSTRAINT "ReviewRecord_planName_fkey";
DROP INDEX "public"."ReviewRecord_planName_idx";
ALTER TABLE "public"."ReviewRecord"
  ADD CONSTRAINT "ReviewRecord_projectKey_adapterKey_planName_fkey"
  FOREIGN KEY ("projectKey", "adapterKey", "planName")
  REFERENCES "public"."PlanRecord" ("projectKey", "adapterKey", "planName")
  ON UPDATE CASCADE ON DELETE CASCADE;
CREATE INDEX "ReviewRecord_projectKey_adapterKey_planName_idx"
  ON "public"."ReviewRecord" ("projectKey", "adapterKey", "planName");

-- 3. Collaboration contracts retain explicit cross-adapter bindings; no adapter
-- gains implicit access merely by sharing projectKey or planName.
ALTER TABLE "public"."CollabContract"
  ADD COLUMN "projectKey" text NOT NULL DEFAULT 'legacy-unknown',
  ADD COLUMN "ownerAdapterKey" text NOT NULL DEFAULT 'legacy-unknown',
  ADD COLUMN "masterProjectKey" text NOT NULL DEFAULT 'legacy-unknown',
  ADD COLUMN "masterAdapterKey" text NOT NULL DEFAULT 'legacy-unknown';
UPDATE "public"."CollabContract" AS contract
SET
  "projectKey" = master."projectKey",
  "ownerAdapterKey" = master."adapterKey",
  "masterProjectKey" = master."projectKey",
  "masterAdapterKey" = master."adapterKey"
FROM "public"."PlanRecord" AS master
WHERE contract."masterPlanName" = master."planName";
ALTER TABLE "public"."CollabContract" DROP CONSTRAINT "CollabContract_masterPlanName_fkey";
DROP INDEX "public"."CollabContract_contractName_key";
DROP INDEX "public"."CollabContract_masterPlanName_idx";
DROP INDEX "public"."CollabContract_masterPlanName_key";
ALTER TABLE "public"."CollabContract"
  ADD CONSTRAINT "CollabContract_masterProjectKey_masterAdapterKey_masterPla_fkey"
  FOREIGN KEY ("masterProjectKey", "masterAdapterKey", "masterPlanName")
  REFERENCES "public"."PlanRecord" ("projectKey", "adapterKey", "planName")
  ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE UNIQUE INDEX "CollabContract_masterProjectKey_masterAdapterKey_masterPlan_key"
  ON "public"."CollabContract" ("masterProjectKey", "masterAdapterKey", "masterPlanName");
CREATE UNIQUE INDEX "CollabContract_projectKey_contractName_key"
  ON "public"."CollabContract" ("projectKey", "contractName");
CREATE INDEX "CollabContract_projectKey_ownerAdapterKey_idx"
  ON "public"."CollabContract" ("projectKey", "ownerAdapterKey");

CREATE TABLE "public"."CollaborationPlanBinding" (
  "id" text NOT NULL,
  "contractId" text NOT NULL,
  "projectKey" text NOT NULL,
  "adapterKey" text NOT NULL,
  "planName" text NOT NULL,
  "role" "public"."CollaborationBindingRole" NOT NULL DEFAULT 'MEMBER',
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id"),
  CONSTRAINT "CollaborationPlanBinding_contractId_fkey"
    FOREIGN KEY ("contractId") REFERENCES "public"."CollabContract" ("id")
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "CollaborationPlanBinding_projectKey_adapterKey_planName_fkey"
    FOREIGN KEY ("projectKey", "adapterKey", "planName")
    REFERENCES "public"."PlanRecord" ("projectKey", "adapterKey", "planName")
    ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE UNIQUE INDEX "CollaborationPlanBinding_contractId_projectKey_adapterKey_p_key"
  ON "public"."CollaborationPlanBinding" ("contractId", "projectKey", "adapterKey", "planName");
CREATE INDEX "CollaborationPlanBinding_projectKey_adapterKey_planName_idx"
  ON "public"."CollaborationPlanBinding" ("projectKey", "adapterKey", "planName");

-- The legacy global identity can be removed only after all dependent FKs moved.
DROP INDEX "public"."PlanRecord_planName_key";

-- 4. Audit rows gain producer scope and an actual idempotency key. Old rows use id
-- as the immutable operation key; only uniquely plan-bound dev operations inherit
-- a runtime scope. Unbound legacy audit stays fail-closed as legacy-unknown.
ALTER TABLE "public"."DevOperation"
  ADD COLUMN "projectKey" text NOT NULL DEFAULT 'legacy-unknown',
  ADD COLUMN "producerAdapterKey" text NOT NULL DEFAULT 'legacy-unknown',
  ADD COLUMN "contextId" text NOT NULL DEFAULT 'legacy-unknown',
  ADD COLUMN "toolName" text NOT NULL DEFAULT 'record_dev_operation',
  ADD COLUMN "operationKey" text;
UPDATE "public"."DevOperation" SET "operationKey" = "id";

WITH unique_scope AS (
  SELECT
    operation."id",
    min(plan."projectKey") AS "projectKey",
    min(plan."adapterKey") AS "adapterKey"
  FROM "public"."DevOperation" AS operation
  JOIN "public"."PlanRecord" AS plan ON plan."planKeyword" = operation."planKeyword"
  GROUP BY operation."id"
  HAVING count(DISTINCT plan."projectKey" || ':' || plan."adapterKey") = 1
)
UPDATE "public"."DevOperation" AS operation
SET
  "projectKey" = scope."projectKey",
  "producerAdapterKey" = scope."adapterKey",
  "contextId" = scope."projectKey" || ':' || scope."adapterKey"
FROM unique_scope AS scope
WHERE operation."id" = scope."id";

ALTER TABLE "public"."DevOperation" ALTER COLUMN "operationKey" SET NOT NULL;
CREATE INDEX "DevOperation_projectKey_producerAdapterKey_planKeyword_idx"
  ON "public"."DevOperation" ("projectKey", "producerAdapterKey", "planKeyword");
CREATE UNIQUE INDEX "DevOperation_projectKey_producerAdapterKey_toolName_operati_key"
  ON "public"."DevOperation" ("projectKey", "producerAdapterKey", "toolName", "operationKey");

ALTER TABLE "public"."AuditLog"
  ADD COLUMN "projectKey" text NOT NULL DEFAULT 'legacy-unknown',
  ADD COLUMN "producerAdapterKey" text NOT NULL DEFAULT 'legacy-unknown',
  ADD COLUMN "contextId" text NOT NULL DEFAULT 'legacy-unknown';
CREATE INDEX "AuditLog_projectKey_producerAdapterKey_contextId_idx"
  ON "public"."AuditLog" ("projectKey", "producerAdapterKey", "contextId");
