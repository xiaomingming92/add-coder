import { describe, expect, it, vi } from "vitest"
import { createRuntimeContext } from "../templates/core/scripts/mcp-server/shared/runtime-context.js"
import {
  closePlanRoundAndPublish,
  type PlanRoundDatabase,
  type PlanRoundOperationRow,
  type PlanRoundTransaction,
} from "../templates/core/scripts/mcp-server/shared/plan-round-mutation.js"
import {
  createPlanRoundChangedEnvelope,
  PLAN_ROUND_CHANNEL,
  parsePlanRoundChangedEnvelope,
} from "../templates/core/scripts/mcp-server/shared/plan-round-events.js"
import { queryPlanRounds } from "../templates/core/scripts/mcp-server/shared/plan-round-store.js"
import { PlanRoundSubscriber } from "../templates/core/scripts/mcp-server/shared/plan-round-subscriber.js"
import type { LifecycleListenClient, PgNotification } from "../templates/core/scripts/mcp-server/shared/plan-lifecycle-subscriber.js"

const context = createRuntimeContext("/home/xmm/ai/add-coder", ".codex")
const plan = {
  id: "plan-1",
  projectKey: context.projectKey,
  adapterKey: context.adapterKey,
  planName: "plan-v1",
  lifecycle: "ACTIVE",
  revision: 7,
}
const operation: PlanRoundOperationRow = {
  id: "round-op-1",
  projectKey: context.projectKey,
  producerAdapterKey: context.adapterKey,
  contextId: context.contextId,
  toolName: "plan_round_close",
  operationKey: "round-key",
  planKeyword: plan.planName,
  action: "ROUND_CLOSED",
  targetType: "PLAN_ROUND",
  targetId: `${plan.planName}::round3`,
  beforeState: { done: 20 },
  afterState: { done: 31 },
  reason: null,
  createdAt: new Date("2026-08-13T00:00:00Z"),
}

function mutationFixture(options?: { upsertError?: Error }) {
  const callOrder: string[] = []
  type UpsertArgs = Parameters<PlanRoundTransaction["devOperation"]["upsert"]>[0]
  type ExecuteRaw = (query: TemplateStringsArray, ...values: unknown[]) => Promise<number>
  const upsert = options?.upsertError
    ? vi.fn<(args: UpsertArgs) => Promise<PlanRoundOperationRow>>().mockRejectedValue(options.upsertError)
    : vi.fn<(args: UpsertArgs) => Promise<PlanRoundOperationRow>>().mockImplementation(() => { callOrder.push("upsert"); return Promise.resolve(operation) })
  const executeRaw = vi.fn<ExecuteRaw>().mockImplementation(() => { callOrder.push("notify"); return Promise.resolve(1) })
  const tx: PlanRoundTransaction = {
    planRecord: { findFirst: vi.fn().mockResolvedValue(plan) },
    addUser: {
      findUnique: vi.fn().mockResolvedValue({ id: "ai-assistant" }),
      create: vi.fn(),
    },
    devOperation: { upsert },
    $executeRaw: executeRaw,
  }
  const database: PlanRoundDatabase = { $transaction: (work) => work(tx) }
  return { database, tx, upsert, executeRaw, callOrder }
}

describe("PlanRound scoped mutation", () => {
  it("幂等 upsert 后在同一 transaction 发布最小唤醒，Plan lifecycle/revision 不变", async () => {
    const { database, upsert, executeRaw, callOrder, tx } = mutationFixture()
    const result = await closePlanRoundAndPublish(database, {
      context,
      planName: plan.planName,
      round: 3,
      beforeState: { done: 20 },
      afterState: { done: 31 },
    })

    expect(result.plan).toMatchObject({ lifecycle: "ACTIVE", revision: 7 })
    expect(callOrder).toEqual(["upsert", "notify"])
    const upsertArgs = upsert.mock.calls[0][0]
    expect(upsertArgs.where).toEqual({
      projectKey_producerAdapterKey_toolName_operationKey: {
        projectKey: context.projectKey,
        producerAdapterKey: "codex",
        toolName: "plan_round_close",
        operationKey: expect.any(String) as string,
      },
    })
    expect(upsertArgs.create).toMatchObject({
      action: "ROUND_CLOSED",
      targetType: "PLAN_ROUND",
      targetId: "plan-v1::round3",
    })
    expect(upsertArgs.update).toEqual({})
    expect(tx.planRecord).not.toHaveProperty("update")

    const [strings, channel, payload] = executeRaw.mock.calls[0]
    expect(Array.from(strings).join("?")).toContain("pg_notify")
    expect(channel).toBe(PLAN_ROUND_CHANNEL)
    expect(JSON.parse(String(payload))).toEqual(expect.objectContaining({
      schemaVersion: 1,
      projectKey: context.projectKey,
      adapterKey: "codex",
      planId: "plan-1",
    }))
    expect(JSON.parse(String(payload))).not.toHaveProperty("round")
    expect(JSON.parse(String(payload))).not.toHaveProperty("lifecycle")
    expect(JSON.parse(String(payload))).not.toHaveProperty("afterState")
  })

  it("upsert 失败时不发布通知", async () => {
    const { database, executeRaw } = mutationFixture({ upsertError: new Error("write failed") })
    await expect(closePlanRoundAndPublish(database, {
      context,
      planName: plan.planName,
      round: 3,
      beforeState: {},
      afterState: {},
    })).rejects.toThrow("write failed")
    expect(executeRaw).not.toHaveBeenCalled()
  })

  it("同一 PlanRound 使用稳定 operationKey，交给数据库唯一键幂等", async () => {
    const first = mutationFixture()
    const second = mutationFixture()
    await closePlanRoundAndPublish(first.database, { context, planName: plan.planName, round: 3, beforeState: {}, afterState: {} })
    await closePlanRoundAndPublish(second.database, { context, planName: plan.planName, round: 3, beforeState: {}, afterState: {} })
    const firstWhere = first.upsert.mock.calls[0][0].where as { projectKey_producerAdapterKey_toolName_operationKey: { operationKey: string } }
    const secondWhere = second.upsert.mock.calls[0][0].where as { projectKey_producerAdapterKey_toolName_operationKey: { operationKey: string } }
    const firstKey = firstWhere.projectKey_producerAdapterKey_toolName_operationKey.operationKey
    const secondKey = secondWhere.projectKey_producerAdapterKey_toolName_operationKey.operationKey
    expect(firstKey).toBe(secondKey)
  })

  it("调用方 operationKey 仍按 planId/round 命名空间隔离", async () => {
    const round3 = mutationFixture()
    const round4 = mutationFixture()
    await closePlanRoundAndPublish(round3.database, { context, planName: plan.planName, round: 3, beforeState: {}, afterState: {}, operationKey: "retry-1" })
    await closePlanRoundAndPublish(round4.database, { context, planName: plan.planName, round: 4, beforeState: {}, afterState: {}, operationKey: "retry-1" })
    const where3 = round3.upsert.mock.calls[0][0].where as { projectKey_producerAdapterKey_toolName_operationKey: { operationKey: string } }
    const where4 = round4.upsert.mock.calls[0][0].where as { projectKey_producerAdapterKey_toolName_operationKey: { operationKey: string } }
    expect(where3.projectKey_producerAdapterKey_toolName_operationKey.operationKey)
      .not.toBe(where4.projectKey_producerAdapterKey_toolName_operationKey.operationKey)
  })
})

describe("PlanRound scoped query", () => {
  it("查询强制携带 project/adapter 并支持 round 过滤", async () => {
    const findMany = vi.fn().mockResolvedValue([operation])
    const snapshot = await queryPlanRounds({
      planRecord: { findFirst: vi.fn().mockResolvedValue({ id: plan.id, planName: plan.planName }) },
      devOperation: { findMany },
    }, { context, planName: plan.planName, round: 3 })

    expect(snapshot.rounds).toEqual([operation])
    expect(findMany).toHaveBeenCalledWith({
      where: {
        projectKey: context.projectKey,
        producerAdapterKey: "codex",
        toolName: "plan_round_close",
        action: "ROUND_CLOSED",
        planKeyword: "plan-v1",
        targetId: "plan-v1::round3",
      },
      orderBy: { createdAt: "asc" },
    })
  })

  it("subscriber 初次 full pull 明确选择最近 ACTIVE/BLOCKED Plan", async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: plan.id, planName: plan.planName })
    await queryPlanRounds({
      planRecord: { findFirst },
      devOperation: { findMany: vi.fn().mockResolvedValue([operation]) },
    }, { context })
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        projectKey: context.projectKey,
        adapterKey: "codex",
        lifecycle: { in: ["ACTIVE", "BLOCKED"] },
      },
      orderBy: { updatedAt: "desc" },
    })
  })
})

class FakeListenClient implements LifecycleListenClient {
  readonly calls: string[] = []
  readonly connect = vi.fn(() => { this.calls.push("connect"); return Promise.resolve() })
  readonly query = vi.fn((sql: string) => { this.calls.push(sql); return Promise.resolve([]) })
  readonly end = vi.fn(() => Promise.resolve())
  #notifications: Array<(message: PgNotification) => void> = []
  #errors: Array<(error: Error) => void> = []
  #ends: Array<() => void> = []

  on(event: "notification", listener: (message: PgNotification) => void): this
  on(event: "error", listener: (error: Error) => void): this
  on(event: "end", listener: () => void): this
  on(event: "notification" | "error" | "end", listener: unknown): this {
    if (event === "notification") this.#notifications.push(listener as (message: PgNotification) => void)
    if (event === "error") this.#errors.push(listener as (error: Error) => void)
    if (event === "end") this.#ends.push(listener as () => void)
    return this
  }
  removeAllListeners(): this { this.#notifications = []; this.#errors = []; this.#ends = []; return this }
  emit(message: PgNotification): void { for (const listener of this.#notifications) listener(message) }
  emitError(error: Error): void { for (const listener of this.#errors) listener(error) }
}

describe("PlanRound subscriber pull", () => {
  it("connect→LISTEN→full query，通知后仍按自身 scope 查询", async () => {
    const client = new FakeListenClient()
    const snapshot = { context, planId: plan.id, planName: plan.planName, rounds: [operation] }
    const queryRounds = vi.fn().mockResolvedValue(snapshot)
    const subscriber = new PlanRoundSubscriber({
      context,
      clientFactory: () => client,
      queryRounds,
      onSnapshot: vi.fn(),
    })
    await subscriber.start()
    expect(client.calls.slice(0, 2)).toEqual(["connect", `LISTEN ${PLAN_ROUND_CHANNEL}`])
    expect(queryRounds).toHaveBeenCalledWith({ context, planId: undefined, reason: "initial" })
    queryRounds.mockClear()

    const envelope = createPlanRoundChangedEnvelope({ context, planId: plan.id, eventId: "event-1" })
    client.emit({ channel: PLAN_ROUND_CHANNEL, payload: JSON.stringify({ ...envelope, round: 999, lifecycle: "CLOSED" }) })
    await vi.waitFor(() => expect(queryRounds).toHaveBeenCalledOnce())
    expect(queryRounds).toHaveBeenCalledWith({ context, planId: plan.id, reason: "notification" })
    expect(parsePlanRoundChangedEnvelope(JSON.stringify({ ...envelope, round: 999 }))).toEqual(envelope)
    await subscriber.stop()
  })

  it("忽略其他 adapter 的通知", async () => {
    const client = new FakeListenClient()
    const queryRounds = vi.fn().mockResolvedValue({ context, planId: null, planName: null, rounds: [] })
    const subscriber = new PlanRoundSubscriber({ context, clientFactory: () => client, queryRounds, onSnapshot: vi.fn() })
    await subscriber.start()
    queryRounds.mockClear()
    const qoder = createRuntimeContext("/home/xmm/ai/add-coder", ".qoder")
    client.emit({ channel: PLAN_ROUND_CHANNEL, payload: JSON.stringify(createPlanRoundChangedEnvelope({ context: qoder, planId: "qoder-plan" })) })
    await Promise.resolve()
    expect(queryRounds).not.toHaveBeenCalled()
    await subscriber.stop()
  })

  it("连接断开后重新 LISTEN 并以 scoped full query 恢复可能丢失的通知", async () => {
    const first = new FakeListenClient()
    const second = new FakeListenClient()
    const clients = [first, second]
    const queryRounds = vi.fn().mockResolvedValue({ context, planId: plan.id, planName: plan.planName, rounds: [operation] })
    const subscriber = new PlanRoundSubscriber({
      context,
      clientFactory: () => clients.shift()!,
      queryRounds,
      onSnapshot: vi.fn(),
      reconnectDelayMs: 5,
    })
    await subscriber.start()
    queryRounds.mockClear()
    first.emitError(new Error("connection lost"))
    await vi.waitFor(() => expect(second.connect).toHaveBeenCalledOnce())
    expect(second.calls.slice(0, 2)).toEqual(["connect", `LISTEN ${PLAN_ROUND_CHANNEL}`])
    expect(queryRounds).toHaveBeenCalledWith({ context, planId: undefined, reason: "reconnect" })
    await subscriber.stop()
  })
})
