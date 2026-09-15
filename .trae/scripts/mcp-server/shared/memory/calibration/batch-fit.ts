/*
 * 冷启动批量拟合（Plan rank-calibration Task 2.1 / Spec §2 §BatchFit）
 *
 * 三工具分工里"**从无到有**"的那一件：给定一批带 ground truth 的样本 → 输出一个**点估计**权重。
 * 不做在线跟踪（那是 Kalman），不做频谱诊断（那是 FFT）。
 *
 * 两个关键约束：
 *  1. **train/test 切分**：标注集派生的样本必须按 query 维度切分，拟合只用 train，
 *     验收只在 test —— 用验收集拟合会虚高 MRR（Spec §2 [2026-09-13 修订]）；
 *  2. **目标函数可注入**：本模块默认用内置代理目标（按通道位次加权的命中率），
 *     真实校准由 `rank-calibrate.ts` 注入"跑 recallPipeline + 算 MRR"的目标函数。
 *     这样模块保持纯函数可测，而线上用真指标而非代理指标。
 */
import { createHash } from "node:crypto"
import type { FeedbackChannel } from "./feedback-stats.js"

export const DEFAULT_MIN_SAMPLES = 5

/** 现行排序常数（无快照时的回落值 = 改造前行为，必须保持一致） */
export const DEFAULT_WEIGHTS_V3 = {
  vectorWeight: 0.3,
  boostScale: 1,
  rrfK: 10,
} as const

export interface FitWeights {
  vectorWeight: number
  boostScale: number
  rrfK: number
}

/** 一条样本：query 归属 + ground truth + 各通道位次 */
export interface FitSample {
  queryId: string
  memoryId: string
  relevant: boolean
  /** 该条在各通道中的位次（未命中该通道则不出现） */
  ranks: Partial<Record<FeedbackChannel, number>>
}

export interface FitSplit {
  splitId: string
  trainQueries: string[]
  testQueries: string[]
}

export interface WeightFitResult {
  weights: FitWeights
  /** 1 − 目标函数最优值（目标函数应返回 0..1 的归一化收益） */
  residual: number
  samples: number
  trainSamples: number
  testSamples: number
  method: "default" | "grid"
  splitId: string
  /** 最优解落在搜索空间边界（提示空间可能过窄） */
  boundaryHit: boolean
}

export interface SearchSpace {
  vectorWeight: number[]
  boostScale: number[]
  rrfK: number[]
}

export const DEFAULT_SEARCH_SPACE: SearchSpace = {
  vectorWeight: [0, 0.1, 0.2, 0.3, 0.5, 0.8],
  boostScale: [0.5, 1, 2],
  rrfK: [5, 10, 20, 60],
}

/** 目标函数：返回 0..1 的归一化收益（越大越好），由调用方决定是代理指标还是真实 MRR */
export type FitObjective = (weights: FitWeights, samples: readonly FitSample[]) => number

/**
 * 切分分组 = **Plan 业务闭包**（架构事实，非算法聚类）。
 * 见 Spec §2.2：单元素自身迭代（单元内）与跨单元流转（跨单元）是两条不同数据流，
 * 用临时聚类代替 Plan 闭包会让"防泄漏"退化成口径游戏。
 */
export interface QueryGroup {
  /** = planKeyword（业务闭包标识） */
  groupId: string
  queryIds: string[]
  /** 单元状态：未收敛单元的样本默认不进训练集（Spec §2.2） */
  unitState?: "closed" | "in-flight"
}

export interface GroupFold {
  testGroupId: string
  trainGroups: string[]
  testQueries: string[]
  trainQueries: string[]
}

export interface GroupedSplit {
  mode: "leave-one-group-out" | "single-holdout"
  folds: GroupFold[]
  splitId: string
  /** 簇数 < 3 → 结论不稳（明示，不隐瞒） */
  lowGroupCount: boolean
}

function hashId(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 8)
}

/**
 * 按 query 维度确定性切分（同输入 → 同 split，可复现）。
 * 切分单位是 **query** 而非样本：同一 query 的样本不能跨集，否则信息泄漏。
 */
export function splitByQuery(queryIds: readonly string[], opts: { testRatio?: number } = {}): FitSplit {
  const testRatio = opts.testRatio ?? 0.4
  const unique = [...new Set(queryIds)]
  // 以 queryId 哈希排序 → 与传入顺序无关，可复现
  const ordered = [...unique].sort((a, b) => hashId(a).localeCompare(hashId(b)))
  const testCount = Math.max(1, Math.round(ordered.length * testRatio))
  const testQueries = ordered.slice(0, Math.min(testCount, Math.max(0, ordered.length - 1)))
  const testSet = new Set(testQueries)
  const trainQueries = ordered.filter((q) => !testSet.has(q))
  return {
    splitId: hashId(`split|${ordered.join(",")}|${testRatio}`),
    trainQueries,
    testQueries,
  }
}

/**
 * 按**业务闭包**切分（Spec §2.1/§2.2）。
 *
 * - 默认 `leave-one-group-out`：逐簇留出作 test、其余作 train（每折的 test query 一条都不在 train 中）
 * - `single-holdout`：按簇哈希确定性挑 test 簇（用于簇数不足时的退化路径）
 * - 未收敛单元（`unitState:"in-flight"`）参与分组但**默认不进训练集**，避免把"进行中的偏差"学进权重
 */
export function splitByGroup(
  groups: readonly QueryGroup[],
  opts: { mode?: "leave-one-group-out" | "single-holdout"; testRatio?: number; includeInFlight?: boolean } = {},
): GroupedSplit {
  const usable = groups.filter((g) => opts.includeInFlight === true || (g.unitState ?? "closed") === "closed")
  const all = usable.length > 0 ? usable : groups
  const mode = opts.mode ?? "leave-one-group-out"
  const splitId = hashId(`groupsplit|${mode}|${all.map((g) => g.groupId).sort().join(",")}`)
  const lowGroupCount = all.length < 3

  if (mode === "single-holdout") {
    const testRatio = opts.testRatio ?? 0.4
    const ordered = [...all].sort((a, b) => hashId(a.groupId).localeCompare(hashId(b.groupId)))
    const testCount = Math.max(1, Math.min(ordered.length - 1, Math.round(ordered.length * testRatio)))
    const testGroups = ordered.slice(0, Math.max(0, testCount))
    const trainGroups = ordered.slice(testGroups.length)
    return {
      mode,
      splitId,
      lowGroupCount,
      folds: [
        {
          testGroupId: testGroups.map((g) => g.groupId).join("+"),
          trainGroups: trainGroups.map((g) => g.groupId),
          testQueries: testGroups.flatMap((g) => g.queryIds),
          trainQueries: trainGroups.flatMap((g) => g.queryIds),
        },
      ],
    }
  }

  return {
    mode,
    splitId,
    lowGroupCount,
    folds: all.map((test) => ({
      testGroupId: test.groupId,
      trainGroups: all.filter((g) => g.groupId !== test.groupId).map((g) => g.groupId),
      testQueries: [...test.queryIds],
      trainQueries: all.filter((g) => g.groupId !== test.groupId).flatMap((g) => g.queryIds),
    })),
  }
}

/** 内置代理目标：按通道位次加权命中率（AA 于 recall 的粗略替代，仅用于无注入场景与测试） */
export function surrogateObjective(weights: FitWeights, samples: readonly FitSample[]): number {
  if (samples.length === 0) return 0
  let good = 0
  let total = 0
  for (const s of samples) {
    const lexical = s.ranks.lexical != null ? (1 - weights.vectorWeight) / (weights.rrfK + s.ranks.lexical) : 0
    const vector = s.ranks.vector != null ? weights.vectorWeight / (weights.rrfK + s.ranks.vector) : 0
    const score = lexical + vector
    total += 1
    if (s.relevant && score > 0) good += 1
    else if (!s.relevant && score === 0) good += 1
  }
  return total === 0 ? 0 : Number((good / total).toFixed(6))
}

export function fitWeights(
  samples: readonly FitSample[],
  split: FitSplit,
  opts: { minSamples?: number; space?: SearchSpace; objective?: FitObjective } = {},
): WeightFitResult {
  const minSamples = opts.minSamples ?? DEFAULT_MIN_SAMPLES
  const trainSet = new Set(split.trainQueries)
  const testSet = new Set(split.testQueries)
  const train = samples.filter((s) => trainSet.has(s.queryId))
  const test = samples.filter((s) => testSet.has(s.queryId))

  const base = {
    samples: samples.length,
    trainSamples: train.length,
    testSamples: test.length,
    splitId: split.splitId,
  }

  // 冷启动门控：样本不足 → 回落现行常数，且**不产出"拟合结果"**
  if (train.length < minSamples) {
    return { ...base, weights: { ...DEFAULT_WEIGHTS_V3 }, residual: 1, method: "default", boundaryHit: false }
  }

  const space = opts.space ?? DEFAULT_SEARCH_SPACE
  const objective = opts.objective ?? surrogateObjective
  let best: FitWeights = { ...DEFAULT_WEIGHTS_V3 }
  let bestScore = -Infinity
  let hit = false

  for (const vectorWeight of space.vectorWeight) {
    for (const boostScale of space.boostScale) {
      for (const rrfK of space.rrfK) {
        const weights: FitWeights = { vectorWeight, boostScale, rrfK }
        const score = objective(weights, train)
        if (score > bestScore) {
          bestScore = score
          best = weights
          hit =
            vectorWeight === space.vectorWeight[0] ||
            vectorWeight === space.vectorWeight[space.vectorWeight.length - 1] ||
            boostScale === space.boostScale[0] ||
            boostScale === space.boostScale[space.boostScale.length - 1] ||
            rrfK === space.rrfK[0] ||
            rrfK === space.rrfK[space.rrfK.length - 1]
        }
      }
    }
  }

  return {
    ...base,
    weights: best,
    residual: Number((1 - Math.max(0, Math.min(1, bestScore))).toFixed(6)),
    method: "grid",
    boundaryHit: hit,
  }
}
