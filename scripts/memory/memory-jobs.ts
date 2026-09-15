/*
 * memory-jobs.ts — Memory 异步任务 CLI（轮次 4，Plan §9.3 异步队列驱动）
 *
 * 用法（工作目录 = 仓库根）：
 *   PROJECT_ROOT=$PWD MAGIC_DIR=.codex DATABASE_URL="postgresql://..." PRISMA_CLIENT_DIR=prisma \
 *   npx tsx scripts/memory/memory-jobs.ts <refresh-l1 | drain-evidence | consolidate>
 *
 * 触发时机：
 *   - consolidate：Post-Handoff / 定时任务 / 手动
 *   - refresh-l1：DPS/RAHS Gate 通过后、resolve_memory approve 后（手动或 Automation）
 *   - drain-evidence：consolidate 已内含，单独暴露用于调试
 */

const command = process.argv[2]
if (!command || !["refresh-l1", "drain-evidence", "consolidate"].includes(command)) {
  console.error("usage: memory-jobs.ts <refresh-l1 | drain-evidence | consolidate>")
  process.exit(2)
}

const { PROJECT_ROOT, MAGIC_DIR, DATABASE_URL } = process.env
if (!PROJECT_ROOT || !MAGIC_DIR || !DATABASE_URL) {
  console.error("需要环境变量 PROJECT_ROOT / MAGIC_DIR / DATABASE_URL")
  process.exit(2)
}

const { prisma } = await import("../../templates/core/scripts/mcp-server/shared/prisma.js")
const dbTypes = await import("../../templates/core/scripts/mcp-server/shared/db-types.js")
const { validatedDelegate } = dbTypes
const { createRuntimeContext } = await import("../../templates/core/scripts/mcp-server/shared/runtime-context.js")
const { createPgFtsAdapter } = await import("../../templates/core/scripts/mcp-server/shared/memory/retrieval/fts/pg.js")
const { createSqliteFtsAdapter } = await import("../../templates/core/scripts/mcp-server/shared/memory/retrieval/fts/sqlite.js")
const { refreshL1Snapshot } = await import("../../templates/core/scripts/mcp-server/shared/memory/jobs/snapshot.js")
const { drainEvidenceQueue } = await import("../../templates/core/scripts/mcp-server/shared/memory/jobs/evidence-collector.js")
const { runConsolidation } = await import("../../templates/core/scripts/mcp-server/shared/memory/jobs/consolidation.js")

type Row = Record<string, unknown>
const runtime = createRuntimeContext(PROJECT_ROOT, MAGIC_DIR)
const repositoryRef = runtime.projectKey

// ── deps 装配（与 tools/memory.ts 同一模式：validatedDelegate + RawQuerier） ──
const rawQuerier = {
  query: <T = Row>(sql: string, params: unknown[]): Promise<T[]> =>
    (prisma.$queryRawUnsafe as unknown as (s: string, ...p: unknown[]) => Promise<unknown>)(sql, ...params) as Promise<T[]>,
}
const lexical = [
  DATABASE_URL.startsWith("postgres") ? createPgFtsAdapter(rawQuerier) : createSqliteFtsAdapter(rawQuerier),
]
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dg = (delegate: unknown, schema: any, table: string) => validatedDelegate(delegate, schema, table) as any

const memoryDb = dg(prisma.addMemory, dbTypes.AddMemoryRowSchema, "AddMemory")
const evidenceDb = dg(prisma.addMemoryEvidence, dbTypes.AddMemoryEvidenceRowSchema, "AddMemoryEvidence")
const linkDb = dg(prisma.addMemoryEvidenceLink, dbTypes.AddMemoryEvidenceLinkRowSchema, "AddMemoryEvidenceLink")
const recallDb = dg(prisma.addMemoryRecall, dbTypes.AddMemoryRecallRowSchema, "AddMemoryRecall")
const itemDb = dg(prisma.addMemoryRecallItem, dbTypes.AddMemoryRecallItemRowSchema, "AddMemoryRecallItem")
const metricDb = dg(prisma.addMetricSnapshot, dbTypes.AddMetricSnapshotRowSchema, "AddMetricSnapshot")

const baseDeps = {
  repositoryRef,
  projectDir: PROJECT_ROOT,
  magicDir: MAGIC_DIR,
  lexical,
  fetchByIds: async (ids: string[]) =>
    memoryDb.findMany({ where: { id: { in: ids } }, include: { supersedes: { select: { id: true } } } }),
  fetchEvidenceSourceRefs: async (memoryIds: string[]) => {
    const links = await linkDb.findMany({ where: { memoryId: { in: memoryIds } } })
    const evIds = [...new Set(links.map((l: Row) => l.evidenceId as string))]
    const evs = evIds.length > 0 ? await evidenceDb.findMany({ where: { id: { in: evIds } } }) : []
    const refById = new Map<string, string>(evs.map((e: Row) => [e.id as string, e.sourceRef as string]))
    const out = new Map<string, string[]>()
    for (const l of links as Row[]) {
      const ref = refById.get(l.evidenceId as string)
      if (!ref) continue
      const arr = out.get(l.memoryId as string) ?? []
      arr.push(ref)
      out.set(l.memoryId as string, arr)
    }
    return out
  },
  audit: {
    createRecall: (data: Row) => recallDb.create({ data }),
    createRecallItem: (data: Row) => itemDb.create({ data }),
  },
}

try {
  if (command === "refresh-l1") {
    console.log(JSON.stringify(await refreshL1Snapshot(baseDeps), null, 2))
  } else if (command === "drain-evidence") {
    console.log(JSON.stringify(await drainEvidenceQueue({ projectDir: PROJECT_ROOT, magicDir: MAGIC_DIR, repositoryRef, evidenceDb }), null, 2))
  } else {
    console.log(JSON.stringify(await runConsolidation({ ...baseDeps, memoryDb, evidenceDb, linkDb, metricDb }), null, 2))
  }
} catch (e) {
  // fail-open：任务失败非零退出但不抛堆栈给 Hook 消费方
  console.error(`memory-jobs ${command} 失败: ${e instanceof Error ? e.message : String(e)}`)
  process.exit(1)
}
process.exit(0)
