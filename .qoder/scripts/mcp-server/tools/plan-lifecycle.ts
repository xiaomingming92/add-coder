/*
 * Plan 生命周期工具（2026-09-21 Plan `add-coder-plan-close-entry-plan-v1`）
 *
 * `plan_update` —— Plan 关闭/重开的**唯一 MCP 入口**（此前库层 transitionPlanLifecycle 齐备但零调用方：
 * add-coder 库 36 条 ACTIVE 从未关闭；farm-agent 的 2 次关闭靠一次性脚本/人工改库，且无审计）。
 *
 * 语义边界（人类 2026-09-21 决策，写死在这里避免混用）：
 * - `round` = **施工轮次**（既有 PlanRound）：每轮原子实施完成由 plan_round_close 递增，跨重开全局单调；
 * - `reopenCycle` = **重开代数**：每次 CLOSED→REOPENED 递增，只在 `PLAN_REOPENED` 审计里出现，不参与轮次；
 * - `REOPENED` 是**瞬态**：PUL（Policy-Update-Loop）重开后完成新一轮 Step 0 即回 `ACTIVE`；
 *   恢复路径固定为 plan_status + 上一轮 handoff + query_audit_logs(PLAN_REOPENED) → 只补受策略影响的增量 Task。
 */
import * as z from "zod/v4"
import type { ToolRegistrar } from "./registrar.js"
import { textResponse, errorResponse } from "../shared/response.js"
import { prisma } from "../shared/prisma.js"
import { getRuntimeContext } from "../shared/env.js"
import { PlanLifecycleStatusSchema, type PlanLifecycleStatus } from "../shared/plan-lifecycle.js"
import { transitionPlanLifecycle } from "../shared/plan-lifecycle-mutation.js"
import { writeDevOperation } from "../shared/dev-operation.js"

interface PlanRowLite {
  lifecycle: PlanLifecycleStatus
  revision: number
  totalTasks: number
  doneTasks: number
}

export interface UpdatePlanLifecycleParams {
  planName: string
  target: PlanLifecycleStatus
  reason?: string | null
  policyRef?: string | null
  force?: boolean
  expectedRevision?: number
}

export interface UpdatePlanLifecycleResult {
  ok: boolean
  /** ok=false 时的拒绝原因（前置校验/不存在等），供工具与脚本共用同一措辞 */
  error?: string
  from?: PlanLifecycleStatus
  to?: PlanLifecycleStatus
  revision?: number
  idempotent?: boolean
  forced?: boolean
  blockers?: string[]
  /** lastClosedRound = null 表示未知（无 PlanRound 表且审计里无 ROUND_CLOSED），不编造 0 */
  reopen?: { reopenCycle: number; lastClosedRound: number | null; policyRef: string | null } | null
  audit?: { ok: boolean; detail: string }
}

/**
 * 上次施工轮次（重开时要写进审计：上次停在第几轮）。
 * 优先读 PlanRound 表；当前 add.prisma **未定义 PlanRound 模型**（本轮实测 planRound delegate 不存在）⇒
 * 回退到审计：取该 Plan 最近一条 `ROUND_CLOSED` 的 afterState.round；都没有则返回 null（**显式未知**，不编 0）。
 */
async function resolveLastClosedRound(
  database: typeof prisma,
  context: ReturnType<typeof getRuntimeContext>,
  planName: string,
): Promise<number | null> {
  const delegate = (database as unknown as {
    planRound?: { findFirst(a: unknown): Promise<unknown> }
  }).planRound
  if (delegate) {
    const row = (await delegate.findFirst({
      where: { projectKey: context.projectKey, planName },
      orderBy: { round: "desc" },
    })) as { round?: number } | null
    return row?.round ?? 0
  }
  const rec = (await database.devOperation.findFirst({
    where: {
      projectKey: context.projectKey,
      producerAdapterKey: context.adapterKey,
      planKeyword: planName,
      action: "ROUND_CLOSED",
    },
    orderBy: { createdAt: "desc" },
  })) as { afterState?: { round?: number } } | null
  return typeof rec?.afterState?.round === "number" ? rec.afterState.round : null
}

/**
 * Plan 生命周期更新的**唯一实现**：MCP 工具 `plan_update` 与脚本 `scripts/plan-close.ts` 共用，
 * 避免"工具一份、脚本一份"的漂移（2026-09-21 决策）。
 */
export async function updatePlanLifecycle(
  database: typeof prisma,
  context: ReturnType<typeof getRuntimeContext>,
  params: UpdatePlanLifecycleParams,
): Promise<UpdatePlanLifecycleResult> {
  const { planName, target } = params
  const scope = { projectKey: context.projectKey, adapterKey: context.adapterKey }
  const plan = (await database.planRecord.findFirst({ where: { ...scope, planName } })) as unknown as PlanRowLite | null
  if (!plan) return { ok: false, error: `当前 RuntimeContextKey 下不存在 Plan: ${planName}（先 plan_track 扫描入库）` }
  if (plan.lifecycle === target) {
    return { ok: true, from: plan.lifecycle, to: plan.lifecycle, revision: plan.revision, idempotent: true }
  }

  const blockers: string[] = []
  if (plan.totalTasks > 0 && plan.doneTasks < plan.totalTasks) {
    blockers.push(`tasks 未完成：${plan.doneTasks}/${plan.totalTasks}`)
  }
  const hitl = (await database.hitlRecord.findFirst({
    where: { ...scope, planName, type: "PLAN" },
    orderBy: { round: "desc" },
  })) as unknown as { status: string } | null
  if (!hitl) blockers.push("缺少 PLAN 类型 HITL 记录（审批链未留痕）")
  else if (hitl.status !== "TONGYI") blockers.push(`最新 PLAN HITL 状态为 ${hitl.status}（需 TONGYI）`)
  if (target === "REOPENED" && !params.policyRef) blockers.push("REOPENED 必须给 policyRef（PUL 追溯：哪条策略触发重开）")
  if (blockers.length > 0 && !params.force) {
    return {
      ok: false,
      error: `前置校验未通过，拒绝 ${planName} → ${target}:\n- ${blockers.join("\n- ")}\n（force 可越过，但必须给 reason）`,
      blockers,
    }
  }
  if (blockers.length > 0 && !params.reason) {
    return { ok: false, error: `force 越过前置校验时必须提供 reason：\n- ${blockers.join("\n- ")}`, blockers }
  }

  const updated = await transitionPlanLifecycle(database as never, {
    context,
    planName,
    to: target,
    expectedRevision: params.expectedRevision,
  })

  const reopen = target === "REOPENED"
    ? {
        // DevOperation 的适配器列名是 producerAdapterKey（不是 PlanRecord 的 adapterKey）
        reopenCycle: ((await database.devOperation.count({
          where: {
            projectKey: context.projectKey,
            producerAdapterKey: context.adapterKey,
            planKeyword: planName,
            action: "PLAN_REOPENED",
          },
        })) as unknown as number) + 1,
            lastClosedRound: await resolveLastClosedRound(database, context, planName),
        policyRef: params.policyRef ?? null,
      }
    : null

  let audit: { ok: boolean; detail: string }
  try {
    await writeDevOperation(database as never, {
      context,
      toolName: "plan_update",
      planKeyword: planName,
      action: `PLAN_${target}`,
      targetType: "PLAN",
      targetId: planName,
      beforeState: { lifecycle: plan.lifecycle, revision: plan.revision },
      afterState: { lifecycle: updated.lifecycle, revision: updated.revision, forced: params.force === true, blockers, ...(reopen ?? {}) },
      reason: params.reason ?? `plan_update ${plan.lifecycle} → ${target}`,
    })
    audit = { ok: true, detail: "DevOperation 已写入（shared/dev-operation.ts）" }
  } catch (e) {
    audit = { ok: false, detail: `DevOperation 写入失败: ${e instanceof Error ? e.message : String(e)}` }
  }

  return {
    ok: true,
    from: plan.lifecycle,
    to: updated.lifecycle,
    revision: updated.revision,
    forced: params.force === true,
    blockers,
    reopen,
    audit,
  }
}

export function registerPlanLifecycleTools(server: ToolRegistrar) {
  const runtimeContext = getRuntimeContext()
  const scope = { projectKey: runtimeContext.projectKey, adapterKey: runtimeContext.adapterKey }

  server.registerTool("plan_update", {
    description:
      "更新 Plan 生命周期（关闭/重开的唯一入口，复用状态机 + 事务 + NOTIFY + 统一审计）。\n" +
      "lifecycle 取值即真源枚举（DRAFT/ACTIVE/BLOCKED/REJECTED/CLOSED/REOPENED/ABANDONED）。\n" +
      "注意两个状态机不要混：TONGYI/BOHUI 属审批状态机；ABANDONED = 放弃该 Plan（生命周期决定），且可逆（→ACTIVE 复活）。\n" +
      "驳回语义：REJECTED = 不继续（BOHUI 落此态），后续可 CLOSED（归档）/ REOPENED（重启）/ ABANDONED（放弃）。\n" +
      "幂等：已是目标态 → idempotent=true（不 bump revision、不写审计）。\n" +
      "前置校验（默认严格）：tasks 全部完成 + 最新 PLAN HITL 为 TONGYI；force 可越过但必须给 reason（会写进审计）。\n" +
      "REOPENED = 瞬态重开（PUL 场景）：reopenCycle 递增、policyRef 记录触发策略；round（施工轮次）不被重置。",
    inputSchema: z.object({
      planName: z.string().describe("Plan 名称"),
      lifecycle: PlanLifecycleStatusSchema.optional().describe("目标生命周期状态（7 值，含 ABANDONED）"),
      reason: z.string().optional().describe("原因（force 必填；会写入审计）"),
      policyRef: z.string().optional().describe("PUL：触发重开的策略/规则引用（REOPENED 必填）"),
      force: z.boolean().optional().describe("越过前置校验（必须同时给 reason）"),
      expectedRevision: z.number().optional().describe("乐观锁：revision 不匹配则拒绝（并行会话防撞）"),
    }),
  }, async (args: Record<string, unknown>) => {
    try {
      const planName = String(args.planName ?? "")
      if (!planName) return errorResponse("planName 必填")
      const target = args.lifecycle as PlanLifecycleStatus | undefined
      if (!target) return errorResponse("未传 lifecycle：本工具只做生命周期更新（进度刷新请用 plan_track）")
      const reason = (args.reason as string | undefined)?.trim() || null
      const policyRef = (args.policyRef as string | undefined)?.trim() || null
      const force = args.force === true
      const expectedRevision = args.expectedRevision as number | undefined

      // 单一实现：编排（前置校验 + 迁移 + PUL 元数据 + 审计）在 updatePlanLifecycle，与脚本共用
      const result = await updatePlanLifecycle(prisma, runtimeContext, {
        planName, target, reason, policyRef, force, expectedRevision,
      })
      if (!result.ok) return errorResponse(result.error ?? "plan_update 失败")
      return textResponse(JSON.stringify(result, null, 2))
    } catch (e) {
      return errorResponse(`plan_update 失败: ${e instanceof Error ? e.message : String(e)}`)
    }
  })
}
