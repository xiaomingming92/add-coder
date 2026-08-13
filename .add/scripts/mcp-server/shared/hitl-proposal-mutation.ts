import type { RuntimeContextKey } from "./runtime-context.js"
import type { PlanLifecycleStatus } from "./plan-lifecycle.js"
import {
  createPlanLifecycleChangedEnvelope,
  publishPlanLifecycleChanged,
  type PrismaNotifyTransaction,
} from "./plan-lifecycle-events.js"
import type { HitlDecisionType } from "./hitl-lifecycle-mutation.js"

export interface HitlProposalPlanRow {
  id: string
  projectKey: string
  adapterKey: string
  planName: string
  lifecycle: PlanLifecycleStatus
  revision: number
}

export interface HitlProposalRow {
  id: string
  projectKey: string
  adapterKey: string
  planName: string
  round: number
  type: HitlDecisionType
  status: "DRAFT"
}

export interface HitlProposalTransaction extends PrismaNotifyTransaction {
  planRecord: {
    findFirst(args: { where: Record<string, unknown> }): Promise<HitlProposalPlanRow | null>
    create(args: { data: Record<string, unknown> }): Promise<HitlProposalPlanRow>
    update(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<HitlProposalPlanRow>
  }
  hitlRecord: {
    findFirst(args: { where: Record<string, unknown>; orderBy: Record<string, unknown> }): Promise<HitlProposalRow | null>
    create(args: { data: Record<string, unknown> }): Promise<HitlProposalRow>
  }
}

export interface HitlProposalDatabase {
  $transaction<T>(work: (tx: HitlProposalTransaction) => Promise<T>): Promise<T>
}

/** Advisory xact lock makes max(round)+1 atomic per scoped plan/type. */
export async function createHitlProposalAndPublish(
  database: HitlProposalDatabase,
  input: {
    context: RuntimeContextKey
    planName: string
    planPath: string
    planKeyword: string
    type: HitlDecisionType
  },
): Promise<{ planProvisioned: boolean; plan: HitlProposalPlanRow; hitl: HitlProposalRow }> {
  return database.$transaction(async (tx) => {
    const lockKey = `${input.context.contextId}:${input.planName}:${input.type}`
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`
    const scope = {
      projectKey: input.context.projectKey,
      adapterKey: input.context.adapterKey,
      planName: input.planName,
    }
    const existing = await tx.planRecord.findFirst({ where: scope })
    const plan = existing
      ? await tx.planRecord.update({
          where: { id: existing.id, revision: existing.revision },
          data: { revision: { increment: 1 } },
        })
      : await tx.planRecord.create({
          data: {
            ...scope,
            planPath: input.planPath,
            planKeyword: input.planKeyword,
            lifecycle: "DRAFT",
            revision: 0,
          },
        })
    const latest = await tx.hitlRecord.findFirst({
      where: { ...scope, type: input.type },
      orderBy: { round: "desc" },
    })
    const hitl = await tx.hitlRecord.create({
      data: {
        ...scope,
        type: input.type,
        round: (latest?.round ?? 0) + 1,
        status: "DRAFT",
      },
    })
    await publishPlanLifecycleChanged(tx, createPlanLifecycleChangedEnvelope({
      context: input.context,
      planId: plan.id,
      revision: plan.revision,
    }))
    return { planProvisioned: existing === null, plan, hitl }
  })
}
