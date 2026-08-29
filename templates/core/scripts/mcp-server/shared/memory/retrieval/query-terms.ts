/*
 * 查询词项抽取（双后端 LIKE/bigram 通道共用）
 *
 * 背景：trigram 分词器（PG pg_trgm / SQLite FTS5 trigram）是子串语义，
 * 对释义查询（如 "新端口怎么申请" vs 内容 "新增端口"）召回不足。
 * 本模块把查询分解为「拉丁词 + CJK 二元组」词项，供 LIKE 重叠通道计分。
 */
import { normalizeContent } from "../domain/dedup.js"

const MAX_TERMS = 24

/** 拉丁/数字词（≥2 字符）+ CJK 连续段的滑动二元组 */
export function extractQueryTerms(query: string): string[] {
  const norm = normalizeContent(query)
  const terms: string[] = []
  const seen = new Set<string>()
  const push = (t: string) => {
    if (!seen.has(t) && terms.length < MAX_TERMS) { seen.add(t); terms.push(t) }
  }

  // 拉丁词
  for (const m of norm.matchAll(/[a-z0-9_]{2,}/g)) push(m[0])

  // CJK 连续段 → 滑动二元组（单字段保留单字）
  for (const seg of norm.matchAll(/[㐀-鿿぀-ヿ]+/g)) {
    const s = seg[0]
    if (s.length === 1) { push(s); continue }
    for (let i = 0; i < s.length - 1; i++) push(s.slice(i, i + 2))
  }
  return terms
}
