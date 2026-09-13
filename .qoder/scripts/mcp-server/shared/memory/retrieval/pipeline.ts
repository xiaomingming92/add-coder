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
import {
  rerankOne,
  DEFAULT_WEIGHTS,
  RANKING_VERSION,
  RANKING_VERSION_HYBRID,
  RRF_SCORE_SCALE,
  type RerankWeights,
} from "./reranker.js"
import { buildContext, estimateTokens } from "./context-builder.js"
import { writeRecallAudit, type RecallAuditStore } from "./recall-writer.js"
import type { LexicalSearchAdapter, RankedId, RecallFilter, RecalledMemory } from "./types.js"

/** 向量通道默认权重与候选预算（Plan 轮 3 融合迭代：低精度通道不与词法等权） */
export const DEFAULT_VECTOR_WEIGHT = 0.3
export const DEFAULT_VECTOR_TOP_K = 5

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
  /** 向量通道权重（RRF 加权；默认 DEFAULT_VECTOR_WEIGHT —— 低精度通道不与词法等权） */
  vectorWeight?: number
  /** 向量候选预算（默认 DEFAULT_VECTOR_TOP_K —— 不按总 limit 灌入，避免稀释词法信号） */
  vectorTopK?: number
  /** 补位模式阈值：仅当词法候选数 < 该值时启用向量通道（缺省=始终补充） */
  vectorFallbackThreshold?: number
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
  /** 实际参与融合的候选通道（Spec §7 RecallResultMeta） */
  fusedChannels: ("lexical" | "vector")[]
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
  let lexicalChannels = 0
  for (const adapter of deps.lexical) {
    const multi = adapter as LexicalSearchAdapter & {
      searchChannels?(q: string, f: RecallFilter, l: number): Promise<RankedId[][]>
    }
    if (typeof multi.searchChannels === "function") {
      const channels = await multi.searchChannels(input.query, filter, limit)
      channelLists.push(...channels)
      lexicalChannels += channels.length
    } else {
      channelLists.push(await adapter.search(input.query, filter, limit))
      lexicalChannels += 1
    }
  }
  let vectorUsed = false
  const channelWeights: number[] = channelLists.map(() => 1) // 词法通道权重恒为 1
  if (deps.vector) {
    const lexicalCandidates = new Set(channelLists.flat().map((c) => c.memoryId)).size
    const fallbackOnly = deps.vectorFallbackThreshold != null
    const shouldUseVector = !fallbackOnly || lexicalCandidates < (deps.vectorFallbackThreshold as number)
    try {
      if (shouldUseVector) {
        const vectorCandidates = await deps.vector.search(
          input.query,
          filter,
          Math.min(deps.vectorTopK ?? DEFAULT_VECTOR_TOP_K, limit),
        )
        channelLists.push(vectorCandidates)
        channelWeights.push(deps.vectorWeight ?? DEFAULT_VECTOR_WEIGHT)
        vectorUsed = true
      }
    } catch {
      // Vector 故障不阻塞 FTS（Plan §8.4）
    }
  }
  const fusedChannels: ("lexical" | "vector")[] = [
    ...(lexicalChannels > 0 ? (["lexical"] as const) : []),
    ...(vectorUsed ? (["vector"] as const) : []),
  ]
  // rankingVersion：向量通道真正参与融合才记 v2；否则保持 v1（可被调用方显式覆盖）
  const effectiveRankingVersion =
    deps.rankingVersion ?? (vectorUsed ? RANKING_VERSION_HYBRID : RANKING_VERSION)

  // Step 6：RRF 融合
  const fused = rrfFuse(channelLists, deps.rrfK ?? DEFAULT_RRF_K, channelWeights)
  const candidateIds = [...fused.keys()]
  if (candidateIds.length === 0) {
    const empty: RecallPipelineResult = {
      items: [], recallId: null, degradedMode: deps.degradedMode ?? null,
      fusedChannels,
      excluded: [], candidateCount: 0, injectedTokens: 0,
      latencyMs: Date.now() - start, rankingVersion: effectiveRankingVersion,
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
      // 相关性主导：RRF 放大到与治理 boost 可比量级（见 RRF_SCORE_SCALE 注释）
      rrfScore: (fused.get(r.id) ?? 0) * RRF_SCORE_SCALE,
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
      rankingVersion: effectiveRankingVersion,
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
    fusedChannels,
    excluded,
    candidateCount: candidateIds.length,
    injectedTokens,
    latencyMs,
    rankingVersion: effectiveRankingVersion,
  }
}
