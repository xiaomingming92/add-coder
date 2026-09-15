-- raw 对象登记段（db-ensure 期望态拼接源，非迁移文件）
--
-- 为什么需要：pg_trgm 的 GIN 索引无法被 Prisma schema 表达，声明式 diff 会把它们判为
-- 「多余对象」并生成 DROP INDEX（runtime review 发现 #2 已实证：三个索引被静默删除）。
-- db-ensure 生成 baseline（期望态）时会把本文件追加进去，使期望态包含这些对象，
-- 从而 diff 不再生成删除语句。新增任何「schema 表达不了的 DB 对象」都必须登记到这里。

-- 注意：扩展本身（pg_trgm）不写在本段 —— Atlas 免费版不接受期望态中的 CREATE EXTENSION
-- （需登录 Pro）。扩展由迁移与开发库环境保证：主库见 20260819080000_add_agent_memory_fts.sql，
-- dev/shadow 库在环境初始化时装到 template1 以被沙箱库继承（见能力矩阵 §四）。
CREATE INDEX IF NOT EXISTS "AddMemory_topic_trgm_idx" ON "public"."AddMemory" USING GIN ("topic" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "AddMemory_content_trgm_idx" ON "public"."AddMemory" USING GIN ("content" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "AddMemoryEvidence_excerpt_trgm_idx" ON "public"."AddMemoryEvidence" USING GIN ("excerpt" gin_trgm_ops);
