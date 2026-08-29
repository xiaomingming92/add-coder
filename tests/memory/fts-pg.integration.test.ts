/*
 * PG FTS 适配器集成测试（tasks.md Task 2.1/2.2，checklist §三）
 * 门控：RUN_POSTGRES_INTEGRATION=1 才执行（与 plan-lifecycle-postgres 同模式）
 * 验证：pg_trgm CJK/拉丁命中、lifecycle 过滤（SUPERSEDED/过期不召回）、repository 隔离
 */
import dotenv from "dotenv"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../../src/generated/prisma/client.js"
import { createPgFtsAdapter } from "../../templates/core/scripts/mcp-server/shared/memory/retrieval/fts/pg.js"
import type { RawQuerier, RecallFilter } from "../../templates/core/scripts/mcp-server/shared/memory/retrieval/types.js"

dotenv.config({ path: ".env.development", quiet: true })

const runPostgres = process.env.RUN_POSTGRES_INTEGRATION === "1"
const suite = runPostgres ? describe : describe.skip

suite("PG FTS adapter (pg_trgm)", () => {
  const repo = `eval-repo-${process.pid}`
  const otherRepo = `eval-repo-other-${process.pid}`
  let prisma: PrismaClient
  let adapter: ReturnType<typeof createPgFtsAdapter>

  const filter = (over: Partial<RecallFilter> = {}): RecallFilter => ({
    repositoryRef: repo,
    statuses: ["ACTIVE"],
    scopeCtx: { repository: repo },
    now: new Date(),
    ...over,
  })

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? ""
    if (!url) throw new Error("DATABASE_URL 未设置")
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
    const querier: RawQuerier = {
      query: (sql, params) => prisma.$queryRawUnsafe(sql, ...params) as Promise<never[]>,
    }
    adapter = createPgFtsAdapter(querier)

    const base = { scopeType: "PATH" as const, scopeValue: "src/", contentHash: "h" }
    await prisma.addMemory.createMany({
      data: [
        { ...base, id: `pgt-${process.pid}-1`, repositoryRef: repo, kind: "LESSON", status: "ACTIVE",
          topic: "迁移教训", content: "涉及 Prisma migration 的多个 Plan 在双后端行为差异处重复失败", contentHash: `h1-${process.pid}` },
        { ...base, id: `pgt-${process.pid}-2`, repositoryRef: repo, kind: "CONSTRAINT", status: "SUPERSEDED",
          topic: "旧约束", content: "旧的 migration 流程不需要 smoke test（已被推翻）", contentHash: `h2-${process.pid}` },
        { ...base, id: `pgt-${process.pid}-3`, repositoryRef: repo, kind: "FACT", status: "ACTIVE",
          topic: "过期事实", content: "这条记忆已经过期不应召回", validUntil: new Date(Date.now() - 1000), contentHash: `h3-${process.pid}` },
        { ...base, id: `pgt-${process.pid}-4`, repositoryRef: otherRepo, kind: "LESSON", status: "ACTIVE",
          topic: "迁移教训", content: "涉及 Prisma migration 的其他仓库记忆（越界检查用）", contentHash: `h4-${process.pid}` },
      ],
    })
  })

  afterAll(async () => {
    await prisma.addMemory.deleteMany({ where: { repositoryRef: { in: [repo, otherRepo] } } })
    await prisma.$disconnect()
  })

  it("health 返回 ok（pg_trgm + GIN 索引就位）", async () => {
    const h = await adapter.health()
    expect(h.status).toBe("ok")
  })

  it("CJK 查询命中 ACTIVE 记忆；SUPERSEDED/过期/越界不召回", async () => {
    const res = await adapter.search("Prisma migration 失败", filter())
    const ids = res.map((r) => r.memoryId)
    expect(ids).toContain(`pgt-${process.pid}-1`)
    expect(ids).not.toContain(`pgt-${process.pid}-2`) // SUPERSEDED
    expect(ids).not.toContain(`pgt-${process.pid}-3`) // 过期
    expect(ids).not.toContain(`pgt-${process.pid}-4`) // 越界
  })

  it("三通道：trgm + tsquery + 词项重叠，tsquery 通道不阻断主通道", async () => {
    const channels = await adapter.searchChannels("migration", filter(), 10)
    expect(channels.length).toBe(3)
    expect(channels[0].length).toBeGreaterThan(0)
  })

  it("kinds 过滤生效", async () => {
    const res = await adapter.search("migration", filter({ kinds: ["CONSTRAINT"] }), 10)
    expect(res.map((r) => r.memoryId)).not.toContain(`pgt-${process.pid}-1`)
  })
})
