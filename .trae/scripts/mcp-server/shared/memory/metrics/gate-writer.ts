/*
 * Gate → MetricSnapshot 幂等采证（Plan §3.1 方案 A1 / Spec §1 §GateMetric）
 *
 * 设计要点：
 *  1. 与评分解耦：评分逻辑保持只读，采证在评分完成后单独提交（Review P0 #1 / Plan §2.1）；
 *  2. 幂等键：sourceRef = `{gate}:{planKeyword}:{runId}`，配合表级唯一键
 *     (repositoryRef, metricType, sourceRef) —— 同 runId 重放不产生重复快照；
 *  3. fail-open：任何异常都不向上抛，返回 outcome="bypassed" + degradedReason，
 *     由调用方保证评分照常返回（验收项「采证失败旁路」）；
 *  4. 失败路径审计密度不低于成功路径（ADD-6）：buildGateCaptureDetail 对三种 outcome
 *     返回同构字段集。
 */
import type { AddMetricSnapshotRow, TableDelegate } from "../../db-types.js"
import { AddMetricSnapshotRowSchema, validatedDelegate } from "../../db-types.js"
import { MemoryError } from "../domain/errors.js"
import { createHash } from "node:crypto"

export type GateKind = "check_dps" | "check_rahs"
export type GateWriteOutcome = "written" | "skipped_duplicate" | "bypassed"

/** 门禁指标类型字面量（Spec §10 契约登记表） */
export const GATE_METRIC_TYPE = {
  check_dps: "DPS_TOTAL",
  check_rahs: "RAHS_TOTAL",
  latency: "GATE_LATENCY_MS",
} as const

/** 采证耗时增量上限（ms）——验收项「工具响应耗时增量 ≤50ms」 */
export const GATE_CAPTURE_TOLERANCE_MS = 50

export interface GateMetricWriteInput {
  gate: GateKind
  planKeyword: string
  runId: string
  metricType?: string
  score: number
  repository: string
  dimensionScores?: Record<string, number>
  baseline?: number | null
  unit?: string | null
  specRef?: string | null
  commitSha?: string | null
}

export interface GateMetricWriteResult {
  outcome: GateWriteOutcome
  sourceRef: string
  metricId?: string
  degradedReason?: string
  elapsedMs: number
}

export interface GateWriterDeps {
  /** 采证目标表；测试可注入内存实现 */
  metricDb: Pick<TableDelegate<AddMetricSnapshotRow>, "findUnique" | "upsert">
  /** 时钟注入（测试用），默认 Date.now */
  now?: () => number
}

/**
 * 幂等键构造。空值归一为 "-"，避免出现 `::` 与前缀碰撞。
 */
export function buildGateSourceRef(gate: GateKind, planKeyword: string, runId: string): string {
  const norm = (v: string | undefined | null): string => {
    const t = (v ?? "").trim()
    return t.length > 0 ? t : "-"
  }
  return `${gate}:${norm(planKeyword)}:${norm(runId)}`
}

/**
 * 由被评分产物的内容派生 runId。
 *
 * 语义：同一份文档重复跑同一门禁 → 同一幂等键 → 判定为重复采证（skipped_duplicate）；
 * 文档内容变化 → 新幂等键 → 产生新的证据快照。这样「重放」不会因为时间戳不同而假性去重，
 * 也不需要调用方额外传参（门禁工具入参契约保持不变）。
 */
export function deriveGateRunId(gate: GateKind, planKeyword: string, seed: string): string {
  const digest = createHash("sha256")
    .update(`${gate}|${planKeyword}|${seed}`)
    .digest("hex")
  return `auto-${digest.slice(0, 12)}`
}

/** 唯一键参数（与 prisma @@unique([repositoryRef, metricType, sourceRef]) 对应） */
function uniqueWhere(repositoryRef: string, metricType: string, sourceRef: string) {
  return { repositoryRef_metricType_sourceRef: { repositoryRef, metricType, sourceRef } }
}

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  return code === "P2002"
}

/**
 * 写入一次门禁指标快照。**不抛异常**：失败返回 bypassed，由调用方继续返回评分。
 */
export async function writeGateMetric(
  input: GateMetricWriteInput,
  deps: GateWriterDeps,
): Promise<GateMetricWriteResult> {
  const now = deps.now ?? Date.now
  const startedAt = now()
  const metricType = input.metricType ?? GATE_METRIC_TYPE[input.gate]
  const sourceRef = buildGateSourceRef(input.gate, input.planKeyword, input.runId)
  const elapsed = () => Math.max(0, now() - startedAt)

  try {
    if (!input.repository || input.repository.trim().length === 0) {
      throw new MemoryError("ERR_REPOSITORY_MISMATCH", "repositoryRef 为空，拒绝采证")
    }
    if (!Number.isFinite(input.score)) {
      throw new MemoryError("ERR_INVARIANT", "score 非有限数值，拒绝采证")
    }

    const existing = await deps.metricDb.findUnique({
      where: uniqueWhere(input.repository, metricType, sourceRef),
    })
    if (existing) {
      // 同 runId 重放：既有快照是证据，不覆写
      return { outcome: "skipped_duplicate", metricId: existing.id, sourceRef, elapsedMs: elapsed() }
    }

    const created = await deps.metricDb.upsert({
      where: uniqueWhere(input.repository, metricType, sourceRef),
      create: {
        repositoryRef: input.repository,
        metricType,
        value: input.score,
        baseline: input.baseline ?? null,
        delta: input.baseline == null ? null : input.score - input.baseline,
        unit: input.unit ?? null,
        planKeyword: input.planKeyword || null,
        specRef: input.specRef ?? null,
        commitSha: input.commitSha ?? null,
        sourceRef,
        metadata: {
          gate: input.gate,
          runId: input.runId,
          dimensionScores: input.dimensionScores ?? null,
          capture: "gate-writer",
        },
        measuredAt: new Date(now()),
      },
      // 幂等：并发下由唯一键裁定，update 不改写既有证据
      update: {},
    })
    return { outcome: "written", metricId: created.id, sourceRef, elapsedMs: elapsed() }
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { outcome: "skipped_duplicate", sourceRef, elapsedMs: elapsed() }
    }
    // fail-open：采证失败绝不阻塞门禁返回评分
    return {
      outcome: "bypassed",
      sourceRef,
      degradedReason: error instanceof Error ? error.message : String(error),
      elapsedMs: elapsed(),
    }
  }
}

/**
 * 审计明细（ADD-6：成功/去重/旁路三态返回同构字段集，失败路径不得更稀疏）。
 */
export function buildGateCaptureDetail(
  input: GateMetricWriteInput,
  result: GateMetricWriteResult,
): Record<string, unknown> {
  return {
    gate: input.gate,
    planKeyword: input.planKeyword,
    runId: input.runId,
    metricType: input.metricType ?? GATE_METRIC_TYPE[input.gate],
    sourceRef: result.sourceRef,
    outcome: result.outcome,
    metricId: result.metricId ?? null,
    score: input.score,
    dimensionCount: input.dimensionScores ? Object.keys(input.dimensionScores).length : 0,
    baseline: input.baseline ?? null,
    degradedReason: result.degradedReason ?? null,
    elapsedMs: result.elapsedMs,
    overTolerance: result.elapsedMs > GATE_CAPTURE_TOLERANCE_MS,
  }
}

/** 单行摘要：供 MCP 工具在响应末尾追加（三态均返回非空文本） */
export function formatGateCaptureSummary(detail: Record<string, unknown>): string {
  const bits = [
    `结果: ${String(detail.outcome)}`,
    `幂等键: ${String(detail.sourceRef)}`,
    `耗时: ${String(detail.elapsedMs)}ms`,
  ]
  if (typeof detail.metricId === "string" && detail.metricId.length > 0) {
    bits.push(`metricId: ${detail.metricId}`)
  }
  if (typeof detail.degradedReason === "string" && detail.degradedReason.length > 0) {
    bits.push(`旁路原因: ${detail.degradedReason}（评分不受影响）`)
  }
  if (detail.overTolerance === true) {
    bits.push(`⚠️ 超出 ${GATE_CAPTURE_TOLERANCE_MS}ms 容差`)
  }
  return bits.join(" | ")
}

/**
 * 便捷装配：把 MCP 工具侧的 prisma delegate 包装为通过行校验的采证依赖。
 */
export function createGateWriterDeps(rawMetricDelegate: unknown): GateWriterDeps {
  return {
    metricDb: validatedDelegate<AddMetricSnapshotRow>(
      rawMetricDelegate,
      AddMetricSnapshotRowSchema,
      "AddMetricSnapshot",
    ),
  }
}
