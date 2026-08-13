import type { RuntimeContextKey } from "./runtime-context.js"
import { assertLifecycleTransition, type PlanLifecycleStatus } from "./plan-lifecycle.js"
import {
  createPlanLifecycleChangedEnvelope,
  publishPlanLifecycleChanged,
  type PrismaNotifyTransaction,
} from "./plan-lifecycle-events.js"

export type HitlDecisionStatus = "SUBMITTED" | "TONGYI" | "BOHUI"
export type HitlDecisionType = "PLAN" | "PLAN_REVIEW" | "COLLAB_CONTRACT"

export interface HitlMutationRow {
  id: string
  projectKey: string
  adapterKey: string
  planName: string
  round: number
  type: HitlDecisionType
  status: "DRAFT" | HitlDecisionStatus
  approvedAt: Date | null
  rejectedAt: Date | null
  rejectReason: string | null
}

export interface HitlPlanMutationRow {
  id: string
  projectKey: string
  adapterKey: string
  planName: string
  lifecycle: PlanLifecycleStatus
  revision: number
}

export interface HitlLifecycleTransaction extends PrismaNotifyTransaction {
  hitlRecord: {
    findFirst(args: { where: Record<string, unknown>; orderBy: Record<string, unknown> }): Promise<HitlMutationRow | null>
    update(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<HitlMutationRow>
  }
  planRecord: {
    findFirst(args: { where: Record<string, unknown> }): Promise<HitlPlanMutationRow | null>
    update(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<HitlPlanMutationRow>
  }
}

export interface HitlLifecycleDatabase {
  $transaction<T>(work: (tx: HitlLifecycleTransaction) => Promise<T>): Promise<T>
}

export interface DecideHitlInput {
  context: RuntimeContextKey
  planName: string
  type: HitlDecisionType
  status: HitlDecisionStatus
  reason?: string
}

export interface DecideHitlResult {
  previousStatus: HitlMutationRow["status"]
  hitl: HitlMutationRow
  plan: HitlPlanMutationRow
}

function targetLifecycle(
  type: HitlDecisionType,
  status: HitlDecisionStatus,
  current: PlanLifecycleStatus,
): PlanLifecycleStatus {
  if (type !== "PLAN" || status === "SUBMITTED") return current
  return status === "TONGYI" ? "ACTIVE" : "REJECTED"
}

/**
 * 审批写入、Plan revision/lifecycle 与 NOTIFY 必须在同一 Prisma transaction。
 * NOTIFY payload 只是唤醒提示；订阅端收到后必须再按自身 RuntimeContextKey 查库。
 */
export async function decideHitlAndPublish(
  database: HitlLifecycleDatabase,
  input: DecideHitlInput,
): Promise<DecideHitlResult> {
  return database.$transaction(async (tx) => {
    const scope = {
      projectKey: input.context.projectKey,
      adapterKey: input.context.adapterKey,
      planName: input.planName,
    }
    const current = await tx.hitlRecord.findFirst({
      where: { ...scope, type: input.type },
      orderBy: { round: "desc" },
    })
    if (!current) throw new Error(`未找到当前 RuntimeContextKey 的 HITL: ${input.planName}/${input.type}`)
    if (current.status === "TONGYI" || current.status === "BOHUI") {
      throw new Error(`HITL 已终态（${current.status}），不可再次更新`)
    }

    const plan = await tx.planRecord.findFirst({ where: scope })
    if (!plan) throw new Error(`未找到当前 RuntimeContextKey 的 PlanRecord: ${input.planName}`)
    if (plan.projectKey !== input.context.projectKey || plan.adapterKey !== input.context.adapterKey) {
      throw new Error("拒绝修改 scope 外 Plan")
    }

    const now = new Date()
    const hitlData: Record<string, unknown> = { status: input.status }
    if (input.status === "TONGYI") hitlData.approvedAt = now
    if (input.status === "BOHUI") {
      hitlData.rejectedAt = now
      hitlData.rejectReason = input.reason ?? null
    }
    const hitl = await tx.hitlRecord.update({ where: { id: current.id }, data: hitlData })

    const nextLifecycle = targetLifecycle(input.type, input.status, plan.lifecycle)
    assertLifecycleTransition(plan.lifecycle, nextLifecycle)
    const planData: Record<string, unknown> = { revision: { increment: 1 } }
    if (nextLifecycle !== plan.lifecycle) planData.lifecycle = nextLifecycle
    const updatedPlan = await tx.planRecord.update({
      where: { id: plan.id, revision: plan.revision },
      data: planData,
    })
    if (updatedPlan.revision !== plan.revision + 1) {
      throw new Error(`Plan revision 未按预期递增: ${plan.revision} → ${updatedPlan.revision}`)
    }

    await publishPlanLifecycleChanged(tx, createPlanLifecycleChangedEnvelope({
      context: input.context,
      planId: updatedPlan.id,
      revision: updatedPlan.revision,
    }))
    return { previousStatus: current.status, hitl, plan: updatedPlan }
  })
}
