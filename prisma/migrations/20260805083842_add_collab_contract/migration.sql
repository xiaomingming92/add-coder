-- CreateEnum（幂等：类型已存在则跳过）
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ContractRole') THEN
    CREATE TYPE "ContractRole" AS ENUM ('MASTER', 'SUB');
  END IF;
END $$;

-- AlterEnum（幂等：枚举值已存在则跳过）
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'HitlType' AND e.enumlabel = 'COLLAB_CONTRACT'
  ) THEN
    ALTER TYPE "HitlType" ADD VALUE 'COLLAB_CONTRACT';
  END IF;
END $$;

-- AlterTable（幂等：列不存在才新增）
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'PlanRecord' AND column_name = 'contractName') THEN
    ALTER TABLE "PlanRecord" ADD COLUMN "contractName" TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'PlanRecord' AND column_name = 'contractRole') THEN
    ALTER TABLE "PlanRecord" ADD COLUMN "contractRole" "ContractRole";
  END IF;
END $$;

-- CreateTable（幂等）
CREATE TABLE IF NOT EXISTS "CollabContract" (
    "id" TEXT NOT NULL,
    "contractName" TEXT NOT NULL,
    "contractPath" TEXT NOT NULL,
    "masterPlanName" TEXT NOT NULL,
    "participants" JSONB NOT NULL,
    "abilityMatrix" JSONB,
    "stages" JSONB NOT NULL,
    "dependencyGraph" TEXT,
    "fileBoundaries" JSONB NOT NULL,
    "completionCriteria" JSONB,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollabContract_pkey" PRIMARY KEY ("id")
);

-- CreateIndex（幂等）
CREATE UNIQUE INDEX IF NOT EXISTS "CollabContract_contractName_key" ON "CollabContract"("contractName");

-- CreateIndex（幂等）
CREATE UNIQUE INDEX IF NOT EXISTS "CollabContract_masterPlanName_key" ON "CollabContract"("masterPlanName");

-- CreateIndex（幂等）
CREATE INDEX IF NOT EXISTS "CollabContract_masterPlanName_idx" ON "CollabContract"("masterPlanName");

-- CreateIndex（幂等）
CREATE INDEX IF NOT EXISTS "PlanRecord_contractName_idx" ON "PlanRecord"("contractName");

-- AddForeignKey（幂等：约束已存在则跳过）
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CollabContract_masterPlanName_fkey') THEN
    ALTER TABLE "CollabContract" ADD CONSTRAINT "CollabContract_masterPlanName_fkey" FOREIGN KEY ("masterPlanName") REFERENCES "PlanRecord"("planName") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
