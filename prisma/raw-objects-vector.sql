-- 向量层登记段（条件拼接：仅当目标库 pg_available_extensions 含 vector 时由 db-ensure 追加）
--
-- 与 raw-objects.sql 同理：向量表/扩展无法被 Prisma schema 表达，必须并入期望态，
-- 否则声明式 diff 会生成 DROP TABLE add_memory_vector / DROP EXTENSION vector。
-- 目标库没有 pgvector 时不追加本段 —— 期望态不含向量对象，也不会去 CREATE 它们，
-- 记忆检索按 fts-only 合法降级（见 docs/knowledge/02-规范/《Agent Memory 退化与能力矩阵》）。

-- 同理：CREATE EXTENSION vector 由迁移 20260913090000_agent_memory_vector.sql 负责，
-- 本段只登记 schema 对象（表 + 索引），避免期望态被 Atlas 免费版拒绝。
CREATE TABLE IF NOT EXISTS "add_memory_vector" (
  "memory_id" text PRIMARY KEY,
  "model" text NOT NULL,
  "dim" integer NOT NULL,
  "embedding" vector NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "add_memory_vector_model_idx" ON "add_memory_vector" ("model");
