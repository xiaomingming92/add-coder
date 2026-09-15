/*
 * 轮 1 契约测试：反馈统计（Spec §1 §FeedbackStats）
 *
 * 覆盖：口径正确性（USED/USEFUL 有用；UNKNOWN 不进分母）、多通道双计、位次分桶、
 *       阈值边界（<5 insufficient）、无样本通道不伪装默认值、同输入可复现、失败路径同结构。
 */
import { describe, expect, it } from "vitest"
import {
  DEFAULT_MIN_SAMPLES,
  aggregateFeedback,
  type FeedbackSample,
} from "../../../templates/core/scripts/mcp-server/shared/memory/calibration/feedback-stats.js"

const s = (
  memoryId: string,
  outcome: string,
  rank: number | null,
  channels: readonly ("lexical" | "vector")[] = ["lexical"],
): FeedbackSample => ({ memoryId, outcome, rank, channels })

describe("aggregateFeedback 口径", () => {
  it("USED/USEFUL 计有用；IRRELEVANT 等计无用", () => {
    const stats = aggregateFeedback([
      s("m1", "USED", 1),
      s("m2", "USEFUL", 2),
      s("m3", "IRRELEVANT", 3),
      s("m4", "HARMFUL", 4),
      s("m5", "OUTDATED", 5),
    ])
    expect(stats.samples).toBe(5)
    expect(stats.status).toBe("ok")
    expect(stats.byChannel.lexical).toEqual({ useful: 2, total: 5, usefulRate: 0.4 })
  })

  it("UNKNOWN 与未知取值不进分母，但计入 unclassified（可审计）", () => {
    const stats = aggregateFeedback([
      s("m1", "USED", 1),
      s("m2", "UNKNOWN", 2),
      s("m3", "SOMETHING_ELSE", 3),
    ])
    expect(stats.samples).toBe(1)
    expect(stats.unclassified).toBe(2)
    expect(stats.byChannel.lexical.total).toBe(1) // 只有 USED 那条进统计
    expect(stats.byChannel.lexical.usefulRate).toBe(1)
  })
})

describe("多通道归属", () => {
  it("同一条被两个通道检出时，两通道各计一次（不重复计同通道）", () => {
    const stats = aggregateFeedback([
      s("m1", "USEFUL", 1, ["lexical", "vector"]),
      s("m2", "IRRELEVANT", 2, ["vector", "vector"]), // 重复通道 → 去重
    ])
    expect(stats.byChannel.lexical).toEqual({ useful: 1, total: 1, usefulRate: 1 })
    expect(stats.byChannel.vector).toEqual({ useful: 1, total: 2, usefulRate: 0.5 })
  })

  it("无样本通道返回 total=0 / usefulRate=0（不用默认值伪装）", () => {
    const stats = aggregateFeedback([s("m1", "USED", 1, ["lexical"])])
    expect(stats.byChannel.vector).toEqual({ useful: 0, total: 0, usefulRate: 0 })
  })
})

describe("位次分桶", () => {
  it("rank 1–5 各自成桶；rank>5 与 null 不计入桶（仍计入总数）", () => {
    const stats = aggregateFeedback([
      s("m1", "USED", 1),
      s("m2", "IRRELEVANT", 1),
      s("m3", "USED", 3),
      s("m4", "USED", 9),
      s("m5", "USED", null),
    ])
    expect(stats.samples).toBe(5)
    expect(stats.byRankBucket[0]).toMatchObject({ rank: 1, useful: 1, total: 2, usefulRate: 0.5 })
    expect(stats.byRankBucket[2]).toMatchObject({ rank: 3, useful: 1, total: 1, usefulRate: 1 })
    expect(stats.byRankBucket[4]).toMatchObject({ rank: 5, useful: 0, total: 0, usefulRate: 0 })
    const bucketTotal = stats.byRankBucket.reduce((sum, b) => sum + b.total, 0)
    expect(bucketTotal).toBe(3) // rank=9 与 null 不入桶
  })
})

describe("冷启动门控（三工具分工的边界）", () => {
  it("样本 < 5 → insufficient（此时不得改权重）", () => {
    const four = aggregateFeedback([s("1", "USED", 1), s("2", "USED", 2), s("3", "USED", 3), s("4", "USED", 4)])
    expect(four.samples).toBe(4)
    expect(four.status).toBe("insufficient")
  })

  it("恰好 5 条 → ok；阈值可配置", () => {
    const five = ["1", "2", "3", "4", "5"].map((id, i) => s(id, "USEFUL", i + 1))
    expect(aggregateFeedback(five).status).toBe("ok")
    expect(aggregateFeedback(five, { minSamples: 6 }).status).toBe("insufficient")
    expect(DEFAULT_MIN_SAMPLES).toBe(5)
  })

  it("失败路径与成功路径返回同构字段（ADD-6）", () => {
    const empty = aggregateFeedback([])
    const ok = aggregateFeedback(["1", "2", "3", "4", "5"].map((id, i) => s(id, "USED", i + 1)))
    expect(Object.keys(empty).sort()).toEqual(Object.keys(ok).sort())
    expect(Object.keys(empty.byChannel.lexical).sort()).toEqual(Object.keys(ok.byChannel.lexical).sort())
    expect(empty.status).toBe("insufficient")
  })
})

describe("确定性与纯度", () => {
  it("同输入两次调用结果完全一致（纯函数）", () => {
    const input = [s("m1", "USED", 1, ["lexical", "vector"]), s("m2", "IRRELEVANT", 2, ["vector"])]
    expect(aggregateFeedback(input)).toEqual(aggregateFeedback(input))
  })

  it("不修改入参", () => {
    const input = [s("m1", "USED", 1)]
    const snapshot = JSON.stringify(input)
    aggregateFeedback(input)
    expect(JSON.stringify(input)).toBe(snapshot)
  })
})
