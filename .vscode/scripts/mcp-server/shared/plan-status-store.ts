import type { HitlRow, PlanRow } from "./db-types.js"
import { HitlRowSchema, PlanRowSchema, validatedDelegate } from "./db-types.js"
import type { PlanStatusStore } from "./plan-lifecycle.js"

/**
 * 数据库是 lifecycle 真相源。所有查询都强制携带 RuntimeContextKey，禁止同名
 * Plan 在 adapter 间串线；LISTEN/NOTIFY 只负责唤醒本 store 重新查询。
 */
export function createPrismaPlanStatusStore(client: Record<string, unknown>): PlanStatusStore {
  const plans = validatedDelegate<PlanRow>(client.planRecord, PlanRowSchema, "PlanRecord")
  const hitls = validatedDelegate<HitlRow>(client.hitlRecord, HitlRowSchema, "HitlRecord")

  return {
    async findPlan({ context, planName, planId, activeOnly }) {
      const where: Record<string, unknown> = {
        projectKey: context.projectKey,
        adapterKey: context.adapterKey,
      }
      if (planName) where.planName = planName
      if (planId) where.id = planId
      if (activeOnly) where.lifecycle = { in: ["ACTIVE", "BLOCKED"] }
      return plans.findFirst({ where, orderBy: { updatedAt: "desc" } })
    },
    async findLatestPlanApproval({ context, planName }) {
      const record = await hitls.findFirst({
        where: {
          projectKey: context.projectKey,
          adapterKey: context.adapterKey,
          planName,
          type: "PLAN",
        },
        orderBy: { round: "desc" },
      })
      return record?.status ?? null
    },
  }
}
