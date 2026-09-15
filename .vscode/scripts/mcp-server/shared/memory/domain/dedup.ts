/*
 * 去重与内容规范化（Plan §4.4）
 * contentHash = sha256(normalize(text))；幂等键 = repositoryRef + contentHash + scopeType + scopeValue
 */
import { createHash } from "crypto"

/** 规范化：NFKC（全半角折叠）→ 小写 → 折叠全部空白为单空格 → trim */
export function normalizeContent(s: string): string {
  return s.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim()
}

export function contentHash(s: string): string {
  return createHash("sha256").update(normalizeContent(s), "utf8").digest("hex")
}

/** 幂等键（与 AddMemory 的 @@unique 约束一一对应） */
export function memoryIdempotencyKey(input: {
  repositoryRef: string
  content: string
  scopeType: string
  scopeValue: string
}): string {
  return [
    input.repositoryRef,
    contentHash(input.content),
    input.scopeType,
    input.scopeValue,
  ].join("|")
}

/** 字符二元组集合（冲突检测 / 近重复合并的轻量相似度基础，无需 embedding） */
export function charBigrams(s: string): Set<string> {
  const n = normalizeContent(s)
  const out = new Set<string>()
  for (let i = 0; i < n.length - 1; i++) out.add(n.slice(i, i + 2))
  if (n.length === 1) out.add(n)
  return out
}

export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  return inter / (a.size + b.size - inter || 1)
}
