/*
 * RRF 融合（Plan §7.3）：RRF(d) = Σ 1 / (k + rank_i(d))
 * 避免强行比较 PG、SQLite 和不同 FTS 实现的原始分值。
 * k 可配置化（写入 Recall.rankingVersion 的配置快照）。
 */
import type { RankedId } from "./types.js"

export const DEFAULT_RRF_K = 60

export function rrfFuse(lists: RankedId[][], k: number = DEFAULT_RRF_K): Map<string, number> {
  const scores = new Map<string, number>()
  for (const list of lists) {
    for (const item of list) {
      const prev = scores.get(item.memoryId) ?? 0
      scores.set(item.memoryId, prev + 1 / (k + item.rank))
    }
  }
  return scores
}

/** 便捷入口：融合后按分数降序返回有序 id 列表 */
export function rrfRank(lists: RankedId[][], k: number = DEFAULT_RRF_K): RankedId[] {
  const scores = rrfFuse(lists, k)
  return [...scores.entries()]
    .map(([memoryId, score]) => ({ memoryId, rank: 0, score }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .map((r, i) => ({ ...r, rank: i + 1 }))
}
