import type { RuntimeContextKey } from "./runtime-context.js"
import type { PlanRoundOperationRow } from "./plan-round-mutation.js"

export interface PlanRoundReadClient {
  planRecord: {
    findFirst(args: { where: Record<string, unknown>; orderBy: Record<string, unknown> }): Promise<{ id: string; planName: string } | null>
  }
  devOperation: {
    findMany(args: { where: Record<string, unknown>; orderBy: Record<string, unknown> }): Promise<PlanRoundOperationRow[]>
  }
}

export interface PlanRoundSnapshot {
  context: RuntimeContextKey
  planId: string | null
  planName: string | null
  rounds: PlanRoundOperationRow[]
}

export async function queryPlanRounds(
  client: PlanRoundReadClient,
  input: { context: RuntimeContextKey; planName?: string; planId?: string; round?: number },
): Promise<PlanRoundSnapshot> {
  const explicitPlan = Boolean(input.planName || input.planId)
  const plan = await client.planRecord.findFirst({
    where: {
      projectKey: input.context.projectKey,
      adapterKey: input.context.adapterKey,
      ...(input.planName ? { planName: input.planName } : {}),
      ...(input.planId ? { id: input.planId } : {}),
      ...(!explicitPlan ? { lifecycle: { in: ["ACTIVE", "BLOCKED"] } } : {}),
    },
    orderBy: { updatedAt: "desc" },
  })
  if (!plan) return { context: input.context, planId: null, planName: null, rounds: [] }

  const where: Record<string, unknown> = {
    projectKey: input.context.projectKey,
    producerAdapterKey: input.context.adapterKey,
    toolName: "plan_round_close",
    action: "ROUND_CLOSED",
    planKeyword: plan.planName,
  }
  if (input.round !== undefined) where.targetId = `${plan.planName}::round${input.round}`
  const rounds = await client.devOperation.findMany({ where, orderBy: { createdAt: "asc" } })
  return { context: input.context, planId: plan.id, planName: plan.planName, rounds }
}
