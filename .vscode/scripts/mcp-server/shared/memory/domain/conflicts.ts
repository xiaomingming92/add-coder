/*
 * 冲突检测（Plan §3 治理队列 / §7.2 同级冲突不得静默覆盖）
 *
 * 首版为保守启发式（无 embedding 依赖）：同 scope 且高文本相似的
 * CONSTRAINT/DECISION 互为疑似冲突，必须进入 review，由人裁决。
 */
import { charBigrams, jaccardSimilarity } from "./dedup.js"

export interface Conflict {
  memoryId: string
  topic: string
  similarity: number
  reason: string
}

export interface ConflictCandidate {
  id?: string
  kind: string
  topic: string
  content: string
  scopeType: string
  scopeValue: string
}

export interface ConflictOptions {
  /** 相似度阈值（字符二元组 Jaccard），默认 0.6 */
  threshold?: number
  /** 参与冲突判定的 kind 集合 */
  kinds?: readonly string[]
}

const DEFAULT_CONFLICT_KINDS = ["CONSTRAINT", "DECISION", "CONVENTION"] as const

export function detectConflicts(
  candidate: ConflictCandidate,
  actives: ConflictCandidate[],
  opts: ConflictOptions = {},
): Conflict[] {
  const threshold = opts.threshold ?? 0.6
  const kinds = opts.kinds ?? DEFAULT_CONFLICT_KINDS
  if (!kinds.includes(candidate.kind)) return []
  const candVec = charBigrams(candidate.topic + " " + candidate.content)
  const out: Conflict[] = []
  for (const m of actives) {
    if (m.id && m.id === candidate.id) continue
    if (!kinds.includes(m.kind)) continue
    if (m.scopeType !== candidate.scopeType || m.scopeValue !== candidate.scopeValue) continue
    const sim = jaccardSimilarity(candVec, charBigrams(m.topic + " " + m.content))
    if (sim >= threshold) {
      out.push({
        memoryId: m.id ?? "",
        topic: m.topic,
        similarity: Math.round(sim * 1000) / 1000,
        reason: `同 scope(${m.scopeType}:${m.scopeValue}) 存在高相似 ${m.kind}，疑似冲突，需人工裁决`,
      })
    }
  }
  return out.sort((a, b) => b.similarity - a.similarity)
}
