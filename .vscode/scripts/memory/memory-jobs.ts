/*
 * memory-jobs.ts — Memory 异步任务入口（随模板分发到 `{magicDir}/scripts/memory/memory-jobs.ts`）
 *
 * 为什么随模板分发（2026-09-21 接线）：设计契约（《Agent Memory 知识治理层架构设计》§90）
 * 早就声明入口为 `scripts/memory/memory-jobs.ts <refresh-l1 | drain-evidence | consolidate>`，
 * 但实现只存在于 add-coder 仓库根的开发脚本里 ⇒ 下游项目"拿到了库、拿不到入口"，
 * 于是 `${MAGIC_DIR}/memory/l1-context.md` 永远不会生成、会话注入也就没有数据可注入。
 * 本文件是同一入口的**下游版**：只依赖 `${MAGIC_DIR}/scripts/mcp-server/**`，不依赖仓库根布局。
 *
 * 用法（工作目录 = 项目根）：
 *   PROJECT_ROOT=$PWD MAGIC_DIR=.codex DATABASE_URL="postgresql://..." \
 *   npx tsx "${MAGIC_DIR}/scripts/memory/memory-jobs.ts" <refresh-l1 | drain-evidence | consolidate>
 *
 * 退出码：0 成功；1 执行失败（stderr 给出原因）；2 用法/环境错误。
 * 幂等：refresh-l1 原子写覆盖；drain-evidence 按 offset 续读（重放安全）。
 */

const command = process.argv[2]
if (!command || !["refresh-l1", "drain-evidence", "consolidate"].includes(command)) {
  console.error("usage: memory-jobs.ts <refresh-l1 | drain-evidence | consolidate>")
  process.exit(2)
}

const { PROJECT_ROOT, MAGIC_DIR, DATABASE_URL } = process.env
const missing = [
  ["PROJECT_ROOT", PROJECT_ROOT],
  ["MAGIC_DIR", MAGIC_DIR],
  ["DATABASE_URL", DATABASE_URL],
].filter(([, v]) => !v).map(([k]) => k)
if (missing.length > 0) {
  console.error(`缺少环境变量: ${missing.join(" / ")}`)
  process.exit(2)
}

const { prisma } = await import("../mcp-server/shared/prisma.js")
const dbTypes = await import("../mcp-server/shared/db-types.js")
const { validatedDelegate } = dbTypes
const { createRuntimeContext } = await import("../mcp-server/shared/runtime-context.js")
const { createPgFtsAdapter } = await import("../mcp-server/shared/memory/retrieval/fts/pg.js")
const { createSqliteFtsAdapter } = await import("../mcp-server/shared/memory/retrieval/fts/sqlite.js")
const { refreshL1Snapshot } = await import("../mcp-server/shared/memory/jobs/snapshot.js")
const { drainEvidenceQueue } = await import("../mcp-server/shared/memory/jobs/evidence-collector.js")
const { runConsolidation } = await import("../mcp-server/shared/memory/jobs/consolidation.js")

type Row = Record<string, unknown>
const runtime = createRuntimeContext(PROJECT_ROOT as string, MAGIC_DIR as string)
const repositoryRef = runtime.projectKey

// ── deps 装配（与 tools/memory.ts 同一模式：validatedDelegate + RawQuerier）──
const rawQuerier = {
  query: <T = Row>(sql: string, params: unknown[]): Promise<T[]> =>
    (prisma.$queryRawUnsafe as unknown as (s: string, ...p: unknown[]) => Promise<unknown>)(sql, ...params) as Promise<T[]>,
}
const lexical = [
  (DATABASE_URL as string).startsWith("postgres")
    ? createPgFtsAdapter(rawQuerier)
    : createSqliteFtsAdapter(rawQuerier),
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
  projectDir: PROJECT_ROOT as string,
  magicDir: MAGIC_DIR as string,
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
    console.log(
      JSON.stringify(
        await drainEvidenceQueue({
          projectDir: PROJECT_ROOT as string,
          magicDir: MAGIC_DIR as string,
          repositoryRef,
          evidenceDb,
        }),
        null,
        2,
      ),
    )
  } else {
    console.log(JSON.stringify(await runConsolidation({ ...baseDeps, memoryDb, evidenceDb, linkDb, metricDb }), null, 2))
  }
} catch (e) {
  // 失败必须可见（非零退出 + 原因），不吞错、不打印堆栈给消费方
  console.error(`memory-jobs ${command} 失败: ${e instanceof Error ? e.message : String(e)}`)
  process.exit(1)
}
process.exit(0)

// 顶层 await 需要本文件被视为模块（tsconfig target=ES2022 / module=ESNext）
export {}
