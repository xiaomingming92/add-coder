/*
 * CJK 分词器（主通道 + 兜底）用例 — 轮 4
 *
 * 关键约束：**测试必须 hermetic**——jieba 是 native optionalDependency，可能未安装；
 * 因此这里只断言"契约与降级行为"，不断言"一定走 jieba"（装了也不该让 CI 依赖平台二进制）。
 */
import { describe, expect, it } from "vitest"
import {
  expandForIndexWithMethod,
  expandForQueryWithMethod,
  jiebaUnavailableReason,
  segmentForMatch,
} from "../../templates/core/scripts/mcp-server/shared/memory/retrieval/cjk-segmenter.js"
import { tokenize } from "../../templates/core/scripts/mcp-server/shared/memory/retrieval/cjk-tokenize.js"

describe("segmentForMatch（jieba 主 / bigram 兜底）", () => {
  it("返回 terms 与 method（method 必须是已知两值之一）", () => {
    const r = segmentForMatch("新增端口")
    expect(Array.isArray(r.terms)).toBe(true)
    expect(["jieba", "bigram"]).toContain(r.method)
    expect(r.terms.length).toBeGreaterThan(0)
  })

  it("jieba 不可用时 method=bigram，且 terms 与 bigram 契约完全一致", () => {
    if (segmentForMatch("端口").method === "jieba") return // 装了 jieba 的机器跳过该断言
    expect(segmentForMatch("新增端口").method).toBe("bigram")
    expect(segmentForMatch("新增端口").terms).toEqual(tokenize("新增端口"))
    expect(jiebaUnavailableReason()).toBeTruthy() // 降级必须有可诊断原因，不静默
  })

  it("写入侧与查询侧同一实现（读写同源）", () => {
    const text = "新增端口配置"
    const indexed = expandForIndexWithMethod(text)
    const queried = expandForQueryWithMethod(text)
    expect(indexed.text.split(" ")).toEqual(queried.terms)
    expect(indexed.method).toBe(queried.method)
  })

  it("空串不抛错（返回空 terms）", () => {
    const r = segmentForMatch("")
    expect(r.terms).toEqual([])
  })

  it("中英混排：拉丁词保留在 token 中（两种分词器都满足）", () => {
    const terms = segmentForMatch("postgres 端口 5432").terms
    expect(terms.join(" ")).toMatch(/postgres|5432/)
  })
})
