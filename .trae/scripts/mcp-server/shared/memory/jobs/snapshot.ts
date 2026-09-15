/*
 * L1/L2 召回快照生成（Spec §10：session-start 仅注入 repository 级 L1 小上下文）
 *
 * 设计约束（Plan §9.3）：同步 Hook ≤200ms 且无 DB 依赖 → Hook 只读本模块预计算的快照文件；
 * 快照由本 job 异步刷新（consolidation / 手动 CLI / Gate 后触发）。
 * 原子写：tmp + rename，Hook 读侧永不遇到半文件。
 */
import { mkdirSync, renameSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { recallPipeline, type MemoryRowLike } from "../retrieval/pipeline.js"
import type { RecallAuditStore } from "../retrieval/recall-writer.js"
import type { LexicalSearchAdapter, RecalledMemory } from "../retrieval/types.js"
import { L1_SNAPSHOT_FILE, L2_SNAPSHOT_FILE, MEMORY_DIR_NAME, memoryMaxTokens } from "../switches.js"

export interface SnapshotDeps {
  repositoryRef: string
  projectDir: string
  magicDir: string
  lexical: LexicalSearchAdapter[]
  fetchByIds(ids: string[]): Promise<MemoryRowLike[]>
  fetchEvidenceSourceRefs(memoryIds: string[]): Promise<Map<string, string[]>>
  audit: RecallAuditStore
  now?: Date
}

export interface SnapshotResult {
  path: string
  itemCount: number
  injectedTokens: number
  recallId: string | null
}

/** 渲染带来源边界标签的注入文本（Plan §9.3：Recall 注入采用明确的数据边界与来源标签） */
export function renderSnapshotMarkdown(level: "L1" | "L2", items: RecalledMemory[], generatedAt: Date): string {
  const lines = [
    `[Memory ${level} · 来源: AddMemory 治理库 · 生成于 ${generatedAt.toISOString()}]`,
    `<agent-memory source="add-memory" trust="governed">`,
  ]
  for (const it of items) {
    lines.push(
      `- [${it.kind}] ${it.topic}（置信 ${it.confidence.toFixed(2)}）`,
      `  ${it.content.length > 120 ? it.content.slice(0, 120) + "…" : it.content}`,
    )
    if (it.sourceRefs.length > 0) lines.push(`  来源: ${it.sourceRefs.join(", ")}`)
  }
  lines.push(`</agent-memory>`)
  return lines.join("\n") + "\n"
}

/** 刷新 L1 快照：repository 级核心约束/决策/陷阱/约定 */
export async function refreshL1Snapshot(deps: SnapshotDeps): Promise<SnapshotResult> {
  const maxTokens = memoryMaxTokens()
  const result = await recallPipeline(
    {
      query: "核心约束 关键决策 常见陷阱 项目约定",
      stage: "session-start",
      repositoryRef: deps.repositoryRef,
      scopeCtx: { repository: deps.repositoryRef },
      maxTokens,
      kinds: ["CONSTRAINT", "DECISION", "PITFALL", "CONVENTION"],
      limit: 20,
      consumerRef: "memory-jobs:refresh-l1",
    },
    {
      lexical: deps.lexical,
      fetchByIds: deps.fetchByIds,
      fetchEvidenceSourceRefs: deps.fetchEvidenceSourceRefs,
      audit: deps.audit,
      degradedMode: "fts-only(snapshot-job)",
      now: deps.now,
    },
  )
  const path = join(deps.projectDir, deps.magicDir, MEMORY_DIR_NAME, L1_SNAPSHOT_FILE)
  atomicWrite(path, renderSnapshotMarkdown("L1", result.items, deps.now ?? new Date()))
  return { path, itemCount: result.items.length, injectedTokens: result.injectedTokens, recallId: result.recallId }
}

/** 刷新 L2 快照：按给定 query/stage/scope（供 prompt-router 提示与人工查阅） */
export async function refreshL2Snapshot(
  deps: SnapshotDeps,
  query: string,
  stage: string,
  maxTokens = 1200,
): Promise<SnapshotResult> {
  const result = await recallPipeline(
    {
      query,
      stage,
      repositoryRef: deps.repositoryRef,
      scopeCtx: { repository: deps.repositoryRef },
      maxTokens,
      limit: 20,
      consumerRef: "memory-jobs:refresh-l2",
    },
    {
      lexical: deps.lexical,
      fetchByIds: deps.fetchByIds,
      fetchEvidenceSourceRefs: deps.fetchEvidenceSourceRefs,
      audit: deps.audit,
      degradedMode: "fts-only(snapshot-job)",
      now: deps.now,
    },
  )
  const path = join(deps.projectDir, deps.magicDir, MEMORY_DIR_NAME, L2_SNAPSHOT_FILE)
  atomicWrite(path, renderSnapshotMarkdown("L2", result.items, deps.now ?? new Date()))
  return { path, itemCount: result.items.length, injectedTokens: result.injectedTokens, recallId: result.recallId }
}

function atomicWrite(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.tmp-${process.pid}`
  writeFileSync(tmp, content, "utf-8")
  renameSync(tmp, path)
}
