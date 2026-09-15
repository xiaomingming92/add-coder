/*
 * 轮 2 契约测试：冷启动批量拟合与 train/test 切分（Spec §2 §BatchFit + §2 修订）
 *
 * 覆盖：切分确定性（同输入同 split）、切分单位是 query（不跨集泄漏）、冷启动门控、
 *       网格搜索命中真值（注入目标函数）、边界命中标注、残差语义、纯函数可复现。
 */
import { describe, expect, it } from "vitest"
import {
  DEFAULT_MIN_SAMPLES,
  DEFAULT_WEIGHTS_V3,
  fitWeights,
  splitByQuery,
  surrogateObjective,
  type FitSample,
} from "../../../templates/core/scripts/mcp-server/shared/memory/calibration/batch-fit.js"

const queries = Array.from({ length: 10 }, (_, i) => `q${String(i + 1).padStart(2, "0")}`)

function samplesFor(queryIds: readonly string[]): FitSample[] {
  return queryIds.flatMap((queryId) => [
    { queryId, memoryId: `${queryId}-m1`, relevant: true, ranks: { lexical: 1 } },
    { queryId, memoryId: `${queryId}-m2`, relevant: false, ranks: { lexical: 4 } },
  ])
}

describe("splitByQuery train/test 切分", () => {
  it("同输入 → 同 split（确定性，与传入顺序无关）", () => {
    const a = splitByQuery(queries)
    const b = splitByQuery([...queries].reverse())
    expect(a).toEqual(b)
  })

  it("切分单位是 query：两集不相交且并集完整", () => {
    const split = splitByQuery(queries, { testRatio: 0.4 })
    const train = new Set(split.trainQueries)
    const test = new Set(split.testQueries)
    expect([...train].some((q) => test.has(q))).toBe(false)
    expect(new Set([...split.trainQueries, ...split.testQueries])).toEqual(new Set(queries))
    expect(split.testQueries.length).toBe(4)
    expect(split.trainQueries.length).toBe(6)
  })

  it("单条 query 也不会切空 train", () => {
    const split = splitByQuery(["only-one"], { testRatio: 0.5 })
    expect(split.trainQueries).toHaveLength(1)
    expect(split.testQueries).toHaveLength(0)
  })

  it("splitId 随样本集合变化（防跨集复用报告）", () => {
    expect(splitByQuery(queries).splitId).not.toBe(splitByQuery([...queries, "q11"]).splitId)
  })
})

describe("fitWeights 冷启动门控（三工具分工边界）", () => {
  it("train 样本 < 5 → method=default 且回落现行常数，不产出拟合结果", () => {
    const split = splitByQuery(["q1", "q2"], { testRatio: 0.5 })
    const result = fitWeights(samplesFor(["q1", "q2"]), split)
    expect(result.method).toBe("default")
    expect(result.weights).toEqual({ ...DEFAULT_WEIGHTS_V3 })
    expect(result.residual).toBe(1)
    expect(DEFAULT_MIN_SAMPLES).toBe(5)
  })

  it("样本充足 → method=grid 并给出残差", () => {
    const split = splitByQuery(queries, { testRatio: 0.4 })
    const result = fitWeights(samplesFor(queries), split)
    expect(result.method).toBe("grid")
    expect(result.trainSamples).toBeGreaterThanOrEqual(DEFAULT_MIN_SAMPLES)
    expect(result.testSamples).toBeGreaterThan(0)
    expect(result.residual).toBeGreaterThanOrEqual(0)
    expect(result.residual).toBeLessThanOrEqual(1)
  })
})

describe("fitWeights 网格搜索（注入目标函数）", () => {
  // 构造一个人为最优在 vectorWeight=0.5 / rrfK=20 的目标函数
  const target = { vectorWeight: 0.5, boostScale: 1, rrfK: 20 }
  const objective = (w: { vectorWeight: number; boostScale: number; rrfK: number }) =>
    1 - Math.min(1, Math.abs(w.vectorWeight - target.vectorWeight) + Math.abs(w.rrfK - target.rrfK) / 60)

  it("能找到搜索空间内的最优组合", () => {
    const split = splitByQuery(queries, { testRatio: 0.4 })
    const result = fitWeights(samplesFor(queries), split, { objective })
    expect(result.weights.vectorWeight).toBe(0.5)
    expect(result.weights.rrfK).toBe(20)
    expect(result.method).toBe("grid")
  })

  it("最优落在空间边界时标注 boundaryHit", () => {
    const split = splitByQuery(queries, { testRatio: 0.4 })
    const edgeObjective = (w: { vectorWeight: number }) => w.vectorWeight // 单调递增 → 最优撞上界
    const result = fitWeights(samplesFor(queries), split, { objective: edgeObjective })
    expect(result.boundaryHit).toBe(true)
    expect(result.weights.vectorWeight).toBe(0.8)
  })

  it("同输入两次调用结果完全一致（纯函数）", () => {
    const split = splitByQuery(queries, { testRatio: 0.4 })
    const a = fitWeights(samplesFor(queries), split, { objective })
    const b = fitWeights(samplesFor(queries), split, { objective })
    expect(a).toEqual(b)
  })
})

describe("surrogateObjective 代理目标", () => {
  it("空样本返回 0（不抛）", () => {
    expect(surrogateObjective(DEFAULT_WEIGHTS_V3, [])).toBe(0)
  })

  it("返回值落在 0..1", () => {
    const value = surrogateObjective(DEFAULT_WEIGHTS_V3, samplesFor(queries))
    expect(value).toBeGreaterThanOrEqual(0)
    expect(value).toBeLessThanOrEqual(1)
  })
})
