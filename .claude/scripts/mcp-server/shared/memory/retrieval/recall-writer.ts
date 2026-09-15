/*
 * Recall 审计写入（Plan §4.3/§7.1-10：每次召回记录候选、评分、选择，可重放）
 */
import type { RecalledMemory } from "./types.js"

export interface RecallAuditRecord {
  repositoryRef: string
  query: string
  stage: string
  consumerRef?: string
  scopeContext: unknown
  candidateIds: string[]
  items: RecalledMemory[]
  excluded: { memoryId: string; reason: string }[]
  rankingVersion: string
  tokenBudget: number
  injectedTokens: number
  latencyMs: number
  degradedMode?: string
}

export interface RecallAuditStore {
  createRecall(data: {
    repositoryRef: string
    query: string
    stage: string
    consumerRef: string | null
    scopeContext: unknown
    candidateIds: unknown
    selectedIds: unknown
    scoreBreakdown: unknown
    exclusionReasons: unknown
    rankingVersion: string
    tokenBudget: number
    injectedTokens: number
    latencyMs: number
    degradedMode: string | null
  }): Promise<{ id: string }>
  createRecallItem(data: {
    recallId: string
    memoryId: string
    selected: boolean
    rank: number | null
  }): Promise<unknown>
}

/** 落库一次召回（Recall + 每候选一条 RecallItem），返回 recallId */
export async function writeRecallAudit(
  store: RecallAuditStore,
  rec: RecallAuditRecord,
): Promise<string> {
  const selectedIds = rec.items.map((i) => i.memoryId)
  const scoreBreakdown: Record<string, Record<string, number>> = {}
  for (const item of rec.items) scoreBreakdown[item.memoryId] = item.scoreBreakdown

  const recall = await store.createRecall({
    repositoryRef: rec.repositoryRef,
    query: rec.query,
    stage: rec.stage,
    consumerRef: rec.consumerRef ?? null,
    scopeContext: rec.scopeContext,
    candidateIds: rec.candidateIds,
    selectedIds,
    scoreBreakdown,
    exclusionReasons: rec.excluded,
    rankingVersion: rec.rankingVersion,
    tokenBudget: rec.tokenBudget,
    injectedTokens: rec.injectedTokens,
    latencyMs: rec.latencyMs,
    degradedMode: rec.degradedMode ?? null,
  })

  // 候选全集 = 选中 + 被排除（重放完整性）
  const selectedSet = new Set(selectedIds)
  const rankOf = new Map(selectedIds.map((id, i) => [id, i + 1]))
  const excludedReason = new Map(rec.excluded.map((e) => [e.memoryId, e.reason]))
  for (const id of rec.candidateIds) {
    await store.createRecallItem({
      recallId: recall.id,
      memoryId: id,
      selected: selectedSet.has(id),
      rank: rankOf.get(id) ?? null,
    })
    void excludedReason.get(id) // reason 已落 Recall.exclusionReasons（JSON），Item 层不重复
  }
  return recall.id
}
