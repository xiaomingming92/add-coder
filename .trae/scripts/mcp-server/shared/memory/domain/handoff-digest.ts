/*
 * Handoff Digest 候选构造（Plan §3.1 轮 2 / Spec §3 §HandoffDigest）
 *
 * 纯函数：输入 HANDOFF Evidence 行 → 输出可落库的 HANDOFF_DIGEST 候选提案。
 * 三条不变量：
 *  1. **绝不直接 ACTIVE**——提案只带 status=CANDIDATE 语义（由调用方落库时体现）；
 *  2. **幂等**——dedupKey 由「来源引用 + 摘要内容」派生，同一 evidence 重放得到同一键；
 *  3. **内容是可验证结论**，不是裸数值或空串：excerpt 为空时显式标注「摘要待人工补充」。
 */
import { contentHash, normalizeContent } from "./dedup.js"

export const HANDOFF_DIGEST_KIND = "HANDOFF_DIGEST" as const

/** 摘要正文最大字符数（超出截断并标注） */
export const HANDOFF_EXCERPT_MAX = 300

export interface HandoffDigestInput {
  /** handoff 文档路径或引用（evidence.sourceRef） */
  handoffRef: string
  /** evidence 摘要原文 */
  excerpt: string
  /** 关联 Plan 关键词（evidence.planKeyword，可为空） */
  planKeyword?: string | null
}

export interface HandoffDigestProposal {
  kind: typeof HANDOFF_DIGEST_KIND
  topic: string
  content: string
  scopeType: "PLAN" | "REPOSITORY"
  scopeValue: string
  contentHash: string
  dedupKey: string
  metadata: {
    handoffRef: string
    planKeyword: string | null
    excerptTruncated: boolean
  }
}

/** 从 handoff 引用提取主题名（去目录、去扩展名） */
export function handoffTopicOf(handoffRef: string): string {
  const base = handoffRef.split(/[\\/]/).pop() ?? handoffRef
  const stem = base.replace(/\.(md|markdown|txt)$/i, "")
  return stem.length > 0 ? stem : handoffRef
}

/**
 * 构造 HANDOFF_DIGEST 候选提案。
 *
 * scope 选择：有 planKeyword → PLAN scope（历史语义，默认召回需显式放行）；
 * 无 planKeyword → REPOSITORY scope（可被常规召回命中）。
 */
export function buildHandoffDigest(
  input: HandoffDigestInput,
  opts: { repositoryRef: string; maxExcerpt?: number },
): HandoffDigestProposal {
  const maxExcerpt = opts.maxExcerpt ?? HANDOFF_EXCERPT_MAX
  const topic = handoffTopicOf(input.handoffRef)
  const normalizedExcerpt = normalizeContent(input.excerpt ?? "")
  const planKeyword = input.planKeyword && input.planKeyword.trim().length > 0
    ? input.planKeyword.trim()
    : null

  const truncated = normalizedExcerpt.length > maxExcerpt
  const body = truncated
    ? `${normalizedExcerpt.slice(0, maxExcerpt)}…（已截断）`
    : normalizedExcerpt

  const content =
    body.length > 0
      ? `交接摘要 ${topic}：${body}（来源 ${input.handoffRef}）`
      : `交接文档 ${input.handoffRef} 已归档，摘要待人工补充（自动摘要为空）。`

  const scopeType: "PLAN" | "REPOSITORY" = planKeyword ? "PLAN" : "REPOSITORY"
  const scopeValue = planKeyword ?? opts.repositoryRef

  return {
    kind: HANDOFF_DIGEST_KIND,
    topic,
    content,
    scopeType,
    scopeValue,
    contentHash: contentHash(content),
    dedupKey: contentHash(`${HANDOFF_DIGEST_KIND}|${input.handoffRef}|${normalizedExcerpt}`),
    metadata: {
      handoffRef: input.handoffRef,
      planKeyword,
      excerptTruncated: truncated,
    },
  }
}
