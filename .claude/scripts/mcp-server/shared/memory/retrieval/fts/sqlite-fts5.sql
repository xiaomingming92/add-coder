-- Agent Memory FTS 原生层（SQLite 后端）
-- Plan §8.3 + §17-3 定案：FTS5 trigram 分词器（CJK 友好，≥3 字符 n-gram 匹配；
-- 短于 3 字符的查询由 adapter 层回退 LIKE —— 见 retrieval/fts/sqlite.ts）
--
-- 说明：AddMemory 主键为 cuid 字符串，无法使用 FTS5 external-content 模式
-- （其要求 INTEGER rowid），故采用独立 FTS 表 + 触发器同步。
-- 幂等：全部 IF NOT EXISTS，可重复应用。

CREATE VIRTUAL TABLE IF NOT EXISTS add_memory_fts USING fts5(
  memory_id UNINDEXED,
  topic,
  content,
  tokenize = 'trigram'
);

CREATE TRIGGER IF NOT EXISTS add_memory_fts_ai AFTER INSERT ON "AddMemory" BEGIN
  INSERT INTO add_memory_fts(memory_id, topic, content)
  VALUES (new.id, new.topic, new.content);
END;

CREATE TRIGGER IF NOT EXISTS add_memory_fts_au AFTER UPDATE ON "AddMemory" BEGIN
  DELETE FROM add_memory_fts WHERE memory_id = old.id;
  INSERT INTO add_memory_fts(memory_id, topic, content)
  VALUES (new.id, new.topic, new.content);
END;

CREATE TRIGGER IF NOT EXISTS add_memory_fts_ad AFTER DELETE ON "AddMemory" BEGIN
  DELETE FROM add_memory_fts WHERE memory_id = old.id;
END;
