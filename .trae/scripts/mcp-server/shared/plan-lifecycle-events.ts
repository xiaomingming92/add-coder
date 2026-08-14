import { randomUUID } from "crypto"
import * as z from "zod/v4"
import type { RuntimeContextKey } from "./runtime-context.js"

export const PLAN_LIFECYCLE_CHANNEL = "add_plan_lifecycle_changed_v1"

export const PlanLifecycleChangedEnvelopeSchema = z.object({
  schemaVersion: z.literal(1),
  eventId: z.string().min(1),
  projectKey: z.string().min(1),
  adapterKey: z.string().min(1),
  planId: z.string().min(1),
  revision: z.number().int().nonnegative(),
})

export type PlanLifecycleChangedEnvelope = z.infer<typeof PlanLifecycleChangedEnvelopeSchema>

export interface PrismaNotifyTransaction {
  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<number>
}

export function createPlanLifecycleChangedEnvelope(input: {
  context: RuntimeContextKey
  planId: string
  revision: number
  eventId?: string
}): PlanLifecycleChangedEnvelope {
  return {
    schemaVersion: 1,
    eventId: input.eventId ?? randomUUID(),
    projectKey: input.context.projectKey,
    adapterKey: input.context.adapterKey,
    planId: input.planId,
    revision: input.revision,
  }
}

export function parsePlanLifecycleChangedEnvelope(payload: string | undefined): PlanLifecycleChangedEnvelope | null {
  if (!payload) return null
  try {
    const parsed: unknown = JSON.parse(payload)
    const result = PlanLifecycleChangedEnvelopeSchema.safeParse(parsed)
    return result.success ? result.data : null
  } catch {
    return null
  }
}

export function isLifecycleEventForContext(
  envelope: PlanLifecycleChangedEnvelope,
  context: RuntimeContextKey,
): boolean {
  return envelope.projectKey === context.projectKey && envelope.adapterKey === context.adapterKey
}

export async function publishPlanLifecycleChanged(
  tx: PrismaNotifyTransaction,
  envelope: PlanLifecycleChangedEnvelope,
): Promise<void> {
  const payload = JSON.stringify(envelope)
  await tx.$executeRaw`SELECT pg_notify(${PLAN_LIFECYCLE_CHANNEL}, ${payload})`
}
