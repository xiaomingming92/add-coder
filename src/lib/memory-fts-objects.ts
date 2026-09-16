// memory-fts-objects.ts — 记忆 FTS 期望态清单与 SQL 渲染（库层 · 单一真源）
//
// 为什么在库层：同一份期望态被三处消费——init（src/cli/commands/init.ts → memory-expected-state）、
// db-ensure.sh（消费生成物 .sql）、memory:reindex CLI。清单若散在多处即双源漂移，
// 而本 Plan 的缺陷本体正是「实现存在但无人按同一份期望态接线」。
//
// 分层约束（命令模式 + 函数式）：
//  - 命令层（src/cli/commands/*.ts）只编排与输出，不含清单/DDL/判定规则；
//  - 策略层（src/caijuehub/strategies/*.strategy.ts）由 rules TOML 生成，禁止手写；
//  - 故清单与渲染落库层：纯数据 + 纯函数；脚本层（scripts/memory/reindex.ts）只做再导出与 CLI 外壳。
//
// 生成物：templates/core/scripts/mcp-server/shared/memory/retrieval/fts/sqlite-fts5.sql
// 由 scripts/memory/gen-sqlite-fts-sql.ts 调用本文件的 renderSqliteFtsSql() 生成（禁止手改）。

export type FtsBackend = "postgres" | "sqlite"
export type FtsObjectKind = "extension" | "index" | "table" | "trigger"

export interface FtsObjectSpec {
  name: string
  kind: FtsObjectKind
  /** 幂等 DDL（重建用，全部 IF NOT EXISTS） */
  ddl: string
}

/** Postgres：pg_trgm 扩展 + 三个 trigram GIN 索引（与 20260819080000_add_agent_memory_fts.sql 对齐） */
export const PG_FTS_OBJECTS: readonly FtsObjectSpec[] = [
  { name: "pg_trgm", kind: "extension", ddl: `CREATE EXTENSION IF NOT EXISTS pg_trgm;` },
  {
    name: "AddMemory_topic_trgm_idx", kind: "index",
    ddl: `CREATE INDEX IF NOT EXISTS "AddMemory_topic_trgm_idx" ON "public"."AddMemory" USING GIN ("topic" gin_trgm_ops);`,
  },
  {
    name: "AddMemory_content_trgm_idx", kind: "index",
    ddl: `CREATE INDEX IF NOT EXISTS "AddMemory_content_trgm_idx" ON "public"."AddMemory" USING GIN ("content" gin_trgm_ops);`,
  },
  {
    name: "AddMemoryEvidence_excerpt_trgm_idx", kind: "index",
    ddl: `CREATE INDEX IF NOT EXISTS "AddMemoryEvidence_excerpt_trgm_idx" ON "public"."AddMemoryEvidence" USING GIN ("excerpt" gin_trgm_ops);`,
  },
] as const

/** SQLite：FTS5 独立表 + 三个同步触发器（与 retrieval/fts/sqlite-fts5.sql 同源） */
export const SQLITE_FTS_OBJECTS: readonly FtsObjectSpec[] = [
  {
    name: "add_memory_fts", kind: "table",
    ddl: `CREATE VIRTUAL TABLE IF NOT EXISTS add_memory_fts USING fts5(memory_id UNINDEXED, topic, content, tokenize = 'trigram');`,
  },
  {
    name: "add_memory_fts_ai", kind: "trigger",
    ddl: `CREATE TRIGGER IF NOT EXISTS add_memory_fts_ai AFTER INSERT ON "AddMemory" BEGIN INSERT INTO add_memory_fts(memory_id, topic, content) VALUES (new.id, new.topic, new.content); END;`,
  },
  {
    name: "add_memory_fts_au", kind: "trigger",
    ddl: `CREATE TRIGGER IF NOT EXISTS add_memory_fts_au AFTER UPDATE ON "AddMemory" BEGIN DELETE FROM add_memory_fts WHERE memory_id = old.id; INSERT INTO add_memory_fts(memory_id, topic, content) VALUES (new.id, new.topic, new.content); END;`,
  },
  {
    name: "add_memory_fts_ad", kind: "trigger",
    ddl: `CREATE TRIGGER IF NOT EXISTS add_memory_fts_ad AFTER DELETE ON "AddMemory" BEGIN DELETE FROM add_memory_fts WHERE memory_id = old.id; END;`,
  },
] as const

/** 期望态对象清单（init / db-ensure / CLI 三处消费共用同一实现） */
export function resolveFtsObjects(backend: FtsBackend): readonly FtsObjectSpec[] {
  return backend === "postgres" ? PG_FTS_OBJECTS : SQLITE_FTS_OBJECTS
}

/** @deprecated 使用 resolveFtsObjects（保留别名以免破坏既有调用方） */
export const objectsFor = resolveFtsObjects

export function detectBackend(databaseUrl: string): FtsBackend {
  const url = (databaseUrl ?? "").trim().toLowerCase()
  if (url.startsWith("postgres://") || url.startsWith("postgresql://")) return "postgres"
  if (url.startsWith("sqlite:") || url.startsWith("file:") || url.endsWith(".db") || url.endsWith(".sqlite")) {
    return "sqlite"
  }
  throw new Error(`无法识别的 DATABASE_URL 后端: ${databaseUrl}`)
}

// 应用期望态（幂等）：对 existing 中不存在的对象依次执行 run(ddl)。
// 纯逻辑（不绑定 querier），供 CLI（querier 包装）与 init/db-ensure 复用。
// 失败语义：run 抛错即向上抛，由调用方决定 fail-open（init 告警不阻断）还是非零退出（CLI --apply）。
export async function applyObjects(
  backend: FtsBackend,
  run: (ddl: string) => Promise<void>,
  existing: ReadonlySet<string>,
): Promise<{ missing: string[]; applied: string[] }> {
  const specs = resolveFtsObjects(backend)
  const missingSpecs = specs.filter((s) => !existing.has(s.name))
  const applied: string[] = []
  for (const spec of missingSpecs) {
    await run(spec.ddl)
    applied.push(spec.name)
  }
  return { missing: missingSpecs.map((s) => s.name), applied }
}

// SQLite 原生层 SQL 渲染（唯一真源）：
// retrieval/fts/sqlite-fts5.sql 由本函数生成（scripts/memory/gen-sqlite-fts-sql.ts），
// 用例 tests/memory/reindex.test.ts 断言两者逐字一致——新增/修改 DDL 只改上面的常量，
// 不再出现「TS 与 .sql 各写一份」的双源漂移（ADD-12）。
export function renderSqliteFtsSql(): string {
  const header = [
    "-- 本文件由 scripts/memory/gen-sqlite-fts-sql.ts 生成（真源：src/lib/memory-fts-objects.ts 的 SQLITE_FTS_OBJECTS）",
    "-- 请勿手工编辑；新增/修改 DDL 请改真源后重跑生成脚本。",
    "--",
    "-- Agent Memory FTS 原生层（SQLite 后端）",
    "-- Plan §8.3 + §17-3 定案：FTS5 trigram 分词器（CJK 友好，≥3 字符 n-gram 匹配；",
    "-- 短于 3 字符的查询由 adapter 层回退 LIKE —— 见 retrieval/fts/sqlite.ts）",
    "--",
    "-- 说明：AddMemory 主键为 cuid 字符串，无法使用 FTS5 external-content 模式",
    "-- （其要求 INTEGER rowid），故采用独立 FTS 表 + 触发器同步。",
    "-- 幂等：全部 IF NOT EXISTS，可重复应用。",
    "",
  ].join("\n")
  const body = SQLITE_FTS_OBJECTS.map((s) => `${s.ddl}`).join("\n\n")
  return `${header}\n${body}\n`
}

// PG 侧「缺失即报错」探测 SQL（服务器端断言，故无需客户端驱动）：
// prisma db execute 不返回结果集，只能看退出码/错误文本；因此把「哪些对象缺失」
// 编码进一次 RAISE EXCEPTION——缺失名单出现在 stderr 的 marker 之后。
export const PG_MISSING_MARKER = "ADDCODER_FTS_MISSING:"

export function renderPgProbeSql(expected: readonly FtsObjectSpec[]): string {
  const values = expected
    .map((s) => `    ('${s.name.replace(/'/g, "''")}', '${s.kind === "extension" ? "extension" : "relation"}')`)
    .join(",\n")
  return `-- 由 add-coder memory:reindex 生成（真源：src/lib/memory-fts-objects.ts 的 PG_FTS_OBJECTS）
DO $$
DECLARE missing text;
BEGIN
  SELECT string_agg(n.name, ',') INTO missing
  FROM (VALUES
${values}
  ) AS n(name, kind)
  WHERE NOT (
    (n.kind = 'extension' AND EXISTS (SELECT 1 FROM pg_extension e WHERE e.extname = n.name))
    OR (n.kind = 'relation' AND EXISTS (SELECT 1 FROM pg_indexes i WHERE i.indexname = n.name))
  );
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION '${PG_MISSING_MARKER} %', missing;
  END IF;
END $$;
`
}

/** 从 prisma db execute 的 stderr 解析缺失对象名（无 marker = 无缺失） */
export function parsePgProbeMissing(stderr: string, expected: readonly FtsObjectSpec[]): string[] {
  const at = (stderr ?? "").indexOf(PG_MISSING_MARKER)
  if (at < 0) return []
  const tail = stderr.slice(at + PG_MISSING_MARKER.length)
  const known = new Set(expected.map((s) => s.name))
  return tail
    .split(/[\s"',\n]+/)
    .map((s) => s.trim())
    .filter((s) => known.has(s))
}
