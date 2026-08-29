/*
 * recall-eval.ts — Agent Memory 召回评测基线（Plan §12.1 / Spec §12）
 *
 * 在内存 SQLite 上重放 FTS5 migration + 标注集，跑完整 recallPipeline，输出：
 *   Recall@5 / MRR@5 / leakage（SUPERSEDED/REJECTED/ARCHIVED/过期/越界/CANDIDATE）/ 强制约束漏召回
 * 阈值（FTS-only）：Recall@5 ≥ 0.70；leakage = 0；mandatory miss = 0
 *
 * 用法：npx tsx scripts/memory/recall-eval.ts [--json]
 */
import { DatabaseSync } from "node:sqlite"
import { readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { createSqliteFtsAdapter } from "../../templates/core/scripts/mcp-server/shared/memory/retrieval/fts/sqlite.js"
import { recallPipeline, type MemoryRowLike } from "../../templates/core/scripts/mcp-server/shared/memory/retrieval/pipeline.js"
import type { RawQuerier } from "../../templates/core/scripts/mcp-server/shared/memory/retrieval/types.js"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const FIXTURE = JSON.parse(
  readFileSync(join(ROOT, "tests/memory/fixtures/recall-labeled-set.json"), "utf-8"),
) as {
  memories: (Record<string, unknown> & { id: string })[]
  queries: { q: string; relevant: string[]; mandatory?: string[]; leakProbe?: string[]; scopeViolationProbe?: string[]; paths?: string[] }[]
}

const LEAK_STATUSES = new Set(["SUPERSEDED", "REJECTED", "ARCHIVED", "CANDIDATE", "PENDING"])

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

async function main() {
  const db = new DatabaseSync(":memory:")
  db.exec(`CREATE TABLE "AddMemory" (
    id TEXT PRIMARY KEY, kind TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'CANDIDATE',
    topic TEXT NOT NULL, content TEXT NOT NULL, summary TEXT,
    scopeType TEXT NOT NULL, scopeValue TEXT NOT NULL, repositoryRef TEXT NOT NULL,
    importance REAL DEFAULT 0.5, confidence REAL DEFAULT 0.5,
    validFrom TEXT, validUntil TEXT, contentHash TEXT DEFAULT ''
  )`)
  db.exec(readFileSync(
    join(ROOT, "templates/core/scripts/mcp-server/shared/memory/retrieval/fts/sqlite-fts5.sql"), "utf-8"))

  const ins = db.prepare(`INSERT INTO "AddMemory"
    (id, kind, status, topic, content, scopeType, scopeValue, repositoryRef, importance, confidence, validUntil, contentHash)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
  for (const m of FIXTURE.memories) {
    ins.run(m.id, m.kind, m.status, m.topic, m.content, m.scopeType, m.scopeValue,
      m.repositoryRef, m.importance ?? 0.5, m.confidence ?? 0.5, m.validUntil ?? null, `hash-${m.id}`)
  }

  const querier: RawQuerier = {
    query: <T,>(sql: string, params: unknown[]) =>
      Promise.resolve(db.prepare(sql).all(...(params as never[])) as T[]),
  }
  const adapter = createSqliteFtsAdapter(querier)
  const health = await adapter.health()
  if (health.status !== "ok") throw new Error(`sqlite-fts 不可用: ${health.detail}`)

  const rowById = new Map(FIXTURE.memories.map((m) => [m.id, toRow(m)]))
  const fetchByIds = (ids: string[]) =>
    Promise.resolve(ids.map((id) => rowById.get(id)).filter((r): r is MemoryRowLike => !!r))

  let recallSum = 0, mrrSum = 0, leaks = 0, mandatoryMiss = 0, scopeViolations = 0
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
    }, { lexical: [adapter], fetchByIds, fetchEvidenceSourceRefs: () => Promise.resolve(new Map()), audit: null })
    latency.push(res.latencyMs)

    const top5 = res.items.slice(0, 5).map((i) => i.memoryId)
    // Recall@5
    if (q.relevant.length > 0) {
      const hits = q.relevant.filter((id) => top5.includes(id)).length
      recallSum += hits / q.relevant.length
      const firstRank = top5.findIndex((id) => q.relevant.includes(id))
      mrrSum += firstRank >= 0 ? 1 / (firstRank + 1) : 0
      if (hits < q.relevant.length) misses.push(`"${q.q}" 漏召 ${q.relevant.filter((id) => !top5.includes(id)).join(",")}`)
    }
    // leakage：泄漏探针 + 通用禁用状态
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
    // 强制约束漏召回
    for (const mid of q.mandatory ?? []) {
      if (!top5.includes(mid)) { mandatoryMiss++; misses.push(`"${q.q}" 强制约束漏召 ${mid}`) }
    }
  }

  const withRelevant = FIXTURE.queries.filter((q) => q.relevant.length > 0).length
  const sortedLat = [...latency].sort((a, b) => a - b)
  const p95 = sortedLat[Math.floor(sortedLat.length * 0.95)] ?? 0
  const metrics = {
    queries: FIXTURE.queries.length,
    withRelevant,
    "Recall@5": +(recallSum / withRelevant).toFixed(4),
    "MRR@5": +(mrrSum / withRelevant).toFixed(4),
    leakage: leaks,
    scopeViolations,
    mandatoryMiss,
    latencyP95ms: p95,
    degradedMode: "fts-only",
  }

  console.log("=== Agent Memory 召回评测（FTS-only, SQLite trigram）===")
  console.table(metrics)
  if (misses.length > 0) {
    console.log("--- 明细 ---")
    for (const m of misses) console.log(" ", m)
  }

  const pass = metrics["Recall@5"] >= 0.70 && leaks === 0 && mandatoryMiss === 0 && scopeViolations === 0
  console.log(pass ? "✅ 达标（Recall@5 ≥ 0.70，leakage=0，mandatory=0）" : "❌ 未达标")
  process.exit(pass ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(2) })
