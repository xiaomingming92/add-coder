import { randomUUID } from "crypto"
import * as z from "zod/v4"
import type { RuntimeContextKey } from "./runtime-context.js"
import type { PrismaNotifyTransaction } from "./plan-lifecycle-events.js"

export const PLAN_ROUND_CHANNEL = "add_plan_round_changed_v1"

export const PlanRoundChangedEnvelopeSchema = z.object({
  schemaVersion: z.literal(1),
  eventId: z.string().min(1),
  projectKey: z.string().min(1),
  adapterKey: z.string().min(1),
  planId: z.string().min(1),
})

export type PlanRoundChangedEnvelope = z.infer<typeof PlanRoundChangedEnvelopeSchema>

export function createPlanRoundChangedEnvelope(input: {
  context: RuntimeContextKey
  planId: string
  eventId?: string
}): PlanRoundChangedEnvelope {
  return {
    schemaVersion: 1,
    eventId: input.eventId ?? randomUUID(),
    projectKey: input.context.projectKey,
    adapterKey: input.context.adapterKey,
    planId: input.planId,
  }
}

export function parsePlanRoundChangedEnvelope(payload: string | undefined): PlanRoundChangedEnvelope | null {
  if (!payload) return null
  try {
    const parsed: unknown = JSON.parse(payload)
    const result = PlanRoundChangedEnvelopeSchema.safeParse(parsed)
    return result.success ? result.data : null
  } catch {
    return null
  }
}

export function isPlanRoundEventForContext(
  envelope: PlanRoundChangedEnvelope,
  context: RuntimeContextKey,
): boolean {
  return envelope.projectKey === context.projectKey && envelope.adapterKey === context.adapterKey
}

export async function publishPlanRoundChanged(
  tx: PrismaNotifyTransaction,
  envelope: PlanRoundChangedEnvelope,
): Promise<void> {
  const payload = JSON.stringify(envelope)
  await tx.$executeRaw`SELECT pg_notify(${PLAN_ROUND_CHANNEL}, ${payload})`
}
