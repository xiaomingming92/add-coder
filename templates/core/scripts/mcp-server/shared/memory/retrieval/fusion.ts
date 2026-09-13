/*
 * RRF 融合（Plan §7.3）：RRF(d) = Σ 1 / (k + rank_i(d))
 * 避免强行比较 PG、SQLite 和不同 FTS 实现的原始分值。
 * k 可配置化（写入 Recall.rankingVersion 的配置快照）。
 */
import type { RankedId } from "./types.js"

export const DEFAULT_RRF_K = 10

/**
 * 加权 RRF：score(d) = Σ_i w_i / (k + rank_i(d))
 * 通道权重让「高精度通道」主导、低精度通道只做补充（Plan 轮 3 融合迭代）。
 * weights 缺省为 1（退化为经典 RRF，保持向后兼容）。
 */
export function rrfFuse(
  lists: RankedId[][],
  k: number = DEFAULT_RRF_K,
  weights?: readonly number[],
): Map<string, number> {
  const scores = new Map<string, number>()
  lists.forEach((list, i) => {
    const w = weights?.[i] ?? 1
    if (w <= 0) return
    for (const item of list) {
      const prev = scores.get(item.memoryId) ?? 0
      scores.set(item.memoryId, prev + w / (k + item.rank))
    }
  })
  return scores
}

/** 便捷入口：融合后按分数降序返回有序 id 列表 */
export function rrfRank(
  lists: RankedId[][],
  k: number = DEFAULT_RRF_K,
  weights?: readonly number[],
): RankedId[] {
  const scores = rrfFuse(lists, k, weights)
  return [...scores.entries()]
    .map(([memoryId, score]) => ({ memoryId, rank: 0, score }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .map((r, i) => ({ ...r, rank: i + 1 }))
}
