/*
 * Gate 采证真实库集成测试（Plan §五「Gate 重放幂等」验收项）
 * 门控：RUN_POSTGRES_INTEGRATION=1 才执行（与 fts-pg.integration 同模式）
 *
 * 验证：对真实 Postgres 的 AddMetricSnapshot 表
 *  1. 首次 writeGateMetric → written，表内 1 行
 *  2. 同 runId 重放（内容未变）→ skipped_duplicate，表内仍 1 行（唯一键与 findUnique 双保险）
 *  3. 内容变化 → 新 runId → 新快照 1 行
 *  4. metadata 落库（gate/runId/dimensionScores）
 */
import dotenv from "dotenv"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../../src/generated/prisma/client.js"
import {
  createGateWriterDeps,
  deriveGateRunId,
  writeGateMetric,
  GATE_METRIC_TYPE,
  type GateWriterDeps,
} from "../../templates/core/scripts/mcp-server/shared/memory/metrics/gate-writer.js"

dotenv.config({ path: ".env.development", quiet: true })

const runPostgres = process.env.RUN_POSTGRES_INTEGRATION === "1"
const suite = runPostgres ? describe : describe.skip

suite("gate-writer → AddMetricSnapshot（真实库）", () => {
  const repo = `gate-eval-${process.pid}`
  const planKeyword = `gate-eval-${process.pid}-plan-v1`
  let prisma: PrismaClient
  let deps: GateWriterDeps

  beforeAll(() => {
    const url = process.env.DATABASE_URL ?? ""
    if (!url) throw new Error("DATABASE_URL 未设置")
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
    deps = createGateWriterDeps(prisma.addMetricSnapshot)
  })

  afterAll(async () => {
    await prisma.addMetricSnapshot.deleteMany({ where: { repositoryRef: repo } })
    await prisma.$disconnect()
  })

  it("首写 → written；重放 → skipped_duplicate；内容变化 → 新快照", async () => {
    const seedV1 = "plan-contents-v1"
    const runId = deriveGateRunId("check_dps", planKeyword, seedV1)
    const input = {
      gate: "check_dps" as const,
      planKeyword,
      runId,
      metricType: GATE_METRIC_TYPE.check_dps,
      score: 83,
      repository: repo,
      dimensionScores: { semantic: 66, entropy: 93, cpm: 73, structure: 100 },
      baseline: 80,
      unit: "score",
    }

    const first = await writeGateMetric(input, deps)
    expect(first.outcome).toBe("written")
    expect(await prisma.addMetricSnapshot.count({ where: { repositoryRef: repo } })).toBe(1)

    const replay = await writeGateMetric(input, deps)
    expect(replay.outcome).toBe("skipped_duplicate")
    expect(replay.metricId).toBe(first.metricId)
    expect(await prisma.addMetricSnapshot.count({ where: { repositoryRef: repo } })).toBe(1)

    const changed = await writeGateMetric(
      { ...input, runId: deriveGateRunId("check_dps", planKeyword, "plan-contents-v2") },
      deps,
    )
    expect(changed.outcome).toBe("written")
    expect(await prisma.addMetricSnapshot.count({ where: { repositoryRef: repo } })).toBe(2)

    const row = await prisma.addMetricSnapshot.findFirst({
      where: { repositoryRef: repo, sourceRef: first.sourceRef },
    })
    expect(row?.value).toBe(83)
    expect(row?.delta).toBe(3)
    expect(row?.planKeyword).toBe(planKeyword)
    const meta = row?.metadata as Record<string, unknown> | null
    expect(meta?.gate).toBe("check_dps")
    expect(meta?.runId).toBe(runId)
  })

  it("非法输入不写库且不抛异常（fail-open 旁路）", async () => {
    const before = await prisma.addMetricSnapshot.count({ where: { repositoryRef: repo } })
    const result = await writeGateMetric(
      {
        gate: "check_rahs",
        planKeyword,
        runId: "run-invalid",
        score: 50,
        repository: "",
      },
      deps,
    )
    expect(result.outcome).toBe("bypassed")
    expect(await prisma.addMetricSnapshot.count({ where: { repositoryRef: repo } })).toBe(before)
  })
})
