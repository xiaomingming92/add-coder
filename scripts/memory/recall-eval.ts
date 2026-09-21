/*
 * recall-eval.ts — Agent Memory 召回评测基线
 *
 * 重放 FTS 期望态 + 标注集，跑完整 recallPipeline，输出：
 *   Recall@5 / MRR@5 / leakage（SUPERSEDED/REJECTED/ARCHIVED/过期/越界/CANDIDATE）/ 强制约束漏召回
 *
 * 阈值（**唯一真源 = 本脚本的 PASS_THRESHOLD**；文档不得另记一套数字 —— 历史文档里的 0.9188 属失效表述）：
 *   FTS-only：Recall@5 ≥ 0.70 ；Hybrid：MRR@5 ≥ 0.75 ；两者均要求 leakage = 0、mandatory miss = 0
 *
 * 后端（轮 3 / Task 3.3）：`--backend sqlite|pg|both`（默认 sqlite）
 *   · sqlite：内存库 + 同一份 `sqlite-fts5.sql` 期望态（原路径）
 *   · pg：真实库里**事务内**灌入同一份标注语料 → 评测 → ROLLBACK（不落库）；后端不可用 → 非 0 退出
 *   · both：两者都跑并各自出数；任一后端不可用即非 0（"未测过的后端不得出现在基线合格结论里"）
 *
 * 用法：npx tsx scripts/memory/recall-eval.ts [--backend sqlite|pg|both] [--hybrid]
 */
import { DatabaseSync } from "node:sqlite"
import { readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { homedir } from "node:os"
import { createSqliteFtsAdapter } from "../../templates/core/scripts/mcp-server/shared/memory/retrieval/fts/sqlite.js"
import { createPgFtsAdapter } from "../../templates/core/scripts/mcp-server/shared/memory/retrieval/fts/pg.js"
import { expandForIndexWithMethod } from "../../templates/core/scripts/mcp-server/shared/memory/retrieval/cjk-segmenter.js"
import { recallPipeline, type MemoryRowLike } from "../../templates/core/scripts/mcp-server/shared/memory/retrieval/pipeline.js"
import type { LexicalSearchAdapter, RawQuerier, RecallFilter } from "../../templates/core/scripts/mcp-server/shared/memory/retrieval/types.js"
import { createLocalOnnxEmbeddingProvider } from "../../templates/core/scripts/mcp-server/shared/memory/embedding/local-onnx.js"
import type { VectorSearchAdapter } from "../../templates/core/scripts/mcp-server/shared/memory/embedding/index.js"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const FIXTURE = JSON.parse(
  readFileSync(join(ROOT, "tests/memory/fixtures/recall-labeled-set.json"), "utf-8"),
) as {
  memories: (Record<string, unknown> & { id: string })[]
  queries: { q: string; relevant: string[]; mandatory?: string[]; leakProbe?: string[]; scopeViolationProbe?: string[]; paths?: string[] }[]
}

const LEAK_STATUSES = new Set(["SUPERSEDED", "REJECTED", "ARCHIVED", "CANDIDATE", "PENDING"])

/** 阈值唯一真源（文档引用此处，禁止另写一套数字） */
export const PASS_THRESHOLD = {
  ftsOnly: { metric: "Recall@5", min: 0.70 },
  hybrid: { metric: "MRR@5", min: 0.75 },
} as const

function toRow(m: Record<string, unknown>): MemoryRowLike {
  return {
    id: m.id as string,
    kind: m.kind as string,
    status: m.status as string,
    topic: m.topic as string,
    content: m.content as string,
    summary: null,
    scopeType: m.scopeType as string,
    scopeValue: m.scopeValue as string,
    repositoryRef: m.repositoryRef as string,
    importance: (m.importance as number) ?? 0.5,
    confidence: (m.confidence as number) ?? 0.5,
    validUntil: m.validUntil ? new Date(m.validUntil as string) : null,
    supersedes: ((m.supersedes as string[]) ?? []).map((id) => ({ id })),
  }
}

type Backend = "sqlite" | "pg"

async function main() {
  const idx = process.argv.indexOf("--backend")
  const backendArg = process.argv.find((a) => a.startsWith("--backend="))?.split("=")[1]
    ?? (idx >= 0 ? process.argv[idx + 1] : "sqlite")
  if (!["sqlite", "pg", "both"].includes(backendArg)) {
    console.error(`未知 --backend: ${backendArg}（可选 sqlite | pg | both）`)
    process.exit(2)
  }
  const backends: Backend[] = backendArg === "both" ? ["sqlite", "pg"] : [backendArg as Backend]

  for (const backend of backends) {
    const result = await evalOnBackend(backend)
    if (!result.ok) process.exitCode = 1
  }
}

/**
 * 后端无关的评测主体：`backend` 只决定适配器与语料宿主（内存 SQLite / 真实 PG 事务内）。
 * 语料（FIXTURE）与查询集对所有后端**完全一致** —— 这是"双后端同标注集出数"的前提。
 */
async function evalOnBackend(backend: Backend): Promise<{ ok: boolean }> {
  const { adapter, cleanup } = backend === "pg" ? await makePgBackend() : makeSqliteBackend()
  try {
    const hybrid = process.argv.includes("--hybrid")
    const vector = hybrid ? await buildInMemoryVector() : null
    const hybridDetail = hybrid ? "local-onnx（内存暴力余弦）" : ""
    return await runMetrics({ adapter, label: backend, vector, hybridDetail })
  } finally {
    await cleanup?.()
  }
}

/** SQLite 后端：内存库 + 期望态 SQL（同一份 `sqlite-fts5.sql`）+ 写入期 token 串 */
function makeSqliteBackend(): { adapter: LexicalSearchAdapter; cleanup?: () => Promise<void> } {
  const db = new DatabaseSync(":memory:")
  db.exec(`CREATE TABLE "AddMemory" (
    id TEXT PRIMARY KEY, kind TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'CANDIDATE',
    topic TEXT NOT NULL, content TEXT NOT NULL, summary TEXT,
    searchText TEXT NOT NULL DEFAULT '',
    scopeType TEXT NOT NULL, scopeValue TEXT NOT NULL, repositoryRef TEXT NOT NULL,
    importance REAL DEFAULT 0.5, confidence REAL DEFAULT 0.5,
    validFrom TEXT, validUntil TEXT, contentHash TEXT DEFAULT ''
  )`)
  db.exec(readFileSync(
    join(ROOT, "templates/core/scripts/mcp-server/shared/memory/retrieval/fts/sqlite-fts5.sql"), "utf-8"))

  const ins = db.prepare(`INSERT INTO "AddMemory"
    (id, kind, status, topic, content, searchText, scopeType, scopeValue, repositoryRef, importance, confidence, validUntil, contentHash)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
  for (const m of FIXTURE.memories) {
    // 写入期 token 串（与测试/生产同一契约）：虚表按 searchText 索引，缺它则这些行不可检索
    const searchText = expandForIndexWithMethod(`${m.topic as string} ${m.content as string}`).text
    ins.run(m.id, m.kind, m.status, m.topic, m.content, searchText, m.scopeType, m.scopeValue,
      m.repositoryRef, (m.importance as number) ?? 0.5, (m.confidence as number) ?? 0.5,
      (m.validUntil as string) ?? null, `hash-${m.id}`)
  }

  const querier: RawQuerier = {
    query: <T,>(sql: string, params: unknown[]) =>
      Promise.resolve(db.prepare(sql).all(...(params as never[])) as T[]),
  }
  return { adapter: createSqliteFtsAdapter(querier) }
}

/** PG 后端：事务内灌入同一份标注语料 → 评测 → ROLLBACK（不落库，可重复执行） */
async function makePgBackend(): Promise<{ adapter: LexicalSearchAdapter; cleanup: () => Promise<void> }> {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error("--backend pg 需要 DATABASE_URL（未设置 ⇒ 非 0 退出，不静默跳过）")
  const { Client } = await import("pg")
  const client = new Client({ connectionString })
  await client.connect()
  await client.query("BEGIN")

  const cols = await client.query<{ column_name: string }>(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'AddMemory'")
  if (!cols.rows.some((r) => r.column_name === "searchText")) {
    await client.query("ROLLBACK")
    await client.end()
    throw new Error("AddMemory.searchText 列缺失（迁移未应用）⇒ PG 后端不可用，非 0 退出")
  }

  for (const m of FIXTURE.memories) {
    const searchText = expandForIndexWithMethod(`${m.topic as string} ${m.content as string}`).text
    await client.query(
      `INSERT INTO "AddMemory" (id, kind, status, topic, content, "searchText", "scopeType", "scopeValue",
        "repositoryRef", importance, confidence, "contentHash", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
       ON CONFLICT (id) DO UPDATE SET "searchText" = EXCLUDED."searchText", "updatedAt" = NOW()`,
      [m.id, m.kind, m.status, m.topic, m.content, searchText, m.scopeType, m.scopeValue,
        m.repositoryRef, (m.importance as number) ?? 0.5, (m.confidence as number) ?? 0.5, `hash-${m.id}`],
    )
  }

  const querier: RawQuerier = {
    query: async <T,>(sql: string, params: unknown[]) => (await client.query(sql, params)).rows as T[],
  }
  const adapter = createPgFtsAdapter(querier)
  return {
    adapter,
    cleanup: async () => {
      await client.query("ROLLBACK") // 语料不落库；评测可重复执行
      await client.end()
    },
  }
}

/** 内存向量通道（hybrid）：本地 ONNX 嵌入 + 暴力余弦（不依赖 pgvector / sqlite-vec） */
async function buildInMemoryVector(): Promise<VectorSearchAdapter> {
  const provider = createLocalOnnxEmbeddingProvider({
    cacheDir: process.env.HF_HUB_CACHE ?? join(homedir(), ".cache", "huggingface", "hub"),
    remoteHost: "https://hf-mirror.com",
  })
  const memVec = new Map<string, number[]>()
  const vectors = await provider.embed(FIXTURE.memories.map((m) => `${m.topic} ${m.content}`))
  FIXTURE.memories.forEach((m, i) => memVec.set(m.id, vectors[i]))
  const cos = (a: number[], b: number[]): number => {
    let dot = 0, na = 0, nb = 0
    for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
    return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1)
  }
  const rowById = new Map(FIXTURE.memories.map((m) => [m.id, toRow(m)]))
  return {
    search: async (queryText: string, filter: RecallFilter, limit: number) => {
      const [qv] = await provider.embed([queryText])
      return [...memVec.entries()]
        .filter(([id]) => {
          const r = rowById.get(id)
          // 与真实适配器同语义：仓库 + 生命周期状态双重过滤（否则候选池被噪声稀释）
          return !!r && r.repositoryRef === filter.repositoryRef &&
            (filter.statuses as readonly string[]).includes(r.status)
        })
        .map(([id, v]) => ({ id, score: cos(qv, v) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((s, i) => ({ memoryId: s.id, rank: i + 1, score: s.score }))
    },
    upsert: () => Promise.resolve(),
    health: () => Promise.resolve({ component: "vector-search", status: "ok" as const, detail: "eval in-memory" }),
  }
}

/** 评测主体（后端无关）：同一份标注集 + 同一套阈值 */
async function runMetrics(opts: {
  adapter: LexicalSearchAdapter
  label: string
  vector: VectorSearchAdapter | null
  hybridDetail: string
}): Promise<{ ok: boolean }> {
  const { adapter, label, vector, hybridDetail } = opts
  const hybrid = vector !== null
  const rowById = new Map(FIXTURE.memories.map((m) => [m.id, toRow(m)]))
  const fetchByIds = (ids: string[]) =>
    Promise.resolve(ids.map((id) => rowById.get(id)).filter((r): r is MemoryRowLike => !!r))

  const health = await adapter.health()
  if (health.status !== "ok" && health.status !== "disabled") {
    console.log(`=== 后端 ${label}：不可用（${health.detail ?? health.status}）===`)
    return { ok: false } // 后端不可用 ⇒ 非 0（不得把"没测过"混进"基线合格"）
  }

  let recallSum = 0, mrrSum = 0, leaks = 0, mandatoryMiss = 0, scopeViolations = 0
  let rankingVersion = ""
  const latency: number[] = []
  const misses: string[] = []

  for (const q of FIXTURE.queries) {
    const res = await recallPipeline({
      query: q.q,
      stage: "EVAL",
      repositoryRef: "eval-repo",
      scopeCtx: { repository: "eval-repo", paths: q.paths ?? ["src/"] },
      maxTokens: 500,
      limit: 20,
    }, { lexical: [adapter], vector, fetchByIds, fetchEvidenceSourceRefs: () => Promise.resolve(new Map()), audit: null })
    rankingVersion = res.rankingVersion
    latency.push(res.latencyMs)

    const top5 = res.items.slice(0, 5).map((i) => i.memoryId)
    if (q.relevant.length > 0) {
      const hits = q.relevant.filter((id) => top5.includes(id)).length
      recallSum += hits / q.relevant.length
      const firstRank = top5.findIndex((id) => q.relevant.includes(id))
      mrrSum += firstRank >= 0 ? 1 / (firstRank + 1) : 0
      if (hits < q.relevant.length) misses.push(`"${q.q}" 漏召 ${q.relevant.filter((id) => !top5.includes(id)).join(",")}`)
    }
    for (const item of res.items) {
      const row = rowById.get(item.memoryId)
      if (!row) continue
      if (LEAK_STATUSES.has(row.status) || row.repositoryRef !== "eval-repo" ||
          (row.validUntil && row.validUntil <= new Date())) {
        leaks++
        misses.push(`"${q.q}" 泄漏 ${item.memoryId}(${row.status})`)
      }
    }
    for (const probe of q.leakProbe ?? []) {
      if (res.items.some((i) => i.memoryId === probe)) { leaks++; misses.push(`"${q.q}" 探针泄漏 ${probe}`) }
    }
    for (const probe of q.scopeViolationProbe ?? []) {
      if (res.items.some((i) => i.memoryId === probe)) { scopeViolations++; misses.push(`"${q.q}" scope 越界 ${probe}`) }
    }
    for (const mid of q.mandatory ?? []) {
      if (!top5.includes(mid)) { mandatoryMiss++; misses.push(`"${q.q}" 强制约束漏召 ${mid}`) }
    }
  }

  const withRelevant = FIXTURE.queries.filter((q) => q.relevant.length > 0).length
  const sortedLat = [...latency].sort((a, b) => a - b)
  const p95 = sortedLat[Math.floor(sortedLat.length * 0.95)] ?? 0
  const metrics = {
    backend: label,
    queries: FIXTURE.queries.length,
    withRelevant,
    "Recall@5": +(recallSum / withRelevant).toFixed(4),
    "MRR@5": +(mrrSum / withRelevant).toFixed(4),
    leakage: leaks,
    scopeViolations,
    mandatoryMiss,
    latencyP95ms: p95,
    degradedMode: hybrid ? `hybrid(${hybridDetail})` : "fts-only",
    rankingVersion,
  }

  const mode = hybrid ? "HYBRID: FTS + 向量" : "FTS-only（bigram 分词 FTS 主通道）"
  console.log(`=== Agent Memory 召回评测（backend=${label}，${mode}）===`)
  console.log(`阈值（唯一真源）：${hybrid ? "MRR@5 ≥ 0.75" : "Recall@5 ≥ 0.70"}，leakage=0，mandatory=0，scope=0`)
  console.table(metrics)
  if (misses.length > 0) {
    console.log("--- 明细 ---")
    for (const m of misses) console.log(" ", m)
  }

  const pass = hybrid
    ? metrics["MRR@5"] >= PASS_THRESHOLD.hybrid.min && leaks === 0 && mandatoryMiss === 0 && scopeViolations === 0
    : metrics["Recall@5"] >= PASS_THRESHOLD.ftsOnly.min && leaks === 0 && mandatoryMiss === 0 && scopeViolations === 0
  console.log(pass ? "✅ 达标" : "❌ 未达标")
  return { ok: pass }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e))
  process.exit(2) // 后端不可用/环境缺失 → 非 0（不静默跳过）
})
