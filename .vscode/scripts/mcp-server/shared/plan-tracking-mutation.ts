import type { RuntimeContextKey } from "./runtime-context.js"
import {
  createPlanLifecycleChangedEnvelope,
  publishPlanLifecycleChanged,
  type PrismaNotifyTransaction,
} from "./plan-lifecycle-events.js"
import type { PlanLifecycleStatus } from "./plan-lifecycle.js"

export interface TrackedPlanRow {
  id: string
  projectKey: string
  adapterKey: string
  planName: string
  lifecycle: PlanLifecycleStatus
  revision: number
}

export interface PlanTrackingTransaction extends PrismaNotifyTransaction {
  planRecord: {
    findFirst(args: { where: Record<string, unknown> }): Promise<TrackedPlanRow | null>
    create(args: { data: Record<string, unknown> }): Promise<TrackedPlanRow>
    update(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<TrackedPlanRow>
  }
}

export interface PlanTrackingDatabase {
  $transaction<T>(work: (tx: PlanTrackingTransaction) => Promise<T>): Promise<T>
}

export async function trackPlanAndPublish(
  database: PlanTrackingDatabase,
  input: {
    context: RuntimeContextKey
    planName: string
    planPath: string
    projection: Record<string, unknown>
  },
): Promise<{ created: boolean; plan: TrackedPlanRow }> {
  return database.$transaction(async (tx) => {
    const scope = {
      projectKey: input.context.projectKey,
      adapterKey: input.context.adapterKey,
      planName: input.planName,
    }
    const existing = await tx.planRecord.findFirst({ where: scope })
    const plan = existing
      ? await tx.planRecord.update({
          where: { id: existing.id, revision: existing.revision },
          data: { ...input.projection, planPath: input.planPath, revision: { increment: 1 } },
        })
      : await tx.planRecord.create({
          data: {
            ...scope,
            ...input.projection,
            planPath: input.planPath,
            lifecycle: "DRAFT",
            revision: 0,
          },
        })
    const expectedRevision = existing ? existing.revision + 1 : 0
    if (plan.revision !== expectedRevision) {
      throw new Error(`Plan track revision 未按预期变化: expected=${expectedRevision}, actual=${plan.revision}`)
    }
    await publishPlanLifecycleChanged(tx, createPlanLifecycleChangedEnvelope({
      context: input.context,
      planId: plan.id,
      revision: plan.revision,
    }))
    return { created: existing === null, plan }
  })
}
