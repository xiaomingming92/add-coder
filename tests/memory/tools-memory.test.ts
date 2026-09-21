/*
 * Memory 治理面 MCP 工具契约测试（轮次 3，Spec §8）
 *
 * 覆盖：
 * - 8 工具注册完整
 * - 越权请求全部 ERR_REPOSITORY_MISMATCH（8/8）
 * - 稳定错误码：ERR_SECRET_DETECTED / ERR_ORG_SCOPE_DISABLED / ERR_INVARIANT /
 *   ERR_NOT_FOUND / ERR_EVIDENCE_REQUIRED / ERR_APPROVAL_REQUIRED /
 *   ERR_ILLEGAL_TRANSITION / ERR_SUPERSESSION_INVALID
 * - propose 幂等（同幂等键 merged=true 不重复建行）
 * - resolve 状态机 + AuditLog 打点
 * - recall 包装管线返回 recallId + degradedMode 明示
 * - feedback 幂等 upsert
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ToolRegistrar } from "../../templates/core/scripts/mcp-server/tools/registrar.js"

// ── 行工厂（validatedDelegate 运行期校验要求全字段） ──
function makeMemoryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "m1",
    kind: "DECISION",
    status: "CANDIDATE",
    topic: "t",
    content: "c",
    summary: null,
    scopeType: "REPOSITORY",
    scopeValue: "add-coder",
    repositoryRef: "add-coder",
    importance: 0.5,
    confidence: 0.5,
    validFrom: new Date("2026-08-19"),
    validUntil: null,
    supersededById: null,
    contentHash: "h1",
    embeddingModel: null,
    embeddingDim: null,
    embeddingState: "DISABLED",
    createdBy: null,
    approvedBy: null,
    approvedAt: null,
    metadata: null,
    createdAt: new Date("2026-08-19"),
    updatedAt: new Date("2026-08-19"),
    ...overrides,
  }
}
function makeRecallRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "r1",
    repositoryRef: "add-coder",
    query: "q",
    stage: "prompt",
    consumerRef: null,
    scopeContext: {},
    candidateIds: [],
    selectedIds: [],
    scoreBreakdown: {},
    exclusionReasons: null,
    rankingVersion: "memory-rank-v1",
    tokenBudget: 1200,
    injectedTokens: 0,
    latencyMs: 1,
    degradedMode: null,
    createdAt: new Date("2026-08-19"),
    ...overrides,
  }
}

const mocks = vi.hoisted(() => ({
  memFindFirst: vi.fn(),
  memFindMany: vi.fn(),
  memFindUnique: vi.fn(),
  memCreate: vi.fn(),
  memUpdate: vi.fn(),
  evFindMany: vi.fn(),
  evUpsert: vi.fn(),
  linkFindMany: vi.fn(),
  linkFindFirst: vi.fn(),
  linkCreate: vi.fn(),
  recallFindMany: vi.fn(),
  recallFindUnique: vi.fn(),
  recallCreate: vi.fn(),
  itemFindMany: vi.fn(),
  itemCreate: vi.fn(),
  itemUpsert: vi.fn(),
  auditCreate: vi.fn(),
  userFindUnique: vi.fn(),
  userCreate: vi.fn(),
  queryRawUnsafe: vi.fn(),
}))

vi.mock("../../templates/core/scripts/mcp-server/shared/prisma.js", () => ({
  prisma: {
    addMemory: {
      findFirst: mocks.memFindFirst,
      findMany: mocks.memFindMany,
      findUnique: mocks.memFindUnique,
      create: mocks.memCreate,
      update: mocks.memUpdate,
    },
    addMemoryEvidence: { findMany: mocks.evFindMany, upsert: mocks.evUpsert },
    addMemoryEvidenceLink: { findMany: mocks.linkFindMany, findFirst: mocks.linkFindFirst, create: mocks.linkCreate },
    addMemoryRecall: { findMany: mocks.recallFindMany, findUnique: mocks.recallFindUnique, create: mocks.recallCreate },
    addMemoryRecallItem: { findMany: mocks.itemFindMany, create: mocks.itemCreate, upsert: mocks.itemUpsert },
    auditLog: { create: mocks.auditCreate },
    addUser: { findUnique: mocks.userFindUnique, create: mocks.userCreate },
    $queryRawUnsafe: mocks.queryRawUnsafe,
  },
}))

vi.mock("../../templates/core/scripts/mcp-server/shared/env.js", () => ({
  PROJECT_ID: "add-coder",
  PROJECT_ROOT: "/tmp/add-coder",
  DATABASE_URL: "postgresql://localhost:5434/add-coder",
  getRuntimeContext: () => ({
    projectRoot: "/tmp/add-coder",
    projectKey: "add-coder",
    adapterKey: "codex",
    magicDir: ".codex",
    contextId: "add-coder:codex",
  }),
}))

import { registerMemoryTools } from "../../templates/core/scripts/mcp-server/tools/memory.js"
import type { LexicalSearchAdapter } from "../../templates/core/scripts/mcp-server/shared/memory/retrieval/types.js"

type ToolCb = (args: Record<string, unknown>, ctx: unknown) => Promise<{ content: { type: string; text: string }[]; isError?: boolean }>

function setup(lexicalResults: { memoryId: string; rank: number; score?: number }[] = []) {
  const tools = new Map<string, ToolCb>()
  const registrar: ToolRegistrar = {
    registerTool(name: string, _config: unknown, cb: ToolCb) {
      tools.set(name, cb)
      return undefined as never
    },
  } as unknown as ToolRegistrar
  const lexical: LexicalSearchAdapter = {
    id: "fake-fts",
    search: async () => lexicalResults,
    health: async () => ({ component: "fts", status: "ok" }),
  }
  registerMemoryTools(registrar, {
    lexical: [lexical],
    rawQuerier: { query: (sql, params) => mocks.queryRawUnsafe(sql, ...params) },
  })
  return tools
}

const call = async (tools: Map<string, ToolCb>, name: string, args: Record<string, unknown>) => {
  const cb = tools.get(name)
  if (!cb) throw new Error(`tool ${name} 未注册`)
  const res = await cb(args, {})
  return { text: res.content[0].text, isError: res.isError === true }
}

const BASE = { repositoryRef: "add-coder" }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.memFindFirst.mockResolvedValue(null)
  mocks.memFindMany.mockResolvedValue([])
  mocks.memFindUnique.mockResolvedValue(null)
  mocks.memCreate.mockImplementation(async ({ data }) => makeMemoryRow({ id: "new-1", ...data }))
  mocks.memUpdate.mockImplementation(async ({ where, data }) => makeMemoryRow({ id: where.id, ...data }))
  mocks.evFindMany.mockResolvedValue([])
  mocks.evUpsert.mockImplementation(async ({ create }) => ({ id: "e1", repositoryRef: "add-coder", sourceType: "MANUAL", sourceRef: "ref", planKeyword: null, excerpt: "ref", contentHash: "eh", occurredAt: null, metadata: null, createdAt: new Date(), ...create }))
  mocks.linkFindMany.mockResolvedValue([])
  mocks.linkFindFirst.mockResolvedValue(null)
  mocks.linkCreate.mockResolvedValue({ memoryId: "new-1", evidenceId: "e1", relation: null, createdAt: new Date() })
  mocks.recallFindMany.mockResolvedValue([])
  mocks.recallFindUnique.mockResolvedValue(null)
  mocks.recallCreate.mockImplementation(async ({ data }) => makeRecallRow({ id: "rec-1", ...data }))
  mocks.itemFindMany.mockResolvedValue([])
  mocks.itemCreate.mockResolvedValue({ recallId: "rec-1", memoryId: "m1", selected: true, rank: 1, outcome: "UNKNOWN", feedback: null, updatedAt: new Date() })
  mocks.itemUpsert.mockResolvedValue({ recallId: "rec-1", memoryId: "m1", selected: true, rank: 1, outcome: "USED", feedback: null, updatedAt: new Date() })
  mocks.auditCreate.mockImplementation(async ({ data }) => ({ id: "audit-1", projectKey: "add-coder", producerAdapterKey: "codex", contextId: "add-coder:codex", action: "MEMORY_X", targetType: "AddMemory", targetId: "m1", beforeState: null, afterState: null, reason: null, planKeyword: null, createdAt: new Date(), ...data }))
  mocks.userFindUnique.mockResolvedValue({ id: "ai-assistant", username: "ai-assistant", email: "ai-assistant@internal" })
  mocks.userCreate.mockResolvedValue({ id: "ai-assistant", username: "ai-assistant", email: "ai-assistant@internal" })
  mocks.queryRawUnsafe.mockResolvedValue([])
})

describe("工具注册", () => {
  it("注册全部 9 个记忆工具（8 MVP + refresh_memory_snapshots 接线入口）", () => {
    const tools = setup()
    for (const name of ["propose_memory", "recall_memory", "get_memory", "list_memories", "review_memory", "resolve_memory", "feedback_memory", "get_memory_health", "refresh_memory_snapshots"]) {
      expect(tools.has(name), `缺少工具 ${name}`).toBe(true)
    }
    expect(tools.size).toBe(9)
  })
})

describe("越权防护（8/8 全部拒绝）", () => {
  it("repositoryRef 不一致 → ERR_REPOSITORY_MISMATCH", async () => {
    const tools = setup()
    const evil = { repositoryRef: "other-repo" }
    const cases: [string, Record<string, unknown>][] = [
      ["propose_memory", { ...evil, kind: "FACT", topic: "t", content: "c", scopeType: "REPOSITORY", scopeValue: "other-repo" }],
      ["recall_memory", { ...evil, query: "q", stage: "prompt" }],
      ["get_memory", { ...evil, memoryId: "m1" }],
      ["list_memories", evil],
      ["review_memory", evil],
      ["resolve_memory", { ...evil, memoryId: "m1", action: "archive" }],
      ["feedback_memory", { ...evil, recallId: "r1", memoryId: "m1", outcome: "USED" }],
      ["get_memory_health", evil],
    ]
    for (const [name, args] of cases) {
      const r = await call(tools, name, args)
      expect(r.isError, `${name} 应拒绝`).toBe(true)
      expect(r.text, `${name} 错误码`).toContain("ERR_REPOSITORY_MISMATCH")
    }
  })
})

describe("propose_memory", () => {
  const valid = { ...BASE, kind: "DECISION", topic: "迁移引擎", content: "仓库使用 Atlas 做版本化迁移", scopeType: "REPOSITORY", scopeValue: "add-coder" }

  it("创建 CANDIDATE（绝不直接 ACTIVE）并做冲突检测", async () => {
    const tools = setup()
    const r = await call(tools, "propose_memory", valid)
    expect(r.isError).toBe(false)
    const body = JSON.parse(r.text)
    expect(body.memoryId).toBe("new-1")
    expect(body.merged).toBe(false)
    expect(mocks.memCreate).toHaveBeenCalledOnce()
    expect(mocks.memCreate.mock.calls[0][0].data.status).toBeUndefined() // 由 schema 默认 CANDIDATE
  })

  it("幂等：同幂等键已存在 → merged=true，不重复建行", async () => {
    mocks.memFindFirst.mockResolvedValue(makeMemoryRow({ id: "existing-1" }))
    const tools = setup()
    const r = await call(tools, "propose_memory", valid)
    const body = JSON.parse(r.text)
    expect(body.merged).toBe(true)
    expect(body.memoryId).toBe("existing-1")
    expect(mocks.memCreate).not.toHaveBeenCalled()
  })

  it("密钥命中 → ERR_SECRET_DETECTED 拒写", async () => {
    const tools = setup()
    const r = await call(tools, "propose_memory", { ...valid, content: "token 是 sk-abcdefghijklmnopqrstuvwxyz" })
    expect(r.isError).toBe(true)
    expect(r.text).toContain("ERR_SECRET_DETECTED")
    expect(mocks.memCreate).not.toHaveBeenCalled()
  })

  it("ORGANIZATION scope → ERR_ORG_SCOPE_DISABLED", async () => {
    const tools = setup()
    const r = await call(tools, "propose_memory", { ...valid, scopeType: "ORGANIZATION", scopeValue: "org" })
    expect(r.isError).toBe(true)
    expect(r.text).toContain("ERR_ORG_SCOPE_DISABLED")
  })

  it("importance 越界 → ERR_INVARIANT", async () => {
    const tools = setup()
    const r = await call(tools, "propose_memory", { ...valid, importance: 2 })
    expect(r.isError).toBe(true)
    expect(r.text).toContain("ERR_INVARIANT")
  })

  it("关联证据：evidenceRefs 走 upsert + link（幂等）", async () => {
    const tools = setup()
    const r = await call(tools, "propose_memory", { ...valid, evidenceRefs: [".codex/plans/x.md", "audit:abc"] })
    expect(r.isError).toBe(false)
    const body = JSON.parse(r.text)
    expect(body.evidenceCount).toBe(2)
    expect(mocks.evUpsert).toHaveBeenCalledTimes(2)
    expect(mocks.linkCreate).toHaveBeenCalledTimes(2)
  })
})

describe("recall_memory", () => {
  it("包装管线：返回 recallId + degradedMode=fts-only 明示", async () => {
    mocks.memFindMany.mockResolvedValue([makeMemoryRow({ id: "m1", status: "ACTIVE" })])
    const tools = setup([{ memoryId: "m1", rank: 1, score: 0.9 }])
    const r = await call(tools, "recall_memory", { ...BASE, query: "迁移引擎是什么", stage: "prompt" })
    expect(r.isError).toBe(false)
    const body = JSON.parse(r.text)
    expect(body.recallId).toBe("rec-1")
    expect(body.degradedMode).toContain("fts-only")
    expect(body.rankingVersion).toBe("memory-rank-v1")
    expect(mocks.recallCreate).toHaveBeenCalledOnce() // Recall 审计落库
  })

  it("空候选也落审计（可重放）", async () => {
    const tools = setup([])
    const r = await call(tools, "recall_memory", { ...BASE, query: "无匹配查询", stage: "prompt" })
    const body = JSON.parse(r.text)
    expect(body.items).toEqual([])
    expect(body.recallId).toBe("rec-1")
    expect(body.candidateCount).toBe(0)
  })
})

describe("resolve_memory 状态机", () => {
  it("approve 无证据 → ERR_EVIDENCE_REQUIRED", async () => {
    mocks.memFindUnique.mockResolvedValue(makeMemoryRow({ status: "PENDING" }))
    const tools = setup()
    const r = await call(tools, "resolve_memory", { ...BASE, memoryId: "m1", action: "approve", actor: "zjw" })
    expect(r.isError).toBe(true)
    expect(r.text).toContain("ERR_EVIDENCE_REQUIRED")
    expect(mocks.memUpdate).not.toHaveBeenCalled()
  })

  it("approve 缺 actor → ERR_APPROVAL_REQUIRED", async () => {
    mocks.memFindUnique.mockResolvedValue(makeMemoryRow({ status: "PENDING" }))
    mocks.linkFindMany.mockResolvedValue([{ memoryId: "m1", evidenceId: "e1", relation: null, createdAt: new Date() }])
    const tools = setup()
    const r = await call(tools, "resolve_memory", { ...BASE, memoryId: "m1", action: "approve" })
    expect(r.text).toContain("ERR_APPROVAL_REQUIRED")
  })

  it("approve 合法 → ACTIVE + approvedBy/At + AuditLog 打点", async () => {
    mocks.memFindUnique.mockResolvedValue(makeMemoryRow({ status: "PENDING" }))
    mocks.linkFindMany.mockResolvedValue([{ memoryId: "m1", evidenceId: "e1", relation: null, createdAt: new Date() }])
    const tools = setup()
    const r = await call(tools, "resolve_memory", { ...BASE, memoryId: "m1", action: "approve", actor: "zjw", reason: "证据充分" })
    expect(r.isError).toBe(false)
    const body = JSON.parse(r.text)
    expect(body.oldStatus).toBe("PENDING")
    expect(body.newStatus).toBe("ACTIVE")
    expect(body.auditRef).toBe("audit-1")
    expect(mocks.memUpdate.mock.calls[0][0].data.status).toBe("ACTIVE")
    expect(mocks.memUpdate.mock.calls[0][0].data.approvedBy).toBe("zjw")
    expect(mocks.auditCreate).toHaveBeenCalledOnce()
  })

  it("非法迁移 ARCHIVED→approve → ERR_ILLEGAL_TRANSITION", async () => {
    mocks.memFindUnique.mockResolvedValue(makeMemoryRow({ status: "ARCHIVED" }))
    mocks.linkFindMany.mockResolvedValue([{ memoryId: "m1", evidenceId: "e1", relation: null, createdAt: new Date() }])
    const tools = setup()
    const r = await call(tools, "resolve_memory", { ...BASE, memoryId: "m1", action: "approve", actor: "zjw" })
    expect(r.text).toContain("ERR_ILLEGAL_TRANSITION")
  })

  it("supersede 缺 supersededById → ERR_SUPERSESSION_INVALID", async () => {
    mocks.memFindUnique.mockResolvedValue(makeMemoryRow({ status: "ACTIVE" }))
    const tools = setup()
    const r = await call(tools, "resolve_memory", { ...BASE, memoryId: "m1", action: "supersede" })
    expect(r.text).toContain("ERR_SUPERSESSION_INVALID")
  })

  it("supersede scope 不兼容 → ERR_SUPERSESSION_INVALID", async () => {
    mocks.memFindUnique
      .mockResolvedValueOnce(makeMemoryRow({ id: "m1", status: "ACTIVE", scopeType: "PATH", scopeValue: "src/a" }))
      .mockResolvedValueOnce(makeMemoryRow({ id: "m2", status: "ACTIVE", scopeType: "BRANCH", scopeValue: "main" }))
    const tools = setup()
    const r = await call(tools, "resolve_memory", { ...BASE, memoryId: "m1", action: "supersede", supersededById: "m2" })
    expect(r.text).toContain("ERR_SUPERSESSION_INVALID")
  })

  it("stale 映射为 mark_stale：ACTIVE → STALE", async () => {
    mocks.memFindUnique.mockResolvedValue(makeMemoryRow({ status: "ACTIVE" }))
    const tools = setup()
    const r = await call(tools, "resolve_memory", { ...BASE, memoryId: "m1", action: "stale", reason: "过期" })
    const body = JSON.parse(r.text)
    expect(body.newStatus).toBe("STALE")
  })

  it("记忆不存在 → ERR_NOT_FOUND", async () => {
    const tools = setup()
    const r = await call(tools, "resolve_memory", { ...BASE, memoryId: "nope", action: "archive" })
    expect(r.text).toContain("ERR_NOT_FOUND")
  })
})

describe("feedback_memory", () => {
  it("幂等 upsert outcome", async () => {
    mocks.recallFindUnique.mockResolvedValue(makeRecallRow())
    mocks.memFindUnique.mockResolvedValue(makeMemoryRow())
    const tools = setup()
    const r = await call(tools, "feedback_memory", { ...BASE, recallId: "r1", memoryId: "m1", outcome: "USEFUL", feedback: "命中" })
    expect(r.isError).toBe(false)
    expect(JSON.parse(r.text).updated).toBe(true)
    expect(mocks.itemUpsert).toHaveBeenCalledOnce()
    expect(mocks.itemUpsert.mock.calls[0][0].update.outcome).toBe("USEFUL")
  })

  it("recall 不存在 → ERR_NOT_FOUND", async () => {
    const tools = setup()
    const r = await call(tools, "feedback_memory", { ...BASE, recallId: "nope", memoryId: "m1", outcome: "USED" })
    expect(r.text).toContain("ERR_NOT_FOUND")
  })
})

describe("get_memory / list_memories / get_memory_health", () => {
  it("get_memory 返回 evidence/supersession/recallUsage 结构", async () => {
    mocks.memFindUnique.mockResolvedValue(makeMemoryRow({ status: "ACTIVE" }))
    mocks.itemFindMany.mockResolvedValue([{ recallId: "r1", memoryId: "m1", selected: true, rank: 1, outcome: "USED", feedback: null, updatedAt: new Date() }])
    mocks.recallFindMany.mockResolvedValue([makeRecallRow({ query: "迁移", stage: "dps" })])
    const tools = setup()
    const r = await call(tools, "get_memory", { ...BASE, memoryId: "m1" })
    const body = JSON.parse(r.text)
    expect(body.memory.id).toBe("m1")
    expect(body).toHaveProperty("evidence")
    expect(body).toHaveProperty("supersession")
    expect(body.recallUsage[0].query).toBe("迁移")
  })

  it("get_memory 越库记忆 → ERR_REPOSITORY_MISMATCH", async () => {
    mocks.memFindUnique.mockResolvedValue(makeMemoryRow({ repositoryRef: "other-repo" }))
    const tools = setup()
    const r = await call(tools, "get_memory", { ...BASE, memoryId: "m1" })
    expect(r.text).toContain("ERR_REPOSITORY_MISMATCH")
  })

  it("list_memories cursor 分页透传", async () => {
    mocks.memFindMany.mockResolvedValue([makeMemoryRow()])
    const tools = setup()
    const r = await call(tools, "list_memories", { ...BASE, status: "ACTIVE", cursor: "prev-id", limit: 10 })
    expect(r.isError).toBe(false)
    const args = mocks.memFindMany.mock.calls[0][0]
    expect(args.where.repositoryRef).toBe("add-coder")
    expect(args.where.status).toBe("ACTIVE")
    expect(args.cursor).toEqual({ id: "prev-id" })
    expect(args.skip).toBe(1)
  })

  it("get_memory_health 返回 backlog/leakage/provider/index 四段", async () => {
    mocks.queryRawUnsafe.mockResolvedValue([{ status: "CANDIDATE", count: 3 }])
    const tools = setup()
    const r = await call(tools, "get_memory_health", BASE)
    const body = JSON.parse(r.text)
    expect(body.backlog.candidate).toBe(3)
    expect(body.leakage.crossRepositorySelections).toBe(0)
    expect(body.providers.embedding.status).toBe("disabled")
    expect(body.index.status).toBe("ok")
  })
})
