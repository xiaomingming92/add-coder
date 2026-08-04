-- AddForeignKey (幂等：表不存在或约束已存在时跳过，可安全重复执行)
DO $$
BEGIN
  IF to_regclass('"HitlRecord"') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'HitlRecord_planName_fkey'
     ) THEN
    ALTER TABLE "HitlRecord" ADD CONSTRAINT "HitlRecord_planName_fkey"
      FOREIGN KEY ("planName") REFERENCES "PlanRecord"("planName")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
