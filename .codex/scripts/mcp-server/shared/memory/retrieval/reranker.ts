/*
 * 治理重排（Plan §7.3）
 *
 * finalScore = rrfScore
 *   + scopeBoost + kindBoost + importanceBoost + confidenceBoost + mandatoryConstraintBoost
 *   - stalePenalty - conflictPenalty - redundancyPenalty
 *
 * 权重与 rankingVersion 配置化；首版默认权重经评测校准，未评测前不作为不可变产品规则。
 */
import { scopeRank, type ScopeContext } from "../domain/scope.js"
import type { MemoryStatus } from "../domain/state-machine.js"

export const RANKING_VERSION = "memory-rank-v1"

export interface RerankWeights {
  scopeBoost: number
  kindBoost: Record<string, number>
  importanceBoost: number
  confidenceBoost: number
  mandatoryConstraintBoost: number
  stalePenalty: number
  conflictPenalty: number
  redundancyPenalty: number
}

/** 默认权重（v1）：强约束信号最强，stale/冲突/冗余显著惩罚 */
export const DEFAULT_WEIGHTS: RerankWeights = {
  scopeBoost: 0.15, // × (scopeRank/7)
  kindBoost: { CONSTRAINT: 0.25, DECISION: 0.15, FAILURE: 0.1, PITFALL: 0.1, CONVENTION: 0.05 },
  importanceBoost: 0.2, // × importance
  confidenceBoost: 0.1, // × confidence
  mandatoryConstraintBoost: 0.5, // 适用 scope 内的 ACTIVE CONSTRAINT
  stalePenalty: 0.3,
  conflictPenalty: 0.2,
  redundancyPenalty: 0.1,
}

export interface RerankInput {
  memoryId: string
  rrfScore: number
  kind: string
  status: MemoryStatus
  importance: number
  confidence: number
  scopeType: string
  scopeValue: string
  /** 与已选高分项近重复（由 context-builder 阶段标记，重排阶段先打罚分） */
  redundant?: boolean
  /** 与其他候选项存在未决冲突 */
  conflicted?: boolean
}

export interface RerankResult {
  memoryId: string
  finalScore: number
  scoreBreakdown: Record<string, number>
  whySelected: string[]
}

export function rerankOne(
  input: RerankInput,
  scopeCtx: ScopeContext,
  weights: RerankWeights = DEFAULT_WEIGHTS,
): RerankResult {
  const rank = scopeRank(input.scopeType as Parameters<typeof scopeRank>[0]) / 7
  const scopeBoost = weights.scopeBoost * rank
  const kindBoost = weights.kindBoost[input.kind] ?? 0
  const importanceBoost = weights.importanceBoost * input.importance
  const confidenceBoost = weights.confidenceBoost * input.confidence
  const mandatory =
    input.kind === "CONSTRAINT" && input.status === "ACTIVE" ? weights.mandatoryConstraintBoost : 0
  const stalePenalty = input.status === "STALE" ? weights.stalePenalty : 0
  const conflictPenalty = input.conflicted ? weights.conflictPenalty : 0
  const redundancyPenalty = input.redundant ? weights.redundancyPenalty : 0

  const finalScore =
    input.rrfScore + scopeBoost + kindBoost + importanceBoost + confidenceBoost + mandatory
    - stalePenalty - conflictPenalty - redundancyPenalty

  const why: string[] = [`rrf=${input.rrfScore.toFixed(4)}`]
  if (scopeBoost > 0) why.push(`scopeBoost(${input.scopeType}:${input.scopeValue})`)
  if (kindBoost > 0) why.push(`kindBoost(${input.kind})`)
  if (mandatory > 0) why.push("mandatoryConstraint")
  if (stalePenalty > 0) why.push("stalePenalty（诊断模式）")
  if (conflictPenalty > 0) why.push("conflictPenalty")
  if (redundancyPenalty > 0) why.push("redundancyPenalty")

  return {
    memoryId: input.memoryId,
    finalScore,
    scoreBreakdown: {
      rrfScore: input.rrfScore,
      scopeBoost,
      kindBoost,
      importanceBoost,
      confidenceBoost,
      mandatoryConstraintBoost: mandatory,
      stalePenalty: -stalePenalty,
      conflictPenalty: -conflictPenalty,
      redundancyPenalty: -redundancyPenalty,
    },
    whySelected: why,
  }
}
