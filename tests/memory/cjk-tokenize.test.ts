/*
 * CJK 分词契约用例 — Plan add-coder-memory-cjk-bigram-baseline Task 1.4 / Spec §1
 *
 * 覆盖：1 字 / 2 字 / 4 字中文、中英混排、上限截断、幂等、空串与纯符号退化。
 */
import { describe, expect, it } from "vitest"
import {
  MAX_TOKENS,
  expandForIndex,
  expandForQuery,
  tokenize,
} from "../../templates/core/scripts/mcp-server/shared/memory/retrieval/cjk-tokenize.js"
import { extractQueryTerms } from "../../templates/core/scripts/mcp-server/shared/memory/retrieval/query-terms.js"

describe("CJK 分词契约（Spec §1）", () => {
  it("2 字中文查询可产出 token（旧 trigram 窗口 = 3 字时命中不了）", () => {
    expect(expandForQuery("端口")).toEqual(["端口"])
  })

  it("4 字以上中文段 → 滑动二元组（首 token 保留首字组合）", () => {
    expect(expandForQuery("新增端口")).toEqual(["新增", "增端", "端口"])
  })

  it("单字 CJK 保留为单字 token（不产出空集）", () => {
    expect(expandForQuery("端")).toEqual(["端"])
  })

  it("中英混排：拉丁词（≥2 字符）原样、CJK 走二元组", () => {
    const terms = expandForQuery("新增 postgres 端口")
    expect(terms).toContain("postgres")
    expect(terms).toContain("新增")
    expect(terms).toContain("端口")
  })

  it("文档侧展开 = 查询侧 token 的空格连接（两侧同契约）", () => {
    const text = "新增端口配置"
    expect(expandForIndex(text).split(" ")).toEqual(expandForQuery(text))
  })

  it("超上限按出现顺序确定性截断（不随机）", () => {
    const long = "新增端口配置".repeat(20)
    const a = tokenize(long)
    const b = tokenize(long)
    expect(a.length).toBeLessThanOrEqual(MAX_TOKENS)
    expect(a).toEqual(b)
  })

  it("幂等：同一输入重复调用结果一致", () => {
    expect(tokenize("端口 port 18999")).toEqual(tokenize("端口 port 18999"))
  })

  it("空串与纯符号/单字符拉丁输入退化为空集", () => {
    expect(expandForQuery("")).toEqual([])
    expect(expandForQuery("  ,.;!?  ")).toEqual([])
    expect(expandForQuery("a")).toEqual([])
  })

  it("query-terms 已收敛为薄封装（与真源同输出）", () => {
    for (const q of ["端口", "新增端口", "postgres 端口 5432", "端"]) {
      expect(extractQueryTerms(q)).toEqual(expandForQuery(q))
    }
  })
})
