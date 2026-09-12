/*
 * Hybrid Recall 编排管线（Plan §7.1 十步流水线）
 *
 *  1. Repository/tenant 边界校验（调用方前置，此处防御性复核）
 *  2. Lifecycle 过滤（默认仅 ACTIVE；诊断模式放行 STALE）
 *  3. Scope 过滤与强约束匹配
 *  4. FTS/BM25 候选生成（双后端 adapter）
 *  5. Vector 候选生成（能力可用时；首版 none）
 *  6. Reciprocal Rank Fusion
 *  7. 治理重排
 *  8. 冲突、重复和多样性处理
 *  9. Token-budget 摘要与裁剪
 * 10. 写入 AddMemoryRecall
 */
import { DEFAULT_RECALL_STATUSES, DIAGNOSTIC_RECALL_STATUSES, type MemoryStatus } from "../domain/state-machine.js"
import { scopeApplies, type ScopeContext } from "../domain/scope.js"
import { rrfFuse, DEFAULT_RRF_K } from "./fusion.js"
import { rerankOne, DEFAULT_WEIGHTS, RANKING_VERSION, type RerankWeights } from "./reranker.js"
import { buildContext, estimateTokens } from "./context-builder.js"
import { writeRecallAudit, type RecallAuditStore } from "./recall-writer.js"
import type { LexicalSearchAdapter, RankedId, RecallFilter, RecalledMemory } from "./types.js"

/** 管线需要的记忆行字段子集（与 AddMemoryRow 对齐） */
export interface MemoryRowLike {
  id: string
  kind: string
  status: string
  topic: string
  content: string
  summary: string | null
  scopeType: string
  scopeValue: string
  repositoryRef: string
  importance: number
  confidence: number
  validUntil: Date | null
  supersedes?: { id: string }[]
}

export interface RecallPipelineInput {
  query: string
  stage: string
  repositoryRef: string
  scopeCtx: ScopeContext
  maxTokens: number
  kinds?: string[]
  limit?: number
  consumerRef?: string
  /** 诊断模式：放行 STALE（带警告标记），默认 false */
  diagnostic?: boolean
}

export interface RecallPipelineDeps {
  lexical: LexicalSearchAdapter[]
  /** Vector 候选（可选；首版不传即 FTS-only） */
  vector?: { search(query: string, filter: RecallFilter, limit: number): Promise<RankedId[]> } | null
  fetchByIds(ids: string[]): Promise<MemoryRowLike[]>
  fetchEvidenceSourceRefs(memoryIds: string[]): Promise<Map<string, string[]>>
  audit?: RecallAuditStore | null
  weights?: RerankWeights
  rrfK?: number
  rankingVersion?: string
  degradedMode?: string
  now?: Date
}

export interface RecallPipelineResult {
  items: RecalledMemory[]
  recallId: string | null
  degradedMode: string | null
  excluded: { memoryId: string; reason: string }[]
  candidateCount: number
  injectedTokens: number
  latencyMs: number
  rankingVersion: string
}

export async function recallPipeline(
  input: RecallPipelineInput,
  deps: RecallPipelineDeps,
): Promise<RecallPipelineResult> {
  const start = Date.now()
  const now = deps.now ?? new Date()
  const statuses: readonly MemoryStatus[] = input.diagnostic ? DIAGNOSTIC_RECALL_STATUSES : DEFAULT_RECALL_STATUSES
  const limit = input.limit ?? 20

  // Step 1（防御性复核）：repository 边界
  if (input.scopeCtx.repository !== input.repositoryRef) {
    throw new Error(`ERR_REPOSITORY_MISMATCH: scopeCtx.repository=${input.scopeCtx.repository} 与 repositoryRef 不一致`)
  }

  const filter: RecallFilter = {
    repositoryRef: input.repositoryRef,
    statuses,
    scopeCtx: input.scopeCtx,
    kinds: input.kinds,
    now,
  }

  // Step 4/5：候选生成（FTS 多通道 + 可选 Vector）
  const channelLists: RankedId[][] = []
  for (const adapter of deps.lexical) {
    const multi = adapter as LexicalSearchAdapter & {
      searchChannels?(q: string, f: RecallFilter, l: number): Promise<RankedId[][]>
    }
    if (typeof multi.searchChannels === "function") {
      channelLists.push(...(await multi.searchChannels(input.query, filter, limit)))
    } else {
      channelLists.push(await adapter.search(input.query, filter, limit))
    }
  }
  if (deps.vector) {
    try {
      channelLists.push(await deps.vector.search(input.query, filter, limit))
    } catch {
      // Vector 故障不阻塞 FTS（Plan §8.4）
    }
  }

  // Step 6：RRF 融合
  const fused = rrfFuse(channelLists, deps.rrfK ?? DEFAULT_RRF_K)
  const candidateIds = [...fused.keys()]
  if (candidateIds.length === 0) {
    const empty: RecallPipelineResult = {
      items: [], recallId: null, degradedMode: deps.degradedMode ?? null,
      excluded: [], candidateCount: 0, injectedTokens: 0,
      latencyMs: Date.now() - start, rankingVersion: deps.rankingVersion ?? RANKING_VERSION,
    }
    if (deps.audit) {
      empty.recallId = await writeRecallAudit(deps.audit, {
        repositoryRef: input.repositoryRef, query: input.query, stage: input.stage,
        consumerRef: input.consumerRef, scopeContext: input.scopeCtx,
        candidateIds: [], items: [], excluded: [],
        rankingVersion: empty.rankingVersion, tokenBudget: input.maxTokens,
        injectedTokens: 0, latencyMs: empty.latencyMs, degradedMode: empty.degradedMode ?? undefined,
      })
    }
    return empty
  }

  // Step 2/3：取行 + lifecycle/scope 防御性复核（SQL 已过滤，此处兜底语义一致性）
  const rows = await deps.fetchByIds(candidateIds)
  const rowById = new Map(rows.map((r) => [r.id, r]))
  const eligible = rows.filter((r) => {
    if (r.repositoryRef !== input.repositoryRef) return false
    if (!statuses.includes(r.status as MemoryStatus)) return false
    if (r.validUntil && r.validUntil <= now) return false
    return scopeApplies(
      { type: r.scopeType as Parameters<typeof scopeApplies>[0]["type"], value: r.scopeValue },
      input.scopeCtx,
    )
  })
  const scopeExcluded = candidateIds
    .filter((id) => rowById.has(id) && !eligible.some((r) => r.id === id))
    .map((id) => ({ memoryId: id, reason: "lifecycle/scope/有效期过滤" }))

  // Step 7/8：治理重排
  const reranked = eligible.map((r) => ({
    row: r,
    rr: rerankOne({
      memoryId: r.id,
      rrfScore: fused.get(r.id) ?? 0,
      kind: r.kind,
      status: r.status as MemoryStatus,
      importance: r.importance,
      confidence: r.confidence,
      scopeType: r.scopeType,
      scopeValue: r.scopeValue,
    }, input.scopeCtx, deps.weights ?? DEFAULT_WEIGHTS),
  }))

  // Step 9：token 预算
  const budgetItems = reranked.map(({ row, rr }) => ({
    memoryId: row.id,
    kind: row.kind,
    finalScore: rr.finalScore,
    tokens: estimateTokens(row.summary ?? row.content),
    content: row.content,
    sourceRefs: [] as string[],
    _why: rr.whySelected,
    _breakdown: rr.scoreBreakdown,
  }))
  const budget = buildContext(budgetItems, input.maxTokens)

  const evidenceRefs = await deps.fetchEvidenceSourceRefs(budget.selected.map((s) => s.memoryId))
  const items: RecalledMemory[] = budget.selected.map((s) => {
    const row = rowById.get(s.memoryId)!
    const extra = budgetItems.find((b) => b.memoryId === s.memoryId)!
    return {
      memoryId: s.memoryId,
      kind: row.kind,
      topic: row.topic,
      content: row.content,
      scope: { type: row.scopeType, value: row.scopeValue },
      confidence: row.confidence,
      importance: row.importance,
      sourceRefs: evidenceRefs.get(s.memoryId) ?? s.sourceRefs,
      whySelected: extra._why,
      scoreBreakdown: extra._breakdown,
      supersedes: (row.supersedes ?? []).map((x) => x.id),
    }
  })

  const excluded = [...scopeExcluded, ...budget.excluded]
  const latencyMs = Date.now() - start
  const injectedTokens = budget.usedTokens

  // Step 10：审计落库
  let recallId: string | null = null
  if (deps.audit) {
    recallId = await writeRecallAudit(deps.audit, {
      repositoryRef: input.repositoryRef,
      query: input.query,
      stage: input.stage,
      consumerRef: input.consumerRef,
      scopeContext: input.scopeCtx,
      candidateIds,
      items,
      excluded,
      rankingVersion: deps.rankingVersion ?? RANKING_VERSION,
      tokenBudget: input.maxTokens,
      injectedTokens,
      latencyMs,
      degradedMode: deps.degradedMode,
    })
  }

  return {
    items,
    recallId,
    degradedMode: deps.degradedMode ?? null,
    excluded,
    candidateCount: candidateIds.length,
    injectedTokens,
    latencyMs,
    rankingVersion: deps.rankingVersion ?? RANKING_VERSION,
  }
}
