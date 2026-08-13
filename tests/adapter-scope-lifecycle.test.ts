import { describe, expect, it, vi } from "vitest"
import {
  assertPathInRuntimeScope,
  createRuntimeContext,
  isPathInRuntimeScope,
} from "../templates/core/scripts/mcp-server/shared/runtime-context.js"
import {
  assertLifecycleTransition,
  resolvePlanStatus,
  type PlanStatusStore,
  type ScopedPlanStatusRow,
} from "../templates/core/scripts/mcp-server/shared/plan-lifecycle.js"
import {
  createPlanLifecycleChangedEnvelope,
  isLifecycleEventForContext,
  parsePlanLifecycleChangedEnvelope,
  PLAN_LIFECYCLE_CHANNEL,
  publishPlanLifecycleChanged,
} from "../templates/core/scripts/mcp-server/shared/plan-lifecycle-events.js"
import {
  transitionPlanLifecycle,
  type PlanLifecycleDatabase,
  type PlanLifecycleMutationRow,
  type PlanLifecycleTransaction,
} from "../templates/core/scripts/mcp-server/shared/plan-lifecycle-mutation.js"
import {
  PlanLifecycleSubscriber,
  type LifecycleListenClient,
  type PgNotification,
} from "../templates/core/scripts/mcp-server/shared/plan-lifecycle-subscriber.js"
import {
  decideHitlAndPublish,
  type HitlLifecycleDatabase,
  type HitlLifecycleTransaction,
} from "../templates/core/scripts/mcp-server/shared/hitl-lifecycle-mutation.js"
import {
  trackPlanAndPublish,
  type PlanTrackingDatabase,
  type PlanTrackingTransaction,
} from "../templates/core/scripts/mcp-server/shared/plan-tracking-mutation.js"

const projectRoot = "/home/xmm/ai/add-coder"

describe("RuntimeContextKey", () => {
  it("同项目不同 adapter 共享 projectKey，但 contextId 独立", () => {
    const codex = createRuntimeContext(projectRoot, ".codex")
    const qoder = createRuntimeContext(projectRoot, ".qoder")

    expect(codex.projectKey).toBe(qoder.projectKey)
    expect(codex.adapterKey).toBe("codex")
    expect(qoder.adapterKey).toBe("qoder")
    expect(codex.contextId).not.toBe(qoder.contextId)
    expect(Object.isFrozen(codex)).toBe(true)
  })

  it("只允许当前 adapter scope 内路径", () => {
    const codex = createRuntimeContext(projectRoot, ".codex")
    expect(isPathInRuntimeScope(codex, `${projectRoot}/.codex/plans/a.md`)).toBe(true)
    expect(isPathInRuntimeScope(codex, `${projectRoot}/.qoder/plans/a.md`)).toBe(false)
    expect(() => assertPathInRuntimeScope(codex, `${projectRoot}/.qoder/plans/a.md`)).toThrow(/越出/)
  })

  it("拒绝未知 magicDir，不扫描其他目录猜 adapter", () => {
    expect(() => createRuntimeContext(projectRoot, ".unknown")).toThrow(/未知 ADD adapter/)
  })
})

describe("scoped Plan lifecycle resolver", () => {
  const context = createRuntimeContext(projectRoot, ".codex")
  const activePlan: ScopedPlanStatusRow = {
    id: "plan-codex",
    projectKey: context.projectKey,
    adapterKey: "codex",
    planName: "same-plan-v1",
    lifecycle: "ACTIVE",
    revision: 3,
    doneTasks: 11,
    totalTasks: 38,
    checklistTDone: 2,
    checklistT: 10,
  }

  it("ACTIVE 且无 Handoff 仍由 DB 判定 active", async () => {
    const findPlan = vi.fn().mockResolvedValue(activePlan)
    const store: PlanStatusStore = {
      findPlan,
      findLatestPlanApproval: vi.fn().mockResolvedValue("TONGYI"),
    }
    const result = await resolvePlanStatus(store, context)

    expect(result).toMatchObject({
      availability: "READY",
      source: "database",
      lifecycle: "ACTIVE",
      isActive: true,
      approvalStatus: "TONGYI",
    })
    expect(findPlan).toHaveBeenCalledWith({ context, planName: undefined, activeOnly: true })
  })

  it("拒绝 store 返回其他 adapter 的同名 Plan", async () => {
    const store: PlanStatusStore = {
      findPlan: vi.fn().mockResolvedValue({ ...activePlan, adapterKey: "qoder" }),
      findLatestPlanApproval: vi.fn(),
    }
    const result = await resolvePlanStatus(store, context, activePlan.planName)
    expect(result).toMatchObject({ availability: "STATUS_UNAVAILABLE", source: "database" })
  })

  it("数据库异常返回 STATUS_UNAVAILABLE，不伪装成无 Plan", async () => {
    const store: PlanStatusStore = {
      findPlan: vi.fn().mockRejectedValue(new Error("database offline")),
      findLatestPlanApproval: vi.fn(),
    }
    const result = await resolvePlanStatus(store, context)
    expect(result).toMatchObject({ availability: "STATUS_UNAVAILABLE", reason: "database offline" })
  })

  it("限制 lifecycle 迁移，CLOSED 不可由文件重新激活", () => {
    expect(() => assertLifecycleTransition("DRAFT", "ACTIVE")).not.toThrow()
    expect(() => assertLifecycleTransition("ACTIVE", "BLOCKED")).not.toThrow()
    expect(() => assertLifecycleTransition("CLOSED", "ACTIVE")).toThrow(/非法 Plan lifecycle/)
  })
})

describe("PostgreSQL lifecycle changed event", () => {
  const codex = createRuntimeContext(projectRoot, ".codex")
  const qoder = createRuntimeContext(projectRoot, ".qoder")

  it("payload 只保留最小信封；伪造 lifecycle 字段不能成为状态", () => {
    const payload = JSON.stringify({
      ...createPlanLifecycleChangedEnvelope({ context: codex, planId: "p1", revision: 4, eventId: "e1" }),
      lifecycle: "CLOSED",
    })
    const parsed = parsePlanLifecycleChangedEnvelope(payload)
    expect(parsed).toEqual({
      schemaVersion: 1,
      eventId: "e1",
      projectKey: codex.projectKey,
      adapterKey: "codex",
      planId: "p1",
      revision: 4,
    })
    expect(parsed).not.toHaveProperty("lifecycle")
  })

  it("订阅者只刷新自己的 RuntimeContextKey", () => {
    const event = createPlanLifecycleChangedEnvelope({ context: codex, planId: "p1", revision: 1 })
    expect(isLifecycleEventForContext(event, codex)).toBe(true)
    expect(isLifecycleEventForContext(event, qoder)).toBe(false)
  })

  it("通过 Prisma 参数化 raw query 发布 channel 与 payload", async () => {
    const executeRaw = vi.fn((...args: [TemplateStringsArray, ...unknown[]]) => {
      void args
      return Promise.resolve(1)
    })
    const tx = { $executeRaw: executeRaw }
    const event = createPlanLifecycleChangedEnvelope({ context: codex, planId: "p1", revision: 1, eventId: "e1" })
    await publishPlanLifecycleChanged(tx, event)

    const [strings, channel, payload] = executeRaw.mock.calls[0]
    expect(Array.from(strings).join("?")).toContain("pg_notify")
    expect(channel).toBe(PLAN_LIFECYCLE_CHANNEL)
    expect(JSON.parse(String(payload))).toEqual(event)
  })
})

describe("transactional lifecycle mutation", () => {
  const context = createRuntimeContext(projectRoot, ".codex")
  const current: PlanLifecycleMutationRow = {
    id: "plan-codex",
    projectKey: context.projectKey,
    adapterKey: context.adapterKey,
    planName: "plan-v1",
    lifecycle: "DRAFT",
    revision: 0,
  }

  function database(options?: { updateError?: Error }) {
    const executeRaw = vi.fn((...args: [TemplateStringsArray, ...unknown[]]) => {
      void args
      return Promise.resolve(1)
    })
    const update = options?.updateError
      ? vi.fn().mockRejectedValue(options.updateError)
      : vi.fn().mockResolvedValue({ ...current, lifecycle: "ACTIVE", revision: 1 })
    const tx: PlanLifecycleTransaction = {
      planRecord: {
        findFirst: vi.fn().mockResolvedValue(current),
        update,
      },
      $executeRaw: executeRaw,
    }
    const db: PlanLifecycleDatabase = {
      $transaction: async (work) => work(tx),
    }
    return { db, tx, update, executeRaw }
  }

  it("状态/revision 更新成功后才在同一 transaction 发布通知", async () => {
    const { db, update, executeRaw } = database()
    const result = await transitionPlanLifecycle(db, { context, planName: "plan-v1", to: "ACTIVE" })

    expect(update).toHaveBeenCalledWith({
      where: { id: "plan-codex", revision: 0 },
      data: { lifecycle: "ACTIVE", revision: { increment: 1 } },
    })
    expect(result).toMatchObject({ lifecycle: "ACTIVE", revision: 1 })
    expect(executeRaw).toHaveBeenCalledTimes(1)
  })

  it("状态更新失败时不调用 pg_notify", async () => {
    const { db, executeRaw } = database({ updateError: new Error("optimistic conflict") })
    await expect(transitionPlanLifecycle(db, { context, planName: "plan-v1", to: "ACTIVE" }))
      .rejects.toThrow("optimistic conflict")
    expect(executeRaw).not.toHaveBeenCalled()
  })
})

describe("transactional HITL publisher", () => {
  const context = createRuntimeContext(projectRoot, ".codex")

  it("审批、Plan revision/lifecycle 和 NOTIFY 按顺序在同一 Prisma transaction", async () => {
    const callOrder: string[] = []
    const hitlFindFirst = vi.fn().mockResolvedValue({
      id: "hitl-1",
      projectKey: context.projectKey,
      adapterKey: context.adapterKey,
      planName: "plan-v1",
      round: 1,
      type: "PLAN",
      status: "DRAFT",
      approvedAt: null,
      rejectedAt: null,
      rejectReason: null,
    })
    const tx: HitlLifecycleTransaction = {
      hitlRecord: {
        findFirst: hitlFindFirst,
        update: vi.fn().mockImplementation(() => {
          callOrder.push("hitl:update")
          return Promise.resolve({
            id: "hitl-1",
            projectKey: context.projectKey,
            adapterKey: context.adapterKey,
            planName: "plan-v1",
            round: 1,
            type: "PLAN",
            status: "TONGYI",
            approvedAt: new Date(),
            rejectedAt: null,
            rejectReason: null,
          })
        }),
      },
      planRecord: {
        findFirst: vi.fn().mockResolvedValue({
          id: "plan-1",
          projectKey: context.projectKey,
          adapterKey: context.adapterKey,
          planName: "plan-v1",
          lifecycle: "DRAFT",
          revision: 0,
        }),
        update: vi.fn().mockImplementation(() => {
          callOrder.push("plan:update")
          return Promise.resolve({
            id: "plan-1",
            projectKey: context.projectKey,
            adapterKey: context.adapterKey,
            planName: "plan-v1",
            lifecycle: "ACTIVE",
            revision: 1,
          })
        }),
      },
      $executeRaw: vi.fn().mockImplementation(() => {
        callOrder.push("notify")
        return Promise.resolve(1)
      }),
    }
    const database: HitlLifecycleDatabase = {
      $transaction: (work) => work(tx),
    }

    const result = await decideHitlAndPublish(database, {
      context,
      planName: "plan-v1",
      type: "PLAN",
      status: "TONGYI",
    })

    expect(result.plan).toMatchObject({ lifecycle: "ACTIVE", revision: 1 })
    expect(callOrder).toEqual(["hitl:update", "plan:update", "notify"])
    expect(hitlFindFirst).toHaveBeenCalledWith({
      where: {
        projectKey: context.projectKey,
        adapterKey: "codex",
        planName: "plan-v1",
        type: "PLAN",
      },
      orderBy: { round: "desc" },
    })
  })

  it("Plan revision 更新失败时 transaction 内不会发布通知", async () => {
    const executeRaw = vi.fn().mockResolvedValue(1)
    const tx: HitlLifecycleTransaction = {
      hitlRecord: {
        findFirst: vi.fn().mockResolvedValue({
          id: "hitl-1", projectKey: context.projectKey, adapterKey: context.adapterKey,
          planName: "plan-v1", round: 1, type: "PLAN", status: "DRAFT",
          approvedAt: null, rejectedAt: null, rejectReason: null,
        }),
        update: vi.fn().mockResolvedValue({
          id: "hitl-1", projectKey: context.projectKey, adapterKey: context.adapterKey,
          planName: "plan-v1", round: 1, type: "PLAN", status: "TONGYI",
          approvedAt: new Date(), rejectedAt: null, rejectReason: null,
        }),
      },
      planRecord: {
        findFirst: vi.fn().mockResolvedValue({
          id: "plan-1", projectKey: context.projectKey, adapterKey: context.adapterKey,
          planName: "plan-v1", lifecycle: "DRAFT", revision: 0,
        }),
        update: vi.fn().mockRejectedValue(new Error("optimistic conflict")),
      },
      $executeRaw: executeRaw,
    }
    const database: HitlLifecycleDatabase = { $transaction: (work) => work(tx) }

    await expect(decideHitlAndPublish(database, {
      context, planName: "plan-v1", type: "PLAN", status: "TONGYI",
    })).rejects.toThrow("optimistic conflict")
    expect(executeRaw).not.toHaveBeenCalled()
  })
})

describe("transactional plan_track publisher", () => {
  const context = createRuntimeContext(projectRoot, ".codex")

  it("projection 与 revision 成功落库后才发布轻量唤醒事件", async () => {
    const callOrder: string[] = []
    const updatePlan = vi.fn().mockImplementation(() => {
      callOrder.push("plan:update")
      return Promise.resolve({
        id: "plan-1", projectKey: context.projectKey, adapterKey: context.adapterKey,
        planName: "plan-v1", lifecycle: "ACTIVE", revision: 4,
      })
    })
    const tx: PlanTrackingTransaction = {
      planRecord: {
        findFirst: vi.fn().mockResolvedValue({
          id: "plan-1", projectKey: context.projectKey, adapterKey: context.adapterKey,
          planName: "plan-v1", lifecycle: "ACTIVE", revision: 3,
        }),
        create: vi.fn(),
        update: updatePlan,
      },
      $executeRaw: vi.fn().mockImplementation(() => {
        callOrder.push("notify")
        return Promise.resolve(1)
      }),
    }
    const database: PlanTrackingDatabase = { $transaction: (work) => work(tx) }

    const result = await trackPlanAndPublish(database, {
      context,
      planName: "plan-v1",
      planPath: `${projectRoot}/.codex/plans/plan-v1.md`,
      projection: { totalTasks: 42, doneTasks: 11 },
    })

    expect(result).toMatchObject({ created: false, plan: { revision: 4 } })
    expect(callOrder).toEqual(["plan:update", "notify"])
    expect(updatePlan).toHaveBeenCalledWith({
      where: { id: "plan-1", revision: 3 },
      data: {
        totalTasks: 42,
        doneTasks: 11,
        planPath: `${projectRoot}/.codex/plans/plan-v1.md`,
        revision: { increment: 1 },
      },
    })
  })

  it("projection 写入失败时不发布通知", async () => {
    const executeRaw = vi.fn().mockResolvedValue(1)
    const tx: PlanTrackingTransaction = {
      planRecord: {
        findFirst: vi.fn().mockResolvedValue({
          id: "plan-1", projectKey: context.projectKey, adapterKey: context.adapterKey,
          planName: "plan-v1", lifecycle: "ACTIVE", revision: 3,
        }),
        create: vi.fn(),
        update: vi.fn().mockRejectedValue(new Error("projection write failed")),
      },
      $executeRaw: executeRaw,
    }
    const database: PlanTrackingDatabase = { $transaction: (work) => work(tx) }

    await expect(trackPlanAndPublish(database, {
      context,
      planName: "plan-v1",
      planPath: `${projectRoot}/.codex/plans/plan-v1.md`,
      projection: {},
    })).rejects.toThrow("projection write failed")
    expect(executeRaw).not.toHaveBeenCalled()
  })
})

class FakeListenClient implements LifecycleListenClient {
  readonly calls: string[] = []
  readonly connect = vi.fn(() => {
    this.calls.push("connect")
    return Promise.resolve()
  })
  readonly query = vi.fn((sql: string) => {
    this.calls.push(sql)
    return Promise.resolve([])
  })
  readonly end = vi.fn(() => {
    this.calls.push("end")
    return Promise.resolve()
  })
  #notificationListeners: Array<(message: PgNotification) => void> = []
  #errorListeners: Array<(error: Error) => void> = []
  #endListeners: Array<() => void> = []

  on(event: "notification", listener: (message: PgNotification) => void): this
  on(event: "error", listener: (error: Error) => void): this
  on(event: "end", listener: () => void): this
  on(event: "notification" | "error" | "end", listener: unknown): this {
    if (event === "notification") this.#notificationListeners.push(listener as (message: PgNotification) => void)
    if (event === "error") this.#errorListeners.push(listener as (error: Error) => void)
    if (event === "end") this.#endListeners.push(listener as () => void)
    return this
  }

  removeAllListeners(): this {
    this.#notificationListeners = []
    this.#errorListeners = []
    this.#endListeners = []
    return this
  }

  emitNotification(message: PgNotification): void {
    for (const listener of this.#notificationListeners) listener(message)
  }

  emitError(error: Error): void {
    for (const listener of this.#errorListeners) listener(error)
  }
}

describe("Adapter lifecycle subscriber pull", () => {
  const codex = createRuntimeContext(projectRoot, ".codex")
  const readySnapshot = {
    availability: "READY" as const,
    source: "database" as const,
    context: { projectKey: codex.projectKey, adapterKey: codex.adapterKey, contextId: codex.contextId },
    planName: null,
    lifecycle: null,
    isActive: false as const,
  }

  it("启动顺序为 connect → LISTEN → scoped full query", async () => {
    const client = new FakeListenClient()
    const resolveStatus = vi.fn(() => Promise.resolve(readySnapshot))
    const onSnapshot = vi.fn()
    const subscriber = new PlanLifecycleSubscriber({
      context: codex,
      clientFactory: () => client,
      resolveStatus,
      onSnapshot,
    })

    await subscriber.start()
    expect(client.calls.slice(0, 2)).toEqual(["connect", `LISTEN ${PLAN_LIFECYCLE_CHANNEL}`])
    expect(resolveStatus).toHaveBeenCalledWith({ context: codex, planId: undefined, reason: "initial" })
    expect(onSnapshot).toHaveBeenCalledWith(readySnapshot, undefined)
    await subscriber.stop()
  })

  it("匹配通知只负责唤醒，并按 planId 主动查 resolver", async () => {
    const client = new FakeListenClient()
    const resolveStatus = vi.fn(() => Promise.resolve(readySnapshot))
    const onSnapshot = vi.fn()
    const subscriber = new PlanLifecycleSubscriber({
      context: codex,
      clientFactory: () => client,
      resolveStatus,
      onSnapshot,
    })
    await subscriber.start()
    resolveStatus.mockClear()
    onSnapshot.mockClear()

    const envelope = createPlanLifecycleChangedEnvelope({ context: codex, planId: "plan-codex", revision: 2 })
    client.emitNotification({
      channel: PLAN_LIFECYCLE_CHANNEL,
      payload: JSON.stringify({ ...envelope, lifecycle: "CLOSED" }),
    })
    await vi.waitFor(() => expect(resolveStatus).toHaveBeenCalledOnce())
    expect(resolveStatus).toHaveBeenCalledWith({ context: codex, planId: "plan-codex", reason: "notification" })
    expect(onSnapshot).toHaveBeenCalledWith(readySnapshot, envelope)
    await subscriber.stop()
  })

  it("忽略其他 Adapter 的同项目通知", async () => {
    const client = new FakeListenClient()
    const resolveStatus = vi.fn(() => Promise.resolve(readySnapshot))
    const subscriber = new PlanLifecycleSubscriber({
      context: codex,
      clientFactory: () => client,
      resolveStatus,
      onSnapshot: vi.fn(),
    })
    await subscriber.start()
    resolveStatus.mockClear()

    const qoder = createRuntimeContext(projectRoot, ".qoder")
    client.emitNotification({
      channel: PLAN_LIFECYCLE_CHANNEL,
      payload: JSON.stringify(createPlanLifecycleChangedEnvelope({ context: qoder, planId: "plan-qoder", revision: 9 })),
    })
    await Promise.resolve()
    expect(resolveStatus).not.toHaveBeenCalled()
    await subscriber.stop()
  })

  it("连接断开后重新执行 connect → LISTEN → scoped full query", async () => {
    const first = new FakeListenClient()
    const second = new FakeListenClient()
    const clients = [first, second]
    const resolveStatus = vi.fn(() => Promise.resolve(readySnapshot))
    const subscriber = new PlanLifecycleSubscriber({
      context: codex,
      clientFactory: () => clients.shift()!,
      resolveStatus,
      onSnapshot: vi.fn(),
      reconnectDelayMs: 5,
    })
    await subscriber.start()
    resolveStatus.mockClear()

    first.emitError(new Error("connection lost"))
    await vi.waitFor(() => expect(second.connect).toHaveBeenCalledOnce())
    expect(second.calls.slice(0, 2)).toEqual(["connect", `LISTEN ${PLAN_LIFECYCLE_CHANNEL}`])
    expect(resolveStatus).toHaveBeenCalledWith({ context: codex, planId: undefined, reason: "reconnect" })
    await subscriber.stop()
  })
})
