/*
 * 查询词项抽取（双后端 LIKE/bigram 通道共用）—— **薄封装**
 *
 * [2026-09-21 收敛] 切分实现已迁到单一真源 `cjk-tokenize.ts`（`expandForQuery`）。
 * 本文件只保留既有导出名与签名（调用方不变），**禁止在此再写第二份切分实现**。
 *
 * 为什么收敛：词法基线换成 bigram 分词 FTS 后，写入侧与查询侧必须共用同一 tokenization；
 * 两份实现必然漂移，且漂移后表现为"索引在、命中不了"这类难查的召回缺陷。
 */
import { expandForQuery } from "./cjk-tokenize.js"

/** 拉丁/数字词（≥2 字符）+ CJK 连续段的滑动二元组（委托 `cjk-tokenize.ts`） */
export function extractQueryTerms(query: string): string[] {
  return expandForQuery(query)
}
