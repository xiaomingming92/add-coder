import type { RuntimeContextKey } from "./runtime-context.js"
import { assertLifecycleTransition, type PlanLifecycleStatus } from "./plan-lifecycle.js"
import {
  createPlanLifecycleChangedEnvelope,
  publishPlanLifecycleChanged,
  type PrismaNotifyTransaction,
} from "./plan-lifecycle-events.js"

export interface PlanLifecycleMutationRow {
  id: string
  projectKey: string
  adapterKey: string
  planName: string
  lifecycle: PlanLifecycleStatus
  revision: number
}

export interface PlanLifecycleTransaction extends PrismaNotifyTransaction {
  planRecord: {
    findFirst(args: { where: Record<string, unknown> }): Promise<PlanLifecycleMutationRow | null>
    update(args: {
      where: Record<string, unknown>
      data: { lifecycle: PlanLifecycleStatus; revision: { increment: 1 } }
    }): Promise<PlanLifecycleMutationRow>
  }
}

export interface PlanLifecycleDatabase {
  $transaction<T>(work: (tx: PlanLifecycleTransaction) => Promise<T>): Promise<T>
}

export interface TransitionPlanLifecycleInput {
  context: RuntimeContextKey
  planName: string
  to: PlanLifecycleStatus
  expectedRevision?: number
}

export async function transitionPlanLifecycle(
  database: PlanLifecycleDatabase,
  input: TransitionPlanLifecycleInput,
): Promise<PlanLifecycleMutationRow> {
  return database.$transaction(async (tx) => {
    const current = await tx.planRecord.findFirst({
      where: {
        projectKey: input.context.projectKey,
        adapterKey: input.context.adapterKey,
        planName: input.planName,
      },
    })
    if (!current) {
      throw new Error(`当前 RuntimeContextKey 下不存在 Plan: ${input.planName}`)
    }
    if (current.projectKey !== input.context.projectKey || current.adapterKey !== input.context.adapterKey) {
      throw new Error("拒绝迁移 scope 外 Plan lifecycle")
    }
    if (input.expectedRevision !== undefined && current.revision !== input.expectedRevision) {
      throw new Error(`Plan lifecycle revision 冲突: expected=${input.expectedRevision}, actual=${current.revision}`)
    }
    assertLifecycleTransition(current.lifecycle, input.to)
    if (current.lifecycle === input.to) return current

    const updated = await tx.planRecord.update({
      where: { id: current.id, revision: current.revision },
      data: { lifecycle: input.to, revision: { increment: 1 } },
    })
    if (updated.revision !== current.revision + 1) {
      throw new Error(`Plan lifecycle revision 未按预期递增: ${current.revision} → ${updated.revision}`)
    }
    const envelope = createPlanLifecycleChangedEnvelope({
      context: input.context,
      planId: updated.id,
      revision: updated.revision,
    })
    await publishPlanLifecycleChanged(tx, envelope)
    return updated
  })
}
