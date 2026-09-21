import type { RuntimeContextKey } from "./runtime-context.js"
import * as z from "zod/v4"

export const PLAN_LIFECYCLE_STATUSES = [
  "DRAFT",
  "ACTIVE",
  "BLOCKED",
  "REJECTED",
  "CLOSED",
  "REOPENED",
  "ABANDONED",
] as const

export type PlanLifecycleStatus = (typeof PLAN_LIFECYCLE_STATUSES)[number]
/** lifecycle 的**唯一 zod 真源**：工具 inputSchema / db-types / 脚本校验一律 import 它，禁止再抄字面量（2026-09-21 决策） */
export const PlanLifecycleStatusSchema = z.enum(PLAN_LIFECYCLE_STATUSES)
export type PlanApprovalStatus = "DRAFT" | "SUBMITTED" | "TONGYI" | "BOHUI"

export interface ScopedPlanStatusRow {
  id: string
  projectKey: string
  adapterKey: string
  planName: string
  lifecycle: PlanLifecycleStatus
  revision: number
  doneTasks: number
  totalTasks: number
  checklistTDone: number
  checklistT: number
}

export interface PlanStatusStore {
  findPlan(input: {
    context: RuntimeContextKey
    planName?: string
    planId?: string
    activeOnly?: boolean
  }): Promise<ScopedPlanStatusRow | null>
  findLatestPlanApproval(input: {
    context: RuntimeContextKey
    planName: string
  }): Promise<PlanApprovalStatus | null>
}

export interface PlanStatusSnapshot {
  availability: "READY"
  source: "database"
  context: Pick<RuntimeContextKey, "projectKey" | "adapterKey" | "contextId">
  planName: string
  planId: string
  lifecycle: PlanLifecycleStatus
  revision: number
  isActive: boolean
  approvalStatus: PlanApprovalStatus | null
  progress: {
    doneTasks: number
    totalTasks: number
    checklistTDone: number
    checklistT: number
  }
}

export interface NoActivePlanSnapshot {
  availability: "READY"
  source: "database"
  context: Pick<RuntimeContextKey, "projectKey" | "adapterKey" | "contextId">
  planName: null
  lifecycle: null
  isActive: false
}

export interface PlanStatusUnavailable {
  availability: "STATUS_UNAVAILABLE"
  source: "database"
  context: Pick<RuntimeContextKey, "projectKey" | "adapterKey" | "contextId">
  reason: string
}

export type PlanStatusResolution = PlanStatusSnapshot | NoActivePlanSnapshot | PlanStatusUnavailable

const ALLOWED_TRANSITIONS: Readonly<Record<PlanLifecycleStatus, readonly PlanLifecycleStatus[]>> = {
  // 两个状态机不要混：TONGYI/BOHUI 属**审批**状态机（HitlRecord.status）；
  // 下面是 **Plan 生命周期**状态机（PlanLifecycleStatus），ABANDONED = 放弃该 Plan（非审批结论）。
  DRAFT: ["ACTIVE", "REJECTED", "ABANDONED"],
  ACTIVE: ["BLOCKED", "CLOSED", "ABANDONED"],
  BLOCKED: ["ACTIVE", "CLOSED", "ABANDONED"],
  // 驳回（BOHUI → REJECTED）= 不继续；后续可 归档(CLOSED) / 重启(REOPENED) / 回起草或施工 / 放弃(ABANDONED)
  REJECTED: ["DRAFT", "ACTIVE", "CLOSED", "REOPENED", "ABANDONED"],
  // 可逆 + PUL 重开（2026-09-21 人类决策）：
  // - CLOSED → REOPENED：策略更新（PUL）或误关场景下重开，reopenCycle +1（与施工轮次 round 分离）
  // - CLOSED → ACTIVE：直达重开（无需标记代数时的简路径）
  CLOSED: ["REOPENED", "ACTIVE"],
  // REOPENED 是**瞬态**：重开后完成新一轮 Step 0 即回 ACTIVE；也允许再次 CLOSED（重开后又关）
  REOPENED: ["ACTIVE", "CLOSED"],
  // 接线（2026-09-21 人类决策）：ABANDONED 保留为生命周期状态，且与 CLOSED 同口径**可逆**（放弃后可复活）
  ABANDONED: ["ACTIVE"],
}

export function isActiveLifecycle(lifecycle: PlanLifecycleStatus): boolean {
  return lifecycle === "ACTIVE" || lifecycle === "BLOCKED"
}

export function assertLifecycleTransition(from: PlanLifecycleStatus, to: PlanLifecycleStatus): void {
  if (from === to) return
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new Error(`非法 Plan lifecycle 迁移: ${from} → ${to}`)
  }
}

function snapshotContext(context: RuntimeContextKey) {
  return { projectKey: context.projectKey, adapterKey: context.adapterKey, contextId: context.contextId }
}

export async function resolvePlanStatus(
  store: PlanStatusStore,
  context: RuntimeContextKey,
  selector?: string | { planName?: string; planId?: string; activeOnly?: boolean },
): Promise<PlanStatusResolution> {
  try {
    const selection = typeof selector === "string" ? { planName: selector } : (selector ?? {})
    const plan = await store.findPlan({
      context,
      planName: selection.planName,
      planId: selection.planId,
      activeOnly: selection.activeOnly ?? (selection.planName === undefined && selection.planId === undefined),
    })
    if (!plan) {
      return {
        availability: "READY",
        source: "database",
        context: snapshotContext(context),
        planName: null,
        lifecycle: null,
        isActive: false,
      }
    }
    if (plan.projectKey !== context.projectKey || plan.adapterKey !== context.adapterKey) {
      throw new Error("PlanStatusStore 返回了 scope 外记录")
    }
    const approvalStatus = await store.findLatestPlanApproval({ context, planName: plan.planName })
    return {
      availability: "READY",
      source: "database",
      context: snapshotContext(context),
      planName: plan.planName,
      planId: plan.id,
      lifecycle: plan.lifecycle,
      revision: plan.revision,
      isActive: isActiveLifecycle(plan.lifecycle),
      approvalStatus,
      progress: {
        doneTasks: plan.doneTasks,
        totalTasks: plan.totalTasks,
        checklistTDone: plan.checklistTDone,
        checklistT: plan.checklistT,
      },
    }
  } catch (error) {
    return {
      availability: "STATUS_UNAVAILABLE",
      source: "database",
      context: snapshotContext(context),
      reason: error instanceof Error ? error.message : String(error),
    }
  }
}
