-- Agent Memory FTS 原生层（Plan §8.2，§17-3 定案：PG 用 pg_trgm 支持 CJK）
-- 注意：本 migration 不在 Prisma schema 表达范围内，由后端 adapter 原生管理
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS "AddMemory_topic_trgm_idx" ON "public"."AddMemory" USING GIN ("topic" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "AddMemory_content_trgm_idx" ON "public"."AddMemory" USING GIN ("content" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "AddMemoryEvidence_excerpt_trgm_idx" ON "public"."AddMemoryEvidence" USING GIN ("excerpt" gin_trgm_ops);
