-- 记忆检索展开列 + bigram 分词 FTS 主通道（Plan add-coder-memory-cjk-bigram-baseline 轮 2 / Task 2.3.2）
--
-- 为什么是表达式索引而不是 trigram：`pg_trgm` 的 trigram 窗口 = 3 字，2 字中文查询（"端口"）连 token 都生成不出；
-- 且 `to_tsvector('simple', …)` 对中文不分词。改为写入期产出 `searchText`（jieba 词级 / bigram token 串），
-- 索引建在 `to_tsvector('simple', "searchText")` 上——按空格切 token、**不依赖任何扩展**。
-- 原有三个 `gin_trgm_ops` 索引保留为**补充通道**（子串/模糊召回），不再充当基线。
-- 幂等：列与索引均 IF NOT EXISTS，可重放。
ALTER TABLE "AddMemory" ADD COLUMN IF NOT EXISTS "searchText" TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS "AddMemory_searchText_tsv_idx"
  ON "public"."AddMemory" USING GIN (to_tsvector('simple', "searchText"));
