-- AlterTable: PlanRecord 新增 DPS 四维评分存储（幂等）
ALTER TABLE "PlanRecord" ADD COLUMN IF NOT EXISTS "dpsSemScore"    INTEGER;
ALTER TABLE "PlanRecord" ADD COLUMN IF NOT EXISTS "dpsEntropyScore" INTEGER;
ALTER TABLE "PlanRecord" ADD COLUMN IF NOT EXISTS "dpsCpmScore"    INTEGER;
ALTER TABLE "PlanRecord" ADD COLUMN IF NOT EXISTS "dpsStructScore" INTEGER;
ALTER TABLE "PlanRecord" ADD COLUMN IF NOT EXISTS "dpsComposite"   INTEGER;
