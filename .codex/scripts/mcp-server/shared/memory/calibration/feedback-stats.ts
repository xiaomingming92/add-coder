/*
 * 反馈统计（Plan rank-calibration Task 1.1 / Spec §1 §FeedbackStats）
 *
 * 职责边界（**这是三工具分工的第一环**）：只做**聚合**，不做拟合、不做权重建议。
 * 通道归属由调用方提供（从 Recall 审计的 scoreBreakdown/fusedChannels + 各通道位次推导），
 * 本模块不猜测来源 —— 猜错通道会让后续拟合学到错的信号。
 *
 * 统计口径（Spec §1）：
 *  - 有用 = USED | USEFUL；无用 = IRRELEVANT | OUTDATED | CONTRADICTED | HARMFUL；
 *  - **UNKNOWN 及其他未知取值不计入分母**（避免用未知样本稀释/污染有用率）；
 *  - 样本数不足 → status="insufficient"（**此时不得据此改权重**）；
 *  - 无样本的通道返回 total=0 / usefulRate=0，不用默认值伪装。
 */

export type FeedbackChannel = "lexical" | "vector"

export const USEFUL_OUTCOMES = ["USED", "USEFUL"] as const
export const NOT_USEFUL_OUTCOMES = ["IRRELEVANT", "OUTDATED", "CONTRADICTED", "HARMFUL"] as const
export const DEFAULT_MIN_SAMPLES = 5

export interface FeedbackSample {
  memoryId: string
  /** 该条在最终排序中的位次（null = 未入选） */
  rank: number | null
  outcome: string
  /** 检出该条的通道集合（调用方从召回审计推导，可多通道） */
  channels: readonly FeedbackChannel[]
}

export interface ChannelStat {
  useful: number
  total: number
  usefulRate: number
}

export interface ChannelOutcomeStats {
  /** 可分类样本数（分母：排除 UNKNOWN 等未分类 outcome） */
  samples: number
  status: "ok" | "insufficient"
  byChannel: Record<FeedbackChannel, ChannelStat>
  byRankBucket: { rank: 1 | 2 | 3 | 4 | 5; useful: number; total: number; usefulRate: number }[]
  /** 未分类 outcome 的数量（可审计：有多少样本被排除在分母外） */
  unclassified: number
}

function classify(outcome: string): "useful" | "not-useful" | "unclassified" {
  if ((USEFUL_OUTCOMES as readonly string[]).includes(outcome)) return "useful"
  if ((NOT_USEFUL_OUTCOMES as readonly string[]).includes(outcome)) return "not-useful"
  return "unclassified"
}

function rate(useful: number, total: number): number {
  return total === 0 ? 0 : Number((useful / total).toFixed(4))
}

export function aggregateFeedback(
  samples: readonly FeedbackSample[],
  opts: { minSamples?: number } = {},
): ChannelOutcomeStats {
  const minSamples = opts.minSamples ?? DEFAULT_MIN_SAMPLES

  const byChannel: Record<FeedbackChannel, ChannelStat> = {
    lexical: { useful: 0, total: 0, usefulRate: 0 },
    vector: { useful: 0, total: 0, usefulRate: 0 },
  }
  const buckets = [1, 2, 3, 4, 5].map((rank) => ({ rank: rank as 1 | 2 | 3 | 4 | 5, useful: 0, total: 0 }))

  let classified = 0
  let unclassified = 0

  for (const sample of samples) {
    const kind = classify(sample.outcome)
    if (kind === "unclassified") {
      unclassified++
      continue
    }
    classified++
    const useful = kind === "useful"
    for (const channel of new Set(sample.channels)) {
      if (!byChannel[channel]) continue
      byChannel[channel].total++
      if (useful) byChannel[channel].useful++
    }
    if (sample.rank != null && sample.rank >= 1 && sample.rank <= 5) {
      const bucket = buckets[sample.rank - 1]
      bucket.total++
      if (useful) bucket.useful++
    }
  }

  return {
    samples: classified,
    status: classified < minSamples ? "insufficient" : "ok",
    byChannel: {
      lexical: { ...byChannel.lexical, usefulRate: rate(byChannel.lexical.useful, byChannel.lexical.total) },
      vector: { ...byChannel.vector, usefulRate: rate(byChannel.vector.useful, byChannel.vector.total) },
    },
    byRankBucket: buckets.map((b) => ({ ...b, usefulRate: rate(b.useful, b.total) })),
    unclassified,
  }
}
