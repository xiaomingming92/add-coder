// reindex.ts — Memory FTS 损坏探测与重建（自托管 CLI 外壳）
//
// 用法（工作目录 = 仓库根）：
//   DATABASE_URL="postgresql://..." npx tsx scripts/memory/reindex.ts [probe|rebuild]
//
// 分层（本 Plan 决策）：**清单与编排不在本文件**——
//  - 期望态清单 + SQL 渲染：src/lib/memory-fts-objects.ts
//  - 探测/重建编排 + 运行时适配：src/lib/memory-fts-runtime.ts
// 本文件只做两件事：① 把 RawQuerier 包成 FtsAdapter（自托管经 prisma 客户端）；② 命令行外壳。
// 用户项目的自助入口是 add-coder memory:reindex（双后端，无需本项目源码）。
import { pathToFileURL } from "node:url"
import type { RawQuerier } from "../../templates/core/scripts/mcp-server/shared/memory/retrieval/types.js"
import {
  detectBackend,
  type FtsBackend,
} from "../../src/lib/memory-fts-objects.js"
import {
  probeVia,
  reindexVia,
  type FtsAdapter,
  type ReindexReport,
} from "../../src/lib/memory-fts-runtime.js"

// 清单 / 渲染 / detectBackend / applyObjects / resolveFtsObjects 的单一真源在库层，此处按原 API 再导出。
export * from "../../src/lib/memory-fts-objects.js"
export type { ReindexReport, FtsAdapter } from "../../src/lib/memory-fts-runtime.js"

/** 自托管（本仓库）用 prisma 客户端查询：RawQuerier → FtsAdapter */
export function querierAdapter(querier: RawQuerier, backend: FtsBackend, source = `prisma.${backend}`): FtsAdapter {
  return {
    backend,
    source,
    listExisting: async () => new Set(await listExistingObjects(querier, backend)),
    apply: async (ddl) => {
      await querier.query(ddl, [])
    },
  }
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
export function probeFts(querier: RawQuerier, backend: FtsBackend): Promise<ReindexReport> {
  return probeVia(querierAdapter(querier, backend))
}

/**
 * 重建：对缺失对象依次执行幂等 DDL，再复探确认。
 * 重放语义：目录健康时 rebuilt=[]、missing=[]，与首次成功后的结果一致。
 */
export function reindex(querier: RawQuerier, backend: FtsBackend): Promise<ReindexReport> {
  return reindexVia(querierAdapter(querier, backend))
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

const invokedDirectly = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (invokedDirectly) await main()
