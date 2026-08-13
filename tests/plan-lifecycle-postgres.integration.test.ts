import dotenv from "dotenv"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../src/generated/prisma/client.js"
import { createRuntimeContext } from "../templates/core/scripts/mcp-server/shared/runtime-context.js"
import { resolvePlanStatus, type PlanStatusResolution } from "../templates/core/scripts/mcp-server/shared/plan-lifecycle.js"
import { createPrismaPlanStatusStore } from "../templates/core/scripts/mcp-server/shared/plan-status-store.js"
import { transitionPlanLifecycle, type PlanLifecycleDatabase } from "../templates/core/scripts/mcp-server/shared/plan-lifecycle-mutation.js"
import {
  createPgLifecycleListenClient,
  PlanLifecycleSubscriber,
} from "../templates/core/scripts/mcp-server/shared/plan-lifecycle-subscriber.js"
import {
  createHitlProposalAndPublish,
  type HitlProposalDatabase,
} from "../templates/core/scripts/mcp-server/shared/hitl-proposal-mutation.js"
import {
  closePlanRoundAndPublish,
  type PlanRoundDatabase,
} from "../templates/core/scripts/mcp-server/shared/plan-round-mutation.js"
import { PlanRoundSubscriber } from "../templates/core/scripts/mcp-server/shared/plan-round-subscriber.js"
import { queryPlanRounds, type PlanRoundSnapshot } from "../templates/core/scripts/mcp-server/shared/plan-round-store.js"

dotenv.config({ path: ".env.development", quiet: true })

const runPostgres = process.env.RUN_POSTGRES_INTEGRATION === "1"
const suite = runPostgres ? describe : describe.skip

suite("PostgreSQL LISTEN/NOTIFY lifecycle pull", () => {
  const databaseUrl = process.env.DATABASE_URL ?? ""
  const context = createRuntimeContext(process.cwd(), ".codex")
  const qoderContext = createRuntimeContext(process.cwd(), ".qoder")
  const planName = `add-coder-listen-notify-integration-${process.pid}-plan-v1`
  let prisma: PrismaClient
  let subscriber: PlanLifecycleSubscriber
  let roundSubscriber: PlanRoundSubscriber

  beforeAll(async () => {
    if (!databaseUrl) throw new Error("DATABASE_URL 未设置")
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })
    await prisma.planRecord.create({
      data: {
        projectKey: context.projectKey,
        adapterKey: context.adapterKey,
        planName,
        lifecycle: "DRAFT",
        revision: 0,
        planPath: `${context.projectRoot}/.codex/plans/${planName}.md`,
      },
    })
    await prisma.planRecord.create({
      data: {
        projectKey: qoderContext.projectKey,
        adapterKey: qoderContext.adapterKey,
        planName,
        lifecycle: "BLOCKED",
        revision: 7,
        planPath: `${qoderContext.projectRoot}/.qoder/plans/${planName}.md`,
        hitls: {
          create: {
            round: 1,
            type: "PLAN",
            status: "TONGYI",
          },
        },
      },
    })
  })

  afterAll(async () => {
    await subscriber?.stop()
    await roundSubscriber?.stop()
    if (prisma) {
      await prisma.devOperation.deleteMany({
        where: { projectKey: context.projectKey, producerAdapterKey: context.adapterKey, planKeyword: planName },
      })
      await prisma.planRecord.deleteMany({
        where: { projectKey: context.projectKey, planName },
      })
      await prisma.$disconnect()
    }
  })

  it("modifier commit 后通知；subscriber 收到后按 planId scoped query", async () => {
    const snapshots: PlanStatusResolution[] = []
    const onSnapshot = vi.fn((snapshot: PlanStatusResolution) => {
      snapshots.push(snapshot)
    })
    const store = createPrismaPlanStatusStore(prisma as unknown as Record<string, unknown>)
    subscriber = new PlanLifecycleSubscriber({
      context,
      clientFactory: () => createPgLifecycleListenClient(databaseUrl),
      resolveStatus: ({ context: subscriberContext, planId }) => resolvePlanStatus(
        store,
        subscriberContext,
        planId ? { planId } : { activeOnly: true },
      ),
      onSnapshot,
      reconnectDelayMs: 50,
    })
    await subscriber.start()
    onSnapshot.mockClear()
    snapshots.length = 0

    await transitionPlanLifecycle(prisma as unknown as PlanLifecycleDatabase, {
      context,
      planName,
      to: "ACTIVE",
      expectedRevision: 0,
    })

    await vi.waitFor(() => {
      expect(snapshots.some((snapshot) =>
        snapshot.availability === "READY" &&
        snapshot.planName === planName &&
        snapshot.lifecycle === "ACTIVE" &&
        snapshot.revision === 1
      )).toBe(true)
    }, { timeout: 5000 })

    await transitionPlanLifecycle(prisma as unknown as PlanLifecycleDatabase, {
      context,
      planName,
      to: "ABANDONED",
      expectedRevision: 1,
    })
  }, 15_000)

  it("并发 create_hitl 由 advisory xact lock 分配不同 round", async () => {
    const createProposal = () => createHitlProposalAndPublish(
      prisma as unknown as HitlProposalDatabase,
      {
        context,
        planName,
        planPath: `${context.projectRoot}/.codex/plans/${planName}.md`,
        planKeyword: "listen-notify-integration",
        type: "PLAN_REVIEW",
      },
    )
    const proposals = await Promise.all([createProposal(), createProposal()])
    expect(proposals.map((proposal) => proposal.hitl.round).sort()).toEqual([1, 2])
    const plan = await prisma.planRecord.findFirstOrThrow({
      where: { projectKey: context.projectKey, adapterKey: context.adapterKey, planName },
    })
    expect(plan.revision).toBe(4)
  }, 15_000)

  it("同项目同名 Plan 可并存，resolver 只返回订阅者自己的 adapter scope", async () => {
    const store = createPrismaPlanStatusStore(prisma as unknown as Record<string, unknown>)
    const codex = await resolvePlanStatus(store, context, planName)
    const qoder = await resolvePlanStatus(store, qoderContext, planName)

    expect(codex).toMatchObject({
      availability: "READY",
      context: { adapterKey: "codex" },
      planName,
      lifecycle: "ABANDONED",
      approvalStatus: null,
    })
    expect(qoder).toMatchObject({
      availability: "READY",
      context: { adapterKey: "qoder" },
      planName,
      lifecycle: "BLOCKED",
      approvalStatus: "TONGYI",
    })
  })

  it("PlanRound commit 后唤醒 scoped subscriber；重试幂等且 Plan lifecycle/revision 不变", async () => {
    const snapshots: PlanRoundSnapshot[] = []
    roundSubscriber = new PlanRoundSubscriber({
      context,
      clientFactory: () => createPgLifecycleListenClient(databaseUrl),
      queryRounds: ({ context: subscriberContext, planId }) => queryPlanRounds(
        prisma,
        { context: subscriberContext, planId },
      ),
      onSnapshot: (snapshot) => { snapshots.push(snapshot) },
      reconnectDelayMs: 50,
    })
    await roundSubscriber.start()
    snapshots.length = 0

    const beforePlan = await prisma.planRecord.findFirstOrThrow({
      where: { projectKey: context.projectKey, adapterKey: context.adapterKey, planName },
    })
    const close = () => closePlanRoundAndPublish(prisma as unknown as PlanRoundDatabase, {
      context,
      planName,
      round: 99,
      beforeState: { stage: "implementation" },
      afterState: { stage: "review", tests: "passed" },
      operationKey: "postgres-integration-round-99",
    })
    await close()
    await vi.waitFor(() => {
      expect(snapshots.some(snapshot => snapshot.rounds.some(round => round.targetId === `${planName}::round99`))).toBe(true)
    }, { timeout: 5000 })
    await close()

    const records = await prisma.devOperation.count({
      where: {
        projectKey: context.projectKey,
        producerAdapterKey: context.adapterKey,
        toolName: "plan_round_close",
        planKeyword: planName,
        targetId: `${planName}::round99`,
      },
    })
    const afterPlan = await prisma.planRecord.findFirstOrThrow({ where: { id: beforePlan.id } })
    expect(records).toBe(1)
    expect(afterPlan.lifecycle).toBe(beforePlan.lifecycle)
    expect(afterPlan.revision).toBe(beforePlan.revision)
  }, 15_000)

})
