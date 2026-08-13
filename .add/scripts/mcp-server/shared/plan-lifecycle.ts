import type { RuntimeContextKey } from "./runtime-context.js"

export const PLAN_LIFECYCLE_STATUSES = [
  "DRAFT",
  "ACTIVE",
  "BLOCKED",
  "REJECTED",
  "CLOSED",
  "ABANDONED",
] as const

export type PlanLifecycleStatus = (typeof PLAN_LIFECYCLE_STATUSES)[number]
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
  DRAFT: ["ACTIVE", "REJECTED", "ABANDONED"],
  ACTIVE: ["BLOCKED", "CLOSED", "ABANDONED"],
  BLOCKED: ["ACTIVE", "CLOSED", "ABANDONED"],
  REJECTED: ["DRAFT", "ACTIVE", "ABANDONED"],
  CLOSED: [],
  ABANDONED: [],
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
