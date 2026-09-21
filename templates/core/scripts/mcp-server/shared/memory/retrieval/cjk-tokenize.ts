/*
 * CJK 分词契约（单一真源）— Plan add-coder-memory-cjk-bigram-baseline Task 1.1 / Spec §1
 *
 * 为什么需要它：词法基线要从「pg_trgm 相似度 + to_tsvector('simple')」换成 **bigram 分词后的 FTS**，
 * 前提是**写入侧与查询侧共用同一套 tokenization**——否则索引里的 token 与查询 token 对不上，
 * 召回会是"看起来有索引、实际命中不了"。此前 bigram 只存在于查询侧（`query-terms.ts`），
 * 文档侧无对应展开，故本模块把两侧收敛到同一实现、同一上限。
 *
 * 约束（Spec §1 WHEN-THEN）：纯函数、无 IO、无依赖；同一输入幂等；超上限按出现顺序确定性截断。
 */
import { normalizeContent } from "../domain/dedup.js"

/** token 上限（与既有 query-terms 的 MAX_TERMS 对齐；确定性截断，不随机抽样） */
export const MAX_TOKENS = 24

/** CJK 连续段（含扩展 A / 假名，与既有 query-terms 的字符集一致） */
const CJK_SEGMENT = /[㐀-鿿぀-ヿ]+/g

/** 拉丁/数字词（≥2 字符；1 字符噪声太大，不作为独立 token） */
const LATIN_WORD = /[a-z0-9_]{2,}/g

/**
 * 统一分词：拉丁词（≥2 字符，大小写归一）+ CJK 段滑动二元组（单字段保留单字）。
 * 返回**去重且按出现顺序**的 token 数组；超 `MAX_TOKENS` 截断。
 */
export function tokenize(text: string): string[] {
  const norm = normalizeContent(text)
  const terms: string[] = []
  const seen = new Set<string>()
  const push = (t: string) => {
    if (!seen.has(t) && terms.length < MAX_TOKENS) {
      seen.add(t)
      terms.push(t)
    }
  }

  for (const m of norm.matchAll(LATIN_WORD)) push(m[0])

  for (const seg of norm.matchAll(CJK_SEGMENT)) {
    const s = seg[0]
    if (s.length === 1) {
      push(s)
      continue
    }
    for (let i = 0; i < s.length - 1; i++) push(s.slice(i, i + 2))
  }

  return terms
}

/**
 * 文档侧展开：原始文本 → 空格分隔 token 串（写入期落 `searchText`，与查询侧同契约）。
 * 例：`"新增端口"` → `"新增 增端 端口"`。
 */
export function expandForIndex(text: string): string {
  return tokenize(text).join(" ")
}

/** 查询侧展开：查询串 → token 数组（与 `expandForIndex` 同一实现、同一上限） */
export function expandForQuery(query: string): string[] {
  return tokenize(query)
}
