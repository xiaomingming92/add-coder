/*
 * 轮 1 契约测试：Gate→MetricSnapshot 幂等采证（Spec §1 §GateMetric）
 *
 * 覆盖验收项：
 *  - 同 {gate}:{planKeyword}:{runId} 重放 → skipped_duplicate，不产生重复快照
 *  - 采证异常 → bypassed + degradedReason，不抛异常（fail-open）
 *  - 失败路径审计密度不低于成功路径（ADD-6）
 *  - 耗时增量可度量（≤50ms 验收项）
 */
import { describe, it, expect, vi } from "vitest"
import {
  buildGateSourceRef,
  buildGateCaptureDetail,
  deriveGateRunId,
  formatGateCaptureSummary,
  writeGateMetric,
  GATE_METRIC_TYPE,
  GATE_CAPTURE_TOLERANCE_MS,
  type GateWriterDeps,
} from "../../templates/core/scripts/mcp-server/shared/memory/metrics/gate-writer.js"

interface Row {
  id: string
  repositoryRef: string
  metricType: string
  sourceRef: string
  value: number
}

function fakeDb(seed: Row[] = []) {
  const rows = [...seed]
  let seq = seed.length
  const delegate = {
    findUnique: vi.fn(({ where }: { where: Record<string, unknown> }) => {
      const key = (where.repositoryRef_metricType_sourceRef ?? {}) as Record<string, string>
      const found =
        rows.find(
          (r) =>
            r.repositoryRef === key.repositoryRef &&
            r.metricType === key.metricType &&
            r.sourceRef === key.sourceRef,
        ) ?? null
      return Promise.resolve(found)
    }),
    upsert: vi.fn(({ create }: { create: Record<string, unknown> }) => {
      const row = { ...(create as unknown as Row), id: `metric-${++seq}` }
      rows.push(row)
      return Promise.resolve(row)
    }),
  }
  return { delegate, rows }
}

const baseInput = {
  gate: "check_dps" as const,
  planKeyword: "add-coder-agent-memory-closure",
  runId: "run-001",
  score: 83,
  repository: "repo-key",
  dimensionScores: { semantic: 66, entropy: 93 },
}

describe("buildGateSourceRef", () => {
  it("三段式拼接，空值归一为 '-'", () => {
    expect(buildGateSourceRef("check_dps", "plan-a", "run-1")).toBe("check_dps:plan-a:run-1")
    expect(buildGateSourceRef("check_rahs", "", "run-1")).toBe("check_rahs:-:run-1")
    expect(buildGateSourceRef("check_dps", "plan-a", "  ")).toBe("check_dps:plan-a:-")
  })

  it("同输入恒等（幂等键稳定）", () => {
    const a = buildGateSourceRef("check_dps", "p", "r")
    const b = buildGateSourceRef("check_dps", "p", "r")
    expect(a).toBe(b)
  })
})

describe("writeGateMetric 幂等重放", () => {
  it("首次写入 → written，且 metricType 默认取 DPS_TOTAL", async () => {
    const { delegate, rows } = fakeDb()
    const deps: GateWriterDeps = { metricDb: delegate }
    const result = await writeGateMetric(baseInput, deps)
    expect(result.outcome).toBe("written")
    expect(result.metricId).toBeTruthy()
    expect(rows).toHaveLength(1)
    expect(rows[0].metricType).toBe(GATE_METRIC_TYPE.check_dps)
  })

  it("同 runId 二次执行 → skipped_duplicate，快照计数不变", async () => {
    const { delegate, rows } = fakeDb()
    const deps: GateWriterDeps = { metricDb: delegate }
    const first = await writeGateMetric(baseInput, deps)
    const second = await writeGateMetric(baseInput, deps)
    expect(first.outcome).toBe("written")
    expect(second.outcome).toBe("skipped_duplicate")
    expect(second.metricId).toBe(first.metricId)
    expect(rows).toHaveLength(1)
    expect(delegate.upsert).toHaveBeenCalledTimes(1)
  })

  it("并发唯一键冲突（P2002）→ skipped_duplicate，不抛异常", async () => {
    const delegate = {
      findUnique: vi.fn(() => Promise.resolve(null)),
      upsert: vi.fn(() =>
        Promise.reject(Object.assign(new Error("Unique constraint failed"), { code: "P2002" })),
      ),
    }
    const result = await writeGateMetric(baseInput, { metricDb: delegate })
    expect(result.outcome).toBe("skipped_duplicate")
  })

  it("不同 runId → 各自成行（不误判重复）", async () => {
    const { delegate, rows } = fakeDb()
    const deps: GateWriterDeps = { metricDb: delegate }
    await writeGateMetric(baseInput, deps)
    await writeGateMetric({ ...baseInput, runId: "run-002" }, deps)
    expect(rows).toHaveLength(2)
  })
})

describe("writeGateMetric 失败旁路（fail-open）", () => {
  it("底层异常 → bypassed + degradedReason，且不抛异常", async () => {
    const delegate = {
      findUnique: vi.fn(() => Promise.reject(new Error("connection refused"))),
      upsert: vi.fn(),
    }
    const result = await writeGateMetric(baseInput, { metricDb: delegate })
    expect(result.outcome).toBe("bypassed")
    expect(result.degradedReason).toContain("connection refused")
  })

  it("repository 为空 → bypassed（拒绝跨库采证）", async () => {
    const { delegate } = fakeDb()
    const result = await writeGateMetric({ ...baseInput, repository: "" }, { metricDb: delegate })
    expect(result.outcome).toBe("bypassed")
    expect(result.degradedReason).toContain("repositoryRef")
  })

  it("score 非有限数值 → bypassed", async () => {
    const { delegate } = fakeDb()
    const result = await writeGateMetric({ ...baseInput, score: Number.NaN }, { metricDb: delegate })
    expect(result.outcome).toBe("bypassed")
  })
})

describe("buildGateCaptureDetail 审计密度（ADD-6）", () => {
  it("三态返回同构字段集（失败路径不更稀疏）", async () => {
    const { delegate } = fakeDb()
    const deps: GateWriterDeps = { metricDb: delegate }
    const written = await writeGateMetric(baseInput, deps)
    const duplicate = await writeGateMetric(baseInput, deps)
    const bypassed = await writeGateMetric({ ...baseInput, repository: "" }, deps)

    const keys = [written, duplicate, bypassed].map((r) =>
      Object.keys(buildGateCaptureDetail(baseInput, r)).sort().join(","),
    )
    expect(keys[0]).toBe(keys[1])
    expect(keys[0]).toBe(keys[2])

    const detail = buildGateCaptureDetail(baseInput, bypassed)
    expect(detail.outcome).toBe("bypassed")
    expect(detail.degradedReason).toBeTruthy()
    expect(detail.dimensionCount).toBe(2)
  })

  it("耗时增量可度量，并可判定是否越过 50ms 容差", async () => {
    let clock = 0
    const { delegate } = fakeDb()
    const deps: GateWriterDeps = { metricDb: delegate, now: () => (clock += 80) }
    const result = await writeGateMetric(baseInput, deps)
    const detail = buildGateCaptureDetail(baseInput, result)
    expect(result.elapsedMs).toBeGreaterThan(0)
    expect(GATE_CAPTURE_TOLERANCE_MS).toBe(50)
    expect(detail.overTolerance).toBe(true)
  })
})

describe("deriveGateRunId 内容派生幂等键", () => {
  it("同内容 → 同 runId（重放判重）；内容变化 → 新 runId", () => {
    const a = deriveGateRunId("check_dps", "plan-x", "plan-content-v1")
    const b = deriveGateRunId("check_dps", "plan-x", "plan-content-v1")
    const c = deriveGateRunId("check_dps", "plan-x", "plan-content-v2")
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(a.startsWith("auto-")).toBe(true)
    expect(a.length).toBe("auto-".length + 12)
  })

  it("门禁与关键词参与派生（跨门禁/跨 Plan 不碰撞）", () => {
    const dps = deriveGateRunId("check_dps", "plan-x", "same")
    const rahs = deriveGateRunId("check_rahs", "plan-x", "same")
    const other = deriveGateRunId("check_dps", "plan-y", "same")
    expect(new Set([dps, rahs, other]).size).toBe(3)
  })

  it("内容派生 + writeGateMetric 组合：同内容重放不新增快照", async () => {
    const { delegate, rows } = fakeDb()
    const deps: GateWriterDeps = { metricDb: delegate }
    const seed = "plan+spec+review 内容快照"
    const runId = deriveGateRunId("check_dps", "plan-x", seed)
    const first = await writeGateMetric({ ...baseInput, runId, planKeyword: "plan-x" }, deps)
    const second = await writeGateMetric({ ...baseInput, runId, planKeyword: "plan-x" }, deps)
    expect(first.outcome).toBe("written")
    expect(second.outcome).toBe("skipped_duplicate")
    expect(rows).toHaveLength(1)
  })
})

describe("formatGateCaptureSummary 响应摘要", () => {
  it("三态均产出非空单行摘要", () => {
    const details = [
      { outcome: "written", sourceRef: "check_dps:p:auto-1", elapsedMs: 3, metricId: "m1" },
      { outcome: "skipped_duplicate", sourceRef: "check_dps:p:auto-1", elapsedMs: 2, metricId: "m1" },
      { outcome: "bypassed", sourceRef: "check_dps:p:auto-1", elapsedMs: 7, degradedReason: "boom" },
    ]
    for (const d of details) {
      const line = formatGateCaptureSummary(d)
      expect(line).toContain(String(d.outcome))
      expect(line).toContain(String(d.sourceRef))
    }
    expect(formatGateCaptureSummary(details[2])).toContain("评分不受影响")
    expect(formatGateCaptureSummary({ ...details[0], elapsedMs: 70, overTolerance: true })).toContain("容差")
  })
})
