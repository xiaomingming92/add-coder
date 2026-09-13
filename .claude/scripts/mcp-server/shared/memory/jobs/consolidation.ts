/*
 * Consolidation 异步任务（Spec §10，Plan §9.2 Post-Handoff 行）
 *
 * 职责（全部 fail-open 隔离：单步失败不影响他步，错误入报告）：
 *  1. drainEvidenceQueue —— 采证队列落库
 *  2. 重复检测 —— 同 repositoryRef+contentHash 多行 → 报告（不自动合并，人审）
 *  3. 冲突队列 —— CANDIDATE/PENDING 与 ACTIVE 高相似 → 报告（不自动激活，Plan §3）
 *  4. 指标候选 —— AddMetricSnapshot 连续异常 streak 命中 → 创建 CANDIDATE（幂等）
 *  5. Handoff Digest —— HANDOFF Evidence → HANDOFF_DIGEST Candidate（幂等，绝不直接 ACTIVE）
 *  6. 刷新 L1 快照 —— 供 session-start Hook 注入
 */
import type {
  AddMemoryEvidenceRow,
  AddMemoryEvidenceLinkRow,
  AddMemoryRow,
  AddMetricSnapshotRow,
  TableDelegate,
} from "../../db-types.js"
import { detectConflicts, type Conflict } from "../domain/conflicts.js"
import { contentHash } from "../domain/dedup.js"
import { detectAnomalyStreak, type MetricPoint } from "../domain/metric-candidate.js"
import { buildHandoffDigest } from "../domain/handoff-digest.js"
import { drainEvidenceQueue, type DrainResult } from "./evidence-collector.js"
import { refreshL1Snapshot, type SnapshotDeps, type SnapshotResult } from "./snapshot.js"

export interface ConsolidationDeps extends SnapshotDeps {
  memoryDb: TableDelegate<AddMemoryRow>
  evidenceDb: Pick<TableDelegate<AddMemoryEvidenceRow>, "upsert" | "findMany">
  linkDb: Pick<TableDelegate<AddMemoryEvidenceLinkRow>, "findFirst" | "create">
  metricDb: TableDelegate<AddMetricSnapshotRow>
}

export interface ConsolidationReport {
  drain: DrainResult
  duplicates: { contentHash: string; ids: string[] }[]
  conflictQueue: { candidateId: string; topic: string; conflicts: Conflict[] }[]
  metricCandidatesCreated: string[]
  handoffDigestsCreated: string[]
  snapshot: SnapshotResult | null
  errors: string[]
}

export async function runConsolidation(deps: ConsolidationDeps): Promise<ConsolidationReport> {
  const report: ConsolidationReport = {
    drain: { processed: 0, skipped: 0, errors: [], newOffset: 0 },
    duplicates: [],
    conflictQueue: [],
    metricCandidatesCreated: [],
    handoffDigestsCreated: [],
    snapshot: null,
    errors: [],
  }

  // 1. 采证队列落库
  try {
    report.drain = await drainEvidenceQueue(deps)
  } catch (e) {
    report.errors.push(`drain: ${e instanceof Error ? e.message : String(e)}`)
  }

  // 2/3. 重复检测 + 冲突队列（共享一次全量读取）
  try {
    const rows = await deps.memoryDb.findMany({
      where: { repositoryRef: deps.repositoryRef, status: { notIn: ["REJECTED", "ARCHIVED"] } },
      take: 500,
    })
    const byHash = new Map<string, string[]>()
    for (const r of rows) {
      const arr = byHash.get(r.contentHash) ?? []
      arr.push(r.id)
      byHash.set(r.contentHash, arr)
    }
    for (const [hash, ids] of byHash) {
      if (ids.length > 1) report.duplicates.push({ contentHash: hash, ids })
    }
    const actives = rows.filter((r) => r.status === "ACTIVE")
    for (const c of rows.filter((r) => r.status === "CANDIDATE" || r.status === "PENDING")) {
      const conflicts = detectConflicts(c, actives)
      if (conflicts.length > 0) report.conflictQueue.push({ candidateId: c.id, topic: c.topic, conflicts })
    }
  } catch (e) {
    report.errors.push(`dedup/conflicts: ${e instanceof Error ? e.message : String(e)}`)
  }

  // 4. 指标候选（Plan §10：连续异常 streak 才生成，内容必须是可验证结论）
  try {
    const metrics = await deps.metricDb.findMany({
      where: { repositoryRef: deps.repositoryRef },
      orderBy: { measuredAt: "asc" },
      take: 500,
    })
    const byType = new Map<string, MetricPoint[]>()
    for (const m of metrics) {
      const arr = byType.get(m.metricType) ?? []
      arr.push({
        repositoryRef: m.repositoryRef,
        metricType: m.metricType,
        value: m.value,
        baseline: m.baseline,
        planKeyword: m.planKeyword,
        measuredAt: m.measuredAt,
        sourceRef: m.sourceRef,
      })
      byType.set(m.metricType, arr)
    }
    for (const points of byType.values()) {
      const proposal = detectAnomalyStreak(points)
      if (!proposal) continue
      const hash = contentHash(proposal.content)
      const existing = await deps.memoryDb.findFirst({
        where: {
          repositoryRef: deps.repositoryRef,
          contentHash: hash,
          scopeType: "REPOSITORY",
          scopeValue: deps.repositoryRef,
          status: { notIn: ["REJECTED", "ARCHIVED"] },
        },
      })
      if (existing) continue // 幂等：已提过同结论
      const created = await deps.memoryDb.create({
        data: {
          kind: "PATTERN",
          topic: proposal.topic,
          content: proposal.content,
          scopeType: "REPOSITORY",
          scopeValue: deps.repositoryRef,
          repositoryRef: deps.repositoryRef,
          contentHash: hash,
          createdBy: "memory-jobs:consolidation",
        },
      })
      for (const ref of proposal.evidenceSourceRefs) {
        const ev = await deps.evidenceDb.upsert({
          where: {
            repositoryRef_sourceType_sourceRef_contentHash: {
              repositoryRef: deps.repositoryRef, sourceType: "DPS_GATE", sourceRef: ref, contentHash: contentHash(ref),
            },
          },
          create: {
            repositoryRef: deps.repositoryRef, sourceType: "DPS_GATE", sourceRef: ref,
            excerpt: ref.slice(0, 500), contentHash: contentHash(ref),
          },
          update: {},
        })
        const linked = await deps.linkDb.findFirst({ where: { memoryId: created.id, evidenceId: ev.id } })
        if (!linked) await deps.linkDb.create({ data: { memoryId: created.id, evidenceId: ev.id } })
      }
      report.metricCandidatesCreated.push(created.id)
    }
  } catch (e) {
    report.errors.push(`metric-candidates: ${e instanceof Error ? e.message : String(e)}`)
  }

  // 5. Handoff Digest（Plan §3.1 轮 2）：HANDOFF Evidence → HANDOFF_DIGEST Candidate
  //    幂等去重靠 dedupKey 派生的 contentHash；绝不直接置 ACTIVE（只产 CANDIDATE）
  try {
    const handoffEvidence = await deps.evidenceDb.findMany({
      where: { repositoryRef: deps.repositoryRef, sourceType: "HANDOFF" },
      orderBy: { occurredAt: "asc" },
      take: 200,
    })
    for (const ev of handoffEvidence) {
      const proposal = buildHandoffDigest(
        { handoffRef: ev.sourceRef, excerpt: ev.excerpt, planKeyword: ev.planKeyword },
        { repositoryRef: deps.repositoryRef },
      )
      const existing = await deps.memoryDb.findFirst({
        where: {
          repositoryRef: deps.repositoryRef,
          contentHash: proposal.contentHash,
          scopeType: proposal.scopeType,
          scopeValue: proposal.scopeValue,
          status: { notIn: ["REJECTED", "ARCHIVED"] },
        },
      })
      if (existing) {
        // 幂等：同一交接 evidence 的摘要已入队过 → 仅补齐证据关联
        const linkedAlready = await deps.linkDb.findFirst({
          where: { memoryId: existing.id, evidenceId: ev.id },
        })
        if (!linkedAlready) {
          await deps.linkDb.create({
            data: { memoryId: existing.id, evidenceId: ev.id },
          })
        }
        continue
      }
      const created = await deps.memoryDb.create({
        data: {
          kind: proposal.kind,
          status: "CANDIDATE", // 绝不直接 ACTIVE
          topic: proposal.topic,
          content: proposal.content,
          scopeType: proposal.scopeType,
          scopeValue: proposal.scopeValue,
          repositoryRef: deps.repositoryRef,
          contentHash: proposal.contentHash,
          importance: 0.6,
          confidence: 0.5,
          createdBy: "memory-jobs:consolidation",
          metadata: { ...proposal.metadata, dedupKey: proposal.dedupKey, evidenceId: ev.id },
        },
      })
      const linked = await deps.linkDb.findFirst({
        where: { memoryId: created.id, evidenceId: ev.id },
      })
      if (!linked) {
        await deps.linkDb.create({
          data: { memoryId: created.id, evidenceId: ev.id },
        })
      }
      report.handoffDigestsCreated.push(created.id)
    }
  } catch (e) {
    report.errors.push(`handoff-digest: ${e instanceof Error ? e.message : String(e)}`)
  }

  // 6. 刷新 L1 快照
  try {
    report.snapshot = await refreshL1Snapshot(deps)
  } catch (e) {
    report.errors.push(`snapshot: ${e instanceof Error ? e.message : String(e)}`)
  }

  return report
}
