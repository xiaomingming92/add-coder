/*
 * 轮 2 契约测试：Handoff Digest 幂等生成（Spec §3 §HandoffDigest）
 *
 * 覆盖验收项：
 *  - HANDOFF Evidence → HANDOFF_DIGEST **Candidate**（绝不直接 ACTIVE）
 *  - 同一 evidence 重放不产生重复候选（幂等），但会补齐缺失的证据关联
 *  - 非 HANDOFF 来源不生成摘要候选
 *  - 该步异常被隔离，不影响其他步（fail-open）
 */
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, describe, expect, it, vi } from "vitest"
import {
  buildHandoffDigest,
  handoffTopicOf,
  HANDOFF_DIGEST_KIND,
  HANDOFF_EXCERPT_MAX,
} from "../../templates/core/scripts/mcp-server/shared/memory/domain/handoff-digest.js"
import { runConsolidation } from "../../templates/core/scripts/mcp-server/shared/memory/jobs/consolidation.js"

const repo = "digest-repo"
const tmp = mkdtempSync(join(tmpdir(), "mem-digest-"))
afterAll(() => rmSync(tmp, { recursive: true, force: true }))

describe("buildHandoffDigest 纯函数", () => {
  it("topic 取文件名主干，content 保留来源可回溯", () => {
    const p = buildHandoffDigest(
      { handoffRef: ".codex/plans/2026-09/12/add-coder-demo-handoff-v1.md", excerpt: "轮 1 已闭合：采证链路落地。" },
      { repositoryRef: repo },
    )
    expect(p.kind).toBe(HANDOFF_DIGEST_KIND)
    expect(p.topic).toBe("add-coder-demo-handoff-v1")
    expect(p.content).toContain("交接摘要 add-coder-demo-handoff-v1")
    expect(p.content).toContain("轮 1 已闭合")
    expect(p.content).toContain(".codex/plans/2026-09/12/add-coder-demo-handoff-v1.md")
    expect(p.metadata.excerptTruncated).toBe(false)
  })

  it("planKeyword 决定 scope（有→PLAN，无→REPOSITORY）", () => {
    const withPlan = buildHandoffDigest(
      { handoffRef: "h.md", excerpt: "x", planKeyword: "demo-plan-v1" },
      { repositoryRef: repo },
    )
    expect(withPlan.scopeType).toBe("PLAN")
    expect(withPlan.scopeValue).toBe("demo-plan-v1")

    const withoutPlan = buildHandoffDigest({ handoffRef: "h.md", excerpt: "x" }, { repositoryRef: repo })
    expect(withoutPlan.scopeType).toBe("REPOSITORY")
    expect(withoutPlan.scopeValue).toBe(repo)
  })

  it("空摘要显式标注待补充（不产出空内容记忆）", () => {
    const p = buildHandoffDigest({ handoffRef: "empty-handoff.md", excerpt: "   " }, { repositoryRef: repo })
    expect(p.content).toContain("摘要待人工补充")
    expect(p.content.length).toBeGreaterThan(0)
  })

  it("超长摘要截断并标注", () => {
    const p = buildHandoffDigest(
      { handoffRef: "long.md", excerpt: "细".repeat(HANDOFF_EXCERPT_MAX + 50) },
      { repositoryRef: repo },
    )
    expect(p.metadata.excerptTruncated).toBe(true)
    expect(p.content).toContain("已截断")
  })

  it("dedupKey 幂等：同输入恒等，摘要变化则变化", () => {
    const a = buildHandoffDigest({ handoffRef: "h.md", excerpt: "同一个摘要" }, { repositoryRef: repo })
    const b = buildHandoffDigest({ handoffRef: "h.md", excerpt: " 同一个摘要 " }, { repositoryRef: repo })
    const c = buildHandoffDigest({ handoffRef: "h.md", excerpt: "换了的摘要" }, { repositoryRef: repo })
    expect(a.dedupKey).toBe(b.dedupKey) // normalize 后等价
    expect(a.contentHash).toBe(b.contentHash)
    expect(a.dedupKey).not.toBe(c.dedupKey)
  })

  it("handoffTopicOf 兼容无扩展名与 Windows 分隔符", () => {
    expect(handoffTopicOf("a/b/c-handoff.md")).toBe("c-handoff")
    expect(handoffTopicOf("dir\\win-handoff.md")).toBe("win-handoff")
    expect(handoffTopicOf("no-ext")).toBe("no-ext")
  })
})

/**
 * 构造最小 consolidation deps。
 * 返回 spy 本体，测试可在不替换对象的前提下改变行为（保证断言盯的是同一个 spy）。
 * evidenceDb.findMany 会按 where.sourceType 过滤，模拟真实查询语义。
 */
function makeDeps(evidence: Array<Record<string, unknown>>) {
  const created: Record<string, unknown>[] = []
  const links: Record<string, unknown>[] = []
  const memoryFindFirst = vi.fn(() => Promise.resolve(null))
  const memoryFindMany = vi.fn(() => Promise.resolve([] as unknown[]))
  const memoryCreate = vi.fn(({ data }: { data: Record<string, unknown> }) => {
    const row = { id: `m-${created.length + 1}`, ...data }
    created.push(row)
    return Promise.resolve(row)
  })
  const evidenceFindMany = vi.fn(
    ({ where }: { where?: { sourceType?: string } } = {}) =>
      Promise.resolve(
        where?.sourceType ? evidence.filter((e) => e.sourceType === where.sourceType) : evidence,
      ),
  )
  const linkFindFirst = vi.fn(() => Promise.resolve(null))
  const linkCreate = vi.fn(({ data }: { data: Record<string, unknown> }) => {
    links.push(data)
    return Promise.resolve(data)
  })
  const deps = {
    projectDir: tmp,
    magicDir: ".codex",
    repositoryRef: repo,
    lexical: [],
    fetchByIds: () => Promise.resolve([]),
    fetchEvidenceSourceRefs: () => Promise.resolve(new Map<string, string[]>()),
    audit: {
      createRecall: () => Promise.resolve({ id: "r1" }),
      createRecallItem: () => Promise.resolve({}),
    },
    memoryDb: { findMany: memoryFindMany, findFirst: memoryFindFirst, create: memoryCreate },
    evidenceDb: { findMany: evidenceFindMany, upsert: () => Promise.resolve({ id: "ev-1" }) },
    linkDb: { findFirst: linkFindFirst, create: linkCreate },
    metricDb: { findMany: () => Promise.resolve([]) },
  }
  return {
    deps, created, links,
    memoryFindFirst, memoryFindMany, memoryCreate,
    evidenceFindMany, linkFindFirst, linkCreate,
  }
}

const handoffEvidence = [
  {
    id: "ev-h1",
    repositoryRef: repo,
    sourceType: "HANDOFF",
    sourceRef: ".codex/plans/2026-09/12/demo-handoff-v1.md",
    planKeyword: "demo-plan-v1",
    excerpt: "轮 1 闭合：Gate 采证幂等实测通过。",
    contentHash: "h1",
    occurredAt: new Date("2026-09-12T10:00:00Z"),
    metadata: null,
    createdAt: new Date(),
  },
]

describe("runConsolidation Handoff Digest 步骤", () => {
  it("HANDOFF evidence → 生成 CANDIDATE（绝不 ACTIVE）并建立证据关联", async () => {
    const { deps, created, links, memoryCreate } = makeDeps(handoffEvidence)
    const report = await runConsolidation(deps as never)

    expect(report.handoffDigestsCreated).toHaveLength(1)
    expect(memoryCreate).toHaveBeenCalledTimes(1)
    const data = memoryCreate.mock.calls[0][0].data
    expect(data.kind).toBe("HANDOFF_DIGEST")
    expect(data.status).toBe("CANDIDATE")
    expect(data.scopeType).toBe("PLAN")
    expect(data.scopeValue).toBe("demo-plan-v1")
    expect(JSON.stringify(data.metadata)).toContain('"evidenceId":"ev-h1"')
    expect(created[0].status).toBe("CANDIDATE")
    expect(links).toHaveLength(1)
    expect(links[0].memoryId).toBe(created[0].id)
    expect(links[0].evidenceId).toBe("ev-h1")
  })

  it("重放同一 evidence → 不产生重复候选（幂等）", async () => {
    const { deps, memoryCreate, linkCreate, memoryFindFirst, linkFindFirst } = makeDeps(handoffEvidence)
    memoryFindFirst.mockResolvedValue({ id: "m-existing", status: "CANDIDATE" })
    linkFindFirst.mockResolvedValue({ id: "link-exists", memoryId: "m-existing", evidenceId: "ev-h1" })
    const report = await runConsolidation(deps as never)
    expect(report.handoffDigestsCreated).toHaveLength(0)
    expect(memoryCreate).not.toHaveBeenCalled()
    expect(linkCreate).not.toHaveBeenCalled()
  })

  it("已存在候选但缺证据关联 → 不新建候选，仅补齐关联", async () => {
    const { deps, memoryCreate, linkCreate, memoryFindFirst } = makeDeps(handoffEvidence)
    memoryFindFirst.mockResolvedValue({ id: "m-existing", status: "CANDIDATE" })
    const report = await runConsolidation(deps as never)
    expect(memoryCreate).not.toHaveBeenCalled()
    expect(linkCreate).toHaveBeenCalledTimes(1)
    expect(linkCreate.mock.calls[0][0].data.evidenceId).toBe("ev-h1")
    expect(report.handoffDigestsCreated).toHaveLength(0)
  })

  it("非 HANDOFF 来源（PLAN/SPEC/DEV_OPERATION）不生成摘要候选", async () => {
    const nonHandoff = handoffEvidence.map((e) => ({ ...e, sourceType: "PLAN" }))
    const { deps, memoryCreate } = makeDeps(nonHandoff)
    const report = await runConsolidation(deps as never)
    expect(report.handoffDigestsCreated).toEqual([])
    expect(memoryCreate).not.toHaveBeenCalled()
  })

  it("digest 步异常被隔离：入 errors，其他步照常返回", async () => {
    const { deps, evidenceFindMany } = makeDeps(handoffEvidence)
    evidenceFindMany.mockRejectedValue(new Error("evidence table unavailable"))
    const report = await runConsolidation(deps as never)
    expect(report.errors.some((e) => e.includes("handoff-digest"))).toBe(true)
    expect(report.handoffDigestsCreated).toEqual([])
    expect(report.drain).toBeDefined()
    expect(report.duplicates).toEqual([])
  })
})
