-- Agent Memory 向量层（Plan §3.3 / 轮 3 Task 3.4）
--
-- 设计定案：Prisma schema 不表达向量列，向量对象由原生 DDL 管理。
-- 本迁移做「环境自适应交付」：目标 PG 装有 pgvector 时建表建索引；未安装时打印 NOTICE
-- 并成功返回（no-op），避免 db:ensure / migrate apply 在无扩展环境硬失败。
--
-- 为什么必须自适应：本仓库主库（add-coder-postgres）当前未安装 pgvector
-- （pg_available_extensions 仅有 pg_trgm），无条件 CREATE EXTENSION vector 会让
-- 所有开发者的 db:ensure 直接失败；而已装扩展的环境应当自动获得向量能力。
--
-- 与 DROP 守卫的关系：本迁移创建的对象无法被 Prisma schema 表达，声明式 diff 会把它判为
-- 「多余对象」并生成 DROP；db-ensure 第 ⑥ 步已加 DROP 守卫，此类 diff 一律拒绝应用。
-- 词法层运维入口：npx tsx scripts/memory/reindex.ts probe|rebuild
-- 向量层能力与降级契约：docs/knowledge/02-规范/《Agent Memory 退化与能力矩阵》.md

DO $$
DECLARE
  v_has_extension boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector') INTO v_has_extension;

  IF NOT v_has_extension THEN
    RAISE NOTICE '[agent_memory_vector] pgvector 扩展不可用，跳过向量层（记忆检索按 fts-only 合法降级）';
    RETURN;
  END IF;

  CREATE EXTENSION IF NOT EXISTS vector;

  -- 维度真源：向量维度由 provider 元数据决定，应用层写入前校验（ERR_DIMENSION_MISMATCH）。
  -- 此处列类型不带维度；定长列与 HNSW 索引由适配器 ensureSchema() 按实际 provider 维度创建。
  CREATE TABLE IF NOT EXISTS "add_memory_vector" (
    "memory_id" text PRIMARY KEY,
    "model" text NOT NULL,
    "dim" integer NOT NULL,
    "embedding" vector NOT NULL,
    "updated_at" timestamptz NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS "add_memory_vector_model_idx" ON "add_memory_vector" ("model");

  RAISE NOTICE '[agent_memory_vector] 向量层已就绪（表 add_memory_vector）';
END $$;
