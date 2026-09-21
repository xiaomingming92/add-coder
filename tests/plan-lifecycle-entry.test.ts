/*
 * Plan 关闭/重开入口回归（Plan `add-coder-plan-close-entry-plan-v1`）
 *
 * 覆盖五类防退化断言：
 * ① lifecycle 值**单一真源**：真源元组 = zod schema 选项 = Prisma 枚举（防"又抄一份字符串"）
 * ② 可逆 + PUL 重开：CLOSED→ACTIVE / CLOSED→REOPENED / REOPENED→ACTIVE 合法；ABANDONED 仍终态
 * ③ 入口存在生产调用点（[W]）：MCP 工具注册 + 脚本 import 同一实现（非"仅导出"）
 * ④ 幂等/前置校验/force 语义（用 stub database，不依赖真实 DB）
 * ⑤ devlog 文案防漂移：生成物里不得再出现"生成 devlog 文件"的指引（2026-09-21 统一到 MCP 决策）
 */
import { describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  PLAN_LIFECYCLE_STATUSES,
  PlanLifecycleStatusSchema,
  assertLifecycleTransition,
} from "../templates/core/scripts/mcp-server/shared/plan-lifecycle.js"
import { PlanRowSchema } from "../templates/core/scripts/mcp-server/shared/db-types.js"

// 与被测模块同口径的桩（生成 client / env 在测试进程不可用；行为测试用注入的 stub database）
vi.mock("../templates/core/scripts/mcp-server/shared/prisma.js", () => ({ prisma: {} }))
vi.mock("../templates/core/scripts/mcp-server/shared/env.js", () => ({
  getRuntimeContext: () => ({ projectKey: "k", adapterKey: "codex", contextId: "k:codex" }),
  PROJECT_ID: "add-coder",
  PROJECT_ROOT: process.cwd(),
}))

const REPO_ROOT = join(import.meta.dirname, "..")
const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), "utf-8")

describe("① lifecycle 单一真源", () => {
  it("真源元组 = zod 选项，且含 REOPENED", () => {
    expect([...PlanLifecycleStatusSchema.options]).toEqual([...PLAN_LIFECYCLE_STATUSES])
    expect(PLAN_LIFECYCLE_STATUSES).toContain("REOPENED")
  })
  it("ABANDONED 保留为生命周期状态（与审批状态机的 TONGYI/BOHUI 不是一回事）", () => {
    expect([...PLAN_LIFECYCLE_STATUSES]).toContain("ABANDONED")
    expect(PlanLifecycleStatusSchema.safeParse("ABANDONED").success).toBe(true)
    // 审批状态机的取值不得混入生命周期真源
    for (const approval of ["TONGYI", "BOHUI", "SUBMITTED"]) {
      expect(PlanLifecycleStatusSchema.safeParse(approval).success).toBe(false)
    }
  })
  it("Prisma 枚举与真源逐值一致（防漂移）", () => {
    const prismaEnum = read("prisma/add.prisma").match(/enum PlanLifecycleStatus \{([\s\S]*?)\}/)?.[1] ?? ""
    const values = prismaEnum.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("//"))
    expect(values).toEqual([...PLAN_LIFECYCLE_STATUSES])
  })
  it("db-types 的 PlanRowSchema 接受 REOPENED（改走真源 import 后不再手写字面量）", () => {
    const base = {
      id: "p1", projectKey: "k", adapterKey: "codex", planName: "x", revision: 0,
      planPath: "p", planKeyword: null, specPath: null, tasksPath: null, checklistPath: null,
      addRoutePath: null, totalTasks: 0, doneTasks: 0, checklistT: 0, checklistTDone: 0, checklistR: 0,
      dpsComposite: null, dpsCpmScore: null, dpsEntropyScore: null, dpsSemScore: null, dpsStructScore: null,
      contractName: null, contractRole: null, createdAt: new Date(), updatedAt: new Date(),
    }
    expect(PlanRowSchema.safeParse({ ...base, lifecycle: "REOPENED" }).success).toBe(true)
    expect(PlanRowSchema.safeParse({ ...base, lifecycle: "NOT_A_STATE" }).success).toBe(false)
  })
})

describe("② 可逆与 PUL 重开（同一状态机，不新增语义）", () => {
  it("重开路径合法、驳回后可归档/重启/放弃、ABANDONED 已接线且可逆", () => {
    expect(() => assertLifecycleTransition("CLOSED", "ACTIVE")).not.toThrow()
    expect(() => assertLifecycleTransition("CLOSED", "REOPENED")).not.toThrow()
    expect(() => assertLifecycleTransition("REOPENED", "ACTIVE")).not.toThrow()
    expect(() => assertLifecycleTransition("REOPENED", "CLOSED")).not.toThrow()
    // 驳回 = 不继续；后续可归档或重启
    expect(() => assertLifecycleTransition("REJECTED", "CLOSED")).not.toThrow()
    expect(() => assertLifecycleTransition("REJECTED", "REOPENED")).not.toThrow()
    // 接线：入边（放弃）+ 出边（复活）
    expect(() => assertLifecycleTransition("ACTIVE", "ABANDONED")).not.toThrow()
    expect(() => assertLifecycleTransition("REJECTED", "ABANDONED")).not.toThrow()
    expect(() => assertLifecycleTransition("ABANDONED", "ACTIVE")).not.toThrow()
  })
})

describe("③ [W] 入口生产调用点", () => {
  it("工具已注册 + 脚本与工具共用同一实现", () => {
    expect(read("templates/core/scripts/mcp-server/tools/plan-lifecycle.ts")).toMatch(/registerTool\(\s*"plan_update"/)
    expect(read("templates/core/scripts/mcp-server/tools/index.ts")).toMatch(/registerPlanLifecycleTools\(/)
    // 脚本不得自己写迁移/审计逻辑，必须 import 同一更新实现
    const script = read("templates/core/scripts/plan-close.ts")
    expect(script).toMatch(/updatePlanLifecycle/)
    expect(script).not.toMatch(/transitionPlanLifecycle\(/)
  })
})

describe("④ 幂等 / 前置校验 / force（stub database，不依赖真实 DB）", () => {
  const context = { projectKey: "k", adapterKey: "codex", contextId: "k:codex" } as never
  function stubDb(over: Record<string, unknown> = {}) {
    const calls: string[] = []
    return {
      calls,
      planRecord: {
        findFirst: async () => ({ lifecycle: "ACTIVE", revision: 3, totalTasks: 10, doneTasks: 10, ...(over.plan as object ?? {}) }),
        update: async () => { calls.push("update"); return { lifecycle: "CLOSED", revision: 4 } },
      },
      hitlRecord: { findFirst: async () => over.hitl ?? { status: "TONGYI" } },
      devOperation: { count: async () => 0, findFirst: async () => null, upsert: async () => { calls.push("audit"); return { id: "d1", operationKey: "op", createdAt: new Date(), beforeState: {}, afterState: {} } } },
      addUser: { findUnique: async () => ({ id: "ai-assistant" }), create: async () => ({ id: "ai-assistant" }) },
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({
        planRecord: {
          findFirst: async () => ({ projectKey: "k", adapterKey: "codex", planName: "p", lifecycle: "ACTIVE", revision: 3 }),
          update: async () => { calls.push("transition"); return { projectKey: "k", adapterKey: "codex", planName: "p", lifecycle: "CLOSED", revision: 4 } },
        },
        $executeRaw: async () => 0,
      }),
    }
  }

  it("幂等：已是目标态 → idempotent，不迁移不写审计", async () => {
    const { updatePlanLifecycle } = await import("../templates/core/scripts/mcp-server/tools/plan-lifecycle.js")
    const db = stubDb({ plan: { lifecycle: "CLOSED" } })
    const r = await updatePlanLifecycle(db as never, context, { planName: "p", target: "CLOSED" })
    expect(r).toMatchObject({ ok: true, idempotent: true })
    expect(db.calls).toHaveLength(0)
  })

  it("前置校验：tasks 未完成 → 拒绝并给 blocker", async () => {
    const { updatePlanLifecycle } = await import("../templates/core/scripts/mcp-server/tools/plan-lifecycle.js")
    const db = stubDb({ plan: { doneTasks: 3 } })
    const r = await updatePlanLifecycle(db as never, context, { planName: "p", target: "CLOSED" })
    expect(r.ok).toBe(false)
    expect(r.blockers?.join()).toContain("tasks 未完成：3/10")
  })

  it("force 越过必须给 reason；给了 reason 才真正迁移并写审计", async () => {
    const { updatePlanLifecycle } = await import("../templates/core/scripts/mcp-server/tools/plan-lifecycle.js")
    const noReason = await updatePlanLifecycle(stubDb({ plan: { doneTasks: 1 } }) as never, context, { planName: "p", target: "CLOSED", force: true })
    expect(noReason.ok).toBe(false)
    expect(noReason.error).toContain("必须提供 reason")

    const withReason = stubDb({ plan: { doneTasks: 1 } })
    const r = await updatePlanLifecycle(withReason as never, context, { planName: "p", target: "CLOSED", force: true, reason: "人类拍板提前关闭" })
    expect(r).toMatchObject({ ok: true, to: "CLOSED", forced: true })
    expect(withReason.calls).toContain("transition")
    expect(withReason.calls).toContain("audit")
  })
})

describe("⑤ devlog 文案防漂移（统一到 MCP）", () => {
  it("生成物不再指导生成 devlog 文件，且明确「不新建 devlog 文件」", () => {
    const rules = read("templates/core/governance/rules.ts")
    expect(rules).not.toMatch(/devlog-\{plan\}/)
    expect(rules).not.toMatch(/devlog-\*\.md/)
    expect(rules).toContain("不新建 devlog 文件")
  })
})
