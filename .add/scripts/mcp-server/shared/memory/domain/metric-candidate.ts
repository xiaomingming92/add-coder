/*
 * 指标到知识的转换（Plan §10）
 *
 * entropy/code quality/Gate score 只写 AddMetricSnapshot；单个数值不能自动成为长期文本记忆。
 * 候选生成需满足：同 scope 异常连续达阈值 / 多独立证据指向同根因 / 显著偏离基线且有可解释事件。
 */

export interface MetricPoint {
  repositoryRef: string
  metricType: string
  value: number
  baseline?: number | null
  planKeyword?: string | null
  measuredAt: Date
  sourceRef: string
}

export interface MetricCandidateRule {
  /** 同 scope 连续异常阈值（默认 3 次） */
  streakThreshold: number
  /** 显著偏离基线的相对幅度（默认 20%） */
  deviationRatio: number
  /** 判定"异常"的方向：高于基线为坏（higher-worse）或低于基线为坏（lower-worse） */
  direction: "higher-worse" | "lower-worse"
}

export const DEFAULT_METRIC_RULE: MetricCandidateRule = {
  streakThreshold: 3,
  deviationRatio: 0.2,
  direction: "lower-worse",
}

export interface MetricCandidateProposal {
  topic: string
  content: string
  evidenceSourceRefs: string[]
  rule: string
}

function isAnomaly(p: MetricPoint, rule: MetricCandidateRule): boolean {
  if (p.baseline == null) return false
  const dev = Math.abs(p.value - p.baseline) / (Math.abs(p.baseline) || 1)
  if (dev < rule.deviationRatio) return false
  return rule.direction === "lower-worse" ? p.value < p.baseline : p.value > p.baseline
}

/**
 * 检测「同 scope 连续异常」：按时间排序后尾部连续异常数 ≥ streakThreshold 时生成候选建议。
 * 纯函数；是否真正创建 Candidate 由调用方（consolidation job / 人工）决定。
 */
export function detectAnomalyStreak(
  points: MetricPoint[],
  rule: MetricCandidateRule = DEFAULT_METRIC_RULE,
): MetricCandidateProposal | null {
  if (points.length < rule.streakThreshold) return null
  const sorted = [...points].sort((a, b) => a.measuredAt.getTime() - b.measuredAt.getTime())
  let streak = 0
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (isAnomaly(sorted[i], rule)) streak++
    else break
  }
  if (streak < rule.streakThreshold) return null
  const last = sorted[sorted.length - 1]
  const streakPoints = sorted.slice(-streak)
  return {
    topic: `${last.metricType} 连续 ${streak} 次显著偏离基线`,
    content:
      `指标 ${last.metricType} 在最近 ${streak} 次测量中连续偏离基线超过 ${rule.deviationRatio * 100}%` +
      `（baseline=${streakPoints[0].baseline}, 最新值=${last.value}）。` +
      `建议人工审核是否形成可验证结论后再转为长期记忆。`,
    evidenceSourceRefs: streakPoints.map((p) => p.sourceRef),
    rule: `anomaly-streak>=${rule.streakThreshold} deviation>=${rule.deviationRatio} ${rule.direction}`,
  }
}

/** Gate 执行后生成 sourceRef（Review P1 #2 回流：{gate}:{planKeyword}:{runId}） */
export function metricSourceRef(gate: string, planKeyword: string, runId: string): string {
  return `${gate}:${planKeyword}:${runId}`
}
