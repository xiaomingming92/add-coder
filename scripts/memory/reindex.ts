/*
 * reindex.ts — Memory FTS 损坏探测与重建 CLI（Plan §3.4 轮 2 / Spec §5 §Reindex）
 *
 * 用法（工作目录 = 仓库根）：
 *   PROJECT_ROOT=$PWD MAGIC_DIR=.codex DATABASE_URL="postgresql://..." \
 *   npx tsx scripts/memory/reindex.ts [probe|rebuild]
 *
 * 设计：
 *  - 双后端（Postgres / SQLite）对象清单集中声明，探测与重建共用同一份清单（单一事实源）；
 *  - 探测只读：列出「应有但缺失」的对象，不猜测损坏类型；
 *  - 重建幂等：DDL 全部 IF NOT EXISTS，重复执行第二次即为 no-op（可重放）；
 *  - 纯逻辑与 CLI 分离：本文件导出的函数可被测试直接调用，CLI 仅在直接执行时运行。
 */
import { pathToFileURL } from "node:url"
import type { RawQuerier } from "../../templates/core/scripts/mcp-server/shared/memory/retrieval/types.js"

export type FtsBackend = "postgres" | "sqlite"
export type FtsObjectKind = "extension" | "index" | "table" | "trigger"

export interface FtsObjectSpec {
  name: string
  kind: FtsObjectKind
  /** 幂等 DDL（重建用） */
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

/** SQLite：FTS5 独立表 + 三个同步触发器（与 retrieval/fts/sqlite-fts5.sql 对齐） */
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

export interface ReindexReport {
  backend: FtsBackend
  /** 应有但缺失的对象名 */
  missing: string[]
  /** 本次实际重建的对象名（重放时为 []） */
  rebuilt: string[]
  /** 已存在的对象数 / 应有总数 */
  present: number
  total: number
  /** 完成度（0-100） */
  progress: number
}

export function detectBackend(databaseUrl: string): FtsBackend {
  const url = (databaseUrl ?? "").trim().toLowerCase()
  if (url.startsWith("postgres://") || url.startsWith("postgresql://")) return "postgres"
  if (url.startsWith("sqlite:") || url.startsWith("file:") || url.endsWith(".db") || url.endsWith(".sqlite")) {
    return "sqlite"
  }
  throw new Error(`无法识别的 DATABASE_URL 后端: ${databaseUrl}`)
}

export function objectsFor(backend: FtsBackend): readonly FtsObjectSpec[] {
  return backend === "postgres" ? PG_FTS_OBJECTS : SQLITE_FTS_OBJECTS
}

/** 探测后端当前存在哪些 FTS 对象（只读） */
export async function listExistingObjects(
  querier: RawQuerier,
  backend: FtsBackend,
): Promise<Set<string>> {
  if (backend === "postgres") {
    const rows = await querier.query<{ name: string }>(
      `SELECT indexname AS name FROM pg_indexes WHERE schemaname = 'public'
       UNION ALL
       SELECT extname AS name FROM pg_extension`,
      [],
    )
    return new Set(rows.map((r) => r.name))
  }
  const rows = await querier.query<{ name: string }>(`SELECT name FROM sqlite_master`, [])
  return new Set(rows.map((r) => r.name))
}

/** 探测：列出缺失对象与完成度（不修改任何东西） */
export async function probeFts(querier: RawQuerier, backend: FtsBackend): Promise<ReindexReport> {
  const specs = objectsFor(backend)
  const existing = await listExistingObjects(querier, backend)
  const missing = specs.filter((s) => !existing.has(s.name)).map((s) => s.name)
  const present = specs.length - missing.length
  return {
    backend,
    missing,
    rebuilt: [],
    present,
    total: specs.length,
    progress: Math.round((present / specs.length) * 100),
  }
}

/**
 * 重建：对缺失对象依次执行幂等 DDL，再复探确认。
 * 重放语义：目录健康时 rebuilt=[]、missing=[]，与首次成功后的结果一致。
 */
export async function reindex(querier: RawQuerier, backend: FtsBackend): Promise<ReindexReport> {
  const first = await probeFts(querier, backend)
  const specs = objectsFor(backend)
  const rebuilt: string[] = []

  for (const name of first.missing) {
    const spec = specs.find((s) => s.name === name)
    if (!spec) continue
    await querier.query(spec.ddl, [])
    rebuilt.push(spec.name)
  }

  const after = await probeFts(querier, backend)
  return { ...after, rebuilt }
}

async function main(): Promise<void> {
  const mode = process.argv[2] ?? "probe"
  const databaseUrl = process.env.DATABASE_URL ?? ""
  if (!databaseUrl) {
    console.error("需要环境变量 DATABASE_URL")
    process.exit(2)
  }
  const backend = detectBackend(databaseUrl)
  const { prisma } = await import("../../templates/core/scripts/mcp-server/shared/prisma.js")
  const querier: RawQuerier = {
    query: <T = Record<string, unknown>>(sql: string, params: unknown[]): Promise<T[]> =>
      (prisma.$queryRawUnsafe as unknown as (s: string, ...p: unknown[]) => Promise<unknown>)(
        sql, ...params,
      ) as Promise<T[]>,
  }
  const report = mode === "rebuild" ? await reindex(querier, backend) : await probeFts(querier, backend)
  console.log(JSON.stringify(report, null, 2))
  // 缺失对象存在时以非零码退出，便于自动化巡检（rebuild 后仍缺失说明 DDL 失败）
  process.exit(report.missing.length > 0 ? 1 : 0)
}

const invokedDirectly =
  !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (invokedDirectly) await main()
