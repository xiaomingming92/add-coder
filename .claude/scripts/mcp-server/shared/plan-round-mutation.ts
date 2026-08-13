import { createHash } from "crypto"
import type { RuntimeContextKey } from "./runtime-context.js"
import {
  createPlanRoundChangedEnvelope,
  publishPlanRoundChanged,
} from "./plan-round-events.js"
import type { PrismaNotifyTransaction } from "./plan-lifecycle-events.js"

export interface PlanRoundPlanRow {
  id: string
  projectKey: string
  adapterKey: string
  planName: string
  lifecycle: string
  revision: number
}

export interface PlanRoundOperationRow {
  id: string
  projectKey: string
  producerAdapterKey: string
  contextId: string
  toolName: string
  operationKey: string
  planKeyword: string
  action: string
  targetType: string
  targetId: string
  beforeState: unknown
  afterState: unknown
  reason: string | null
  createdAt: Date
}

export interface PlanRoundTransaction extends PrismaNotifyTransaction {
  planRecord: {
    findFirst(args: { where: Record<string, unknown> }): Promise<PlanRoundPlanRow | null>
  }
  addUser: {
    findUnique(args: { where: Record<string, unknown>; select: Record<string, unknown> }): Promise<{ id: string } | null>
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>
  }
  devOperation: {
    upsert(args: { where: Record<string, unknown>; create: Record<string, unknown>; update: Record<string, unknown> }): Promise<PlanRoundOperationRow>
  }
}

export interface PlanRoundDatabase {
  $transaction<T>(work: (tx: PlanRoundTransaction) => Promise<T>): Promise<T>
}

export interface ClosePlanRoundInput {
  context: RuntimeContextKey
  planName: string
  round: number
  beforeState: Record<string, unknown> | unknown[]
  afterState: Record<string, unknown> | unknown[]
  reason?: string
  operationKey?: string
}

export interface ClosePlanRoundResult {
  plan: PlanRoundPlanRow
  operation: PlanRoundOperationRow
}

export function defaultPlanRoundOperationKey(input: {
  context: RuntimeContextKey
  planId: string
  round: number
}): string {
  return createHash("sha256")
    .update(`${input.context.contextId}:${input.planId}:ROUND_CLOSED:${input.round}`)
    .digest("hex")
}

export async function closePlanRoundAndPublish(
  database: PlanRoundDatabase,
  input: ClosePlanRoundInput,
): Promise<ClosePlanRoundResult> {
  if (!Number.isInteger(input.round) || input.round < 1) throw new Error("round 必须是大于 0 的整数")

  return database.$transaction(async (tx) => {
    const plan = await tx.planRecord.findFirst({
      where: {
        projectKey: input.context.projectKey,
        adapterKey: input.context.adapterKey,
        planName: input.planName,
      },
    })
    if (!plan) throw new Error(`当前 RuntimeContextKey 下不存在 Plan: ${input.planName}`)
    if (plan.projectKey !== input.context.projectKey || plan.adapterKey !== input.context.adapterKey) {
      throw new Error("拒绝关闭 scope 外 PlanRound")
    }

    let user = await tx.addUser.findUnique({ where: { username: "ai-assistant" }, select: { id: true } })
    if (!user) {
      user = await tx.addUser.create({
        data: { id: "ai-assistant", username: "ai-assistant", email: "ai-assistant@internal" },
      })
    }
    const baseOperationKey = defaultPlanRoundOperationKey({
      context: input.context,
      planId: plan.id,
      round: input.round,
    })
    const operationKey = input.operationKey?.trim()
      ? createHash("sha256").update(`${baseOperationKey}:${input.operationKey.trim()}`).digest("hex")
      : baseOperationKey
    const operation = await tx.devOperation.upsert({
      where: {
        projectKey_producerAdapterKey_toolName_operationKey: {
          projectKey: input.context.projectKey,
          producerAdapterKey: input.context.adapterKey,
          toolName: "plan_round_close",
          operationKey,
        },
      },
      create: {
        userId: user.id,
        projectKey: input.context.projectKey,
        producerAdapterKey: input.context.adapterKey,
        contextId: input.context.contextId,
        toolName: "plan_round_close",
        operationKey,
        planKeyword: input.planName,
        action: "ROUND_CLOSED",
        targetType: "PLAN_ROUND",
        targetId: `${input.planName}::round${input.round}`,
        beforeState: input.beforeState,
        afterState: input.afterState,
        reason: input.reason ?? null,
      },
      update: {},
    })

    await publishPlanRoundChanged(tx, createPlanRoundChangedEnvelope({
      context: input.context,
      planId: plan.id,
    }))
    return { plan, operation }
  })
}
