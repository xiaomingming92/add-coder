/*
 * 轮 2 契约测试：按 Plan 业务闭包切分（Spec §2.1 grouped split + §2.2 架构对齐）
 *
 * 覆盖：整簇不泄漏（test query 一条都不在 train）、折数=簇数、lowGroupCount 标注、
 *       未收敛单元默认不进训练集、单簇退化、splitId 随分组变化。
 */
import { describe, expect, it } from "vitest"
import { splitByGroup, type QueryGroup } from "../../../templates/core/scripts/mcp-server/shared/memory/calibration/batch-fit.js"

const groups: QueryGroup[] = [
  { groupId: "add-coder-agent-memory-closure-plan-v1", queryIds: ["q1", "q2", "q3", "q4"] },
  { groupId: "add-coder-hitl-widget-runtime-gap-plan-v1", queryIds: ["q5", "q6", "q7"] },
  { groupId: "add-coder-memory-rank-calibration-plan-v1", queryIds: ["q8", "q9"] },
]

describe("splitByGroup leave-one-group-out", () => {
  it("折数 = 业务闭包数（每折留出一个 Plan）", () => {
    const split = splitByGroup(groups)
    expect(split.mode).toBe("leave-one-group-out")
    expect(split.folds).toHaveLength(3)
    expect(split.folds.map((f) => f.testGroupId)).toEqual([
      "add-coder-agent-memory-closure-plan-v1",
      "add-coder-hitl-widget-runtime-gap-plan-v1",
      "add-coder-memory-rank-calibration-plan-v1",
    ])
  })

  it("整簇不泄漏：每折 test query 一条都不出现在 train", () => {
    const split = splitByGroup(groups)
    for (const fold of split.folds) {
      const train = new Set(fold.trainQueries)
      expect(fold.testQueries.some((q) => train.has(q))).toBe(false)
      expect(fold.testQueries.length + fold.trainQueries.length).toBe(9)
    }
  })

  it("簇数 ≥3 → lowGroupCount=false；簇数 <3 → true（明示结论不稳）", () => {
    expect(splitByGroup(groups).lowGroupCount).toBe(false)
    expect(splitByGroup(groups.slice(0, 2)).lowGroupCount).toBe(true)
  })

  it("单簇退化：只有一折，train 为空但结构完整（不抛）", () => {
    const split = splitByGroup([groups[0]])
    expect(split.folds).toHaveLength(1)
    expect(split.folds[0].trainQueries).toEqual([])
    expect(split.lowGroupCount).toBe(true)
  })
})

describe("未收敛单元的处理（架构对齐：并发协议决定样本可用性）", () => {
  const withInFlight: QueryGroup[] = [
    { groupId: "closed-plan", queryIds: ["c1", "c2", "c3"], unitState: "closed" },
    { groupId: "in-flight-plan", queryIds: ["f1", "f2", "f3"], unitState: "in-flight" },
  ]

  it("默认排除未收敛单元（演进中的数据语义不稳定）", () => {
    const split = splitByGroup(withInFlight)
    const allTest = split.folds.flatMap((f) => f.testQueries)
    const allTrain = split.folds.flatMap((f) => f.trainQueries)
    expect(allTest.some((q) => q.startsWith("f"))).toBe(false)
    expect(allTrain.some((q) => q.startsWith("f"))).toBe(false)
    expect(allTest.some((q) => q.startsWith("c"))).toBe(true)
  })

  it("includeInFlight=true 时纳入（诊断场景）", () => {
    const split = splitByGroup(withInFlight, { includeInFlight: true })
    expect(split.folds).toHaveLength(2)
  })
})

describe("确定性与 single-holdout", () => {
  it("同分组两次调用 splitId 与折结构一致", () => {
    expect(splitByGroup(groups)).toEqual(splitByGroup(groups))
  })

  it("分组集合变化 → splitId 变化（防跨集复用报告）", () => {
    expect(splitByGroup(groups).splitId).not.toBe(splitByGroup(groups.slice(0, 2)).splitId)
  })

  it("single-holdout：按簇挑 test，且不与 train 重叠", () => {
    const split = splitByGroup(groups, { mode: "single-holdout", testRatio: 0.34 })
    expect(split.mode).toBe("single-holdout")
    expect(split.folds).toHaveLength(1)
    const fold = split.folds[0]
    expect(fold.testQueries.length).toBeGreaterThan(0)
    expect(fold.trainQueries.some((q) => fold.testQueries.includes(q))).toBe(false)
  })
})
