/*
 * Token-budget 上下文构建（Plan §7.4）
 *
 * - 先保留强约束和高优先级决策，再选择 failure/pitfall/convention
 * - 同源/语义近重复项合并为一条带多个 sourceRef 的条目
 * - 超预算时返回被排除项及原因，不静默截断关键约束
 */
import { charBigrams, jaccardSimilarity } from "../domain/dedup.js"

/** 粗略 token 估算：CJK 按 1 token/字，其余按 4 字符/token */
export function estimateTokens(text: string): number {
  let cjk = 0
  let other = 0
  for (const ch of text) {
    // CJK 统一表意文字 + 平片假名 + 常用标点区
    if (/[぀-ヿ㐀-䶿一-鿿豈-﫿＀-￯]/.test(ch)) cjk++
    else other++
  }
  return cjk + Math.ceil(other / 4)
}

export interface BudgetItem {
  memoryId: string
  kind: string
  finalScore: number
  tokens: number
  content: string
  sourceRefs: string[]
}

export interface BudgetResult {
  selected: BudgetItem[]
  excluded: { memoryId: string; reason: string }[]
  usedTokens: number
}

const KIND_PRIORITY: Record<string, number> = {
  CONSTRAINT: 0,
  DECISION: 1,
  FAILURE: 2,
  PITFALL: 3,
  CONVENTION: 4,
  LESSON: 5,
  PATTERN: 5,
  FACT: 6,
  HANDOFF_DIGEST: 7,
  HYPOTHESIS: 8,
}

/** 近重复合并阈值（字符二元组 Jaccard） */
const DUP_THRESHOLD = 0.75

export function buildContext(items: BudgetItem[], maxTokens: number): BudgetResult {
  // 排序：kind 优先级 → 分数
  const sorted = [...items].sort((a, b) => {
    const ka = KIND_PRIORITY[a.kind] ?? 9
    const kb = KIND_PRIORITY[b.kind] ?? 9
    if (ka !== kb) return ka - kb
    return b.finalScore - a.finalScore
  })

  const selected: BudgetItem[] = []
  const excluded: { memoryId: string; reason: string }[] = []
  const selectedVecs: Set<string>[] = []
  let used = 0

  for (const item of sorted) {
    // 近重复合并：合并到已选项（追加 sourceRef），不重复占预算
    const vec = charBigrams(item.content)
    const dupIdx = selectedVecs.findIndex((v) => jaccardSimilarity(v, vec) >= DUP_THRESHOLD)
    if (dupIdx >= 0) {
      selected[dupIdx].sourceRefs = [...new Set([...selected[dupIdx].sourceRefs, ...item.sourceRefs])]
      excluded.push({ memoryId: item.memoryId, reason: `近重复合并进 ${selected[dupIdx].memoryId}` })
      continue
    }
    if (used + item.tokens > maxTokens) {
      // 强制约束不可静默截断：CONSTRAINT 超额时显式标记
      excluded.push({
        memoryId: item.memoryId,
        reason: item.kind === "CONSTRAINT" ? "超预算（强制约束，调用方必须知悉）" : "超预算",
      })
      continue
    }
    selected.push(item)
    selectedVecs.push(vec)
    used += item.tokens
  }
  return { selected, excluded, usedTokens: used }
}
