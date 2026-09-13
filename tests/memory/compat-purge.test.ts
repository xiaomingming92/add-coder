/*
 * 轮 2 契约测试：v1 兼容门面 + 合规清除（Spec §4 §CompatAndPurge）
 *
 * 覆盖验收项：
 *  - v1 shim 5 工具注册表 + 弃用响应（deprecated/mappedTo/hint，且不执行写入）
 *  - forget/合规清除：物理删除 + 清三类外键占用 + AuditLog 留痕（先留痕后删行）
 *  - 越库与不存在的记忆被拒绝（稳定错误码）
 *  - ftsCleared 语义（行删除即同步索引）与 vectorCleared 由 embeddingState 决定
 */
import { describe, expect, it, vi } from "vitest"
import type { ToolRegistrar } from "../../templates/core/scripts/mcp-server/tools/registrar.js"

// memory-compat 在模块层加载 prisma/env（工具注册用），纯函数与 purgeMemory 不需要真实连接：
// 与 tools-memory.test.ts 同模式，对两个模块做 stub，保证测试不触库。
const mocks = vi.hoisted(() => ({
  memFindUnique: vi.fn(),
  memDelete: vi.fn(),
  memUpdateMany: vi.fn(),
  linkDeleteMany: vi.fn(),
  itemDeleteMany: vi.fn(),
  auditCreate: vi.fn(),
  userFindUnique: vi.fn(),
  userCreate: vi.fn(),
}))

vi.mock("../../templates/core/scripts/mcp-server/shared/prisma.js", () => ({
  prisma: {
    addMemory: {
      findUnique: mocks.memFindUnique,
      delete: mocks.memDelete,
      updateMany: mocks.memUpdateMany,
    },
    addMemoryEvidenceLink: { deleteMany: mocks.linkDeleteMany },
    addMemoryRecallItem: { deleteMany: mocks.itemDeleteMany },
    auditLog: { create: mocks.auditCreate },
    addUser: { findUnique: mocks.userFindUnique, create: mocks.userCreate },
  },
}))

vi.mock("../../templates/core/scripts/mcp-server/shared/env.js", () => ({
  getRuntimeContext: () => ({
    projectRoot: "/tmp/add-coder",
    projectKey: "compat-repo",
    adapterKey: "codex",
    magicDir: ".codex",
    contextId: "compat-repo:codex",
  }),
}))

import {
  SHIM_TABLE,
  buildShimPayload,
  purgeMemory,
  registerMemoryCompatTools,
  type PurgeDeps,
} from "../../templates/core/scripts/mcp-server/tools/memory-compat.js"

const repo = "compat-repo"

describe("v1 shim 门面", () => {
  it("5 个旧工具名映射到 v2（append/search/read/link/stats）", () => {
    expect(SHIM_TABLE).toHaveLength(5)
    const map = Object.fromEntries(SHIM_TABLE.map((s) => [s.v1, s.mappedTo]))
    expect(map).toEqual({
      append_memory: "propose_memory",
      search_memory: "recall_memory",
      read_memory: "get_memory",
      link_memory: "get_memory",
      memory_stats: "get_memory_health",
    })
  })

  it("弃用响应：deprecated=true + mappedTo + 迁移指引，且明确未执行", () => {
    const payload = buildShimPayload("append_memory", { topic: "x", content: "y" })
    expect(payload.deprecated).toBe(true)
    expect(payload.v1).toBe("append_memory")
    expect(payload.mappedTo).toBe("propose_memory")
    expect(payload.mappedArgs).toEqual({ topic: "x", content: "y" })
    expect(payload.executed).toBe(false)
    expect(payload.hint).toContain("propose_memory")
  })

  it("未知旧名不谎报映射", () => {
    const payload = buildShimPayload("unknown_v1_tool", {})
    expect(payload.mappedTo).toBeNull()
    expect(payload.hint).toContain("未知")
  })

  it("注册面：5 个 v1 门面 + forget_memory 全部注册，且门面返回弃用载荷", async () => {
    const tools = new Map<string, (args: Record<string, unknown>) => Promise<{ content: { text: string }[]; isError?: boolean }>>()
    const registrar = {
      registerTool(name: string, _config: unknown, cb: never) {
        tools.set(name, cb)
        return undefined as never
      },
    } as unknown as ToolRegistrar
    registerMemoryCompatTools(registrar)

    const names = [...tools.keys()].sort()
    expect(names).toEqual([
      "append_memory", "forget_memory", "link_memory",
      "memory_stats", "read_memory", "search_memory",
    ])
    const res = await tools.get("search_memory")!({ query: "找约束" })
    const payload = JSON.parse(res.content[0].text) as { deprecated: boolean; mappedTo: string | null }
    expect(payload.deprecated).toBe(true)
    expect(payload.mappedTo).toBe("recall_memory")
  })

  it("forget_memory 缺 confirm=true 时拒绝（防误删）", async () => {
    const tools = new Map<string, (args: Record<string, unknown>) => Promise<{ content: { text: string }[]; isError?: boolean }>>()
    const registrar = {
      registerTool(name: string, _config: unknown, cb: never) {
        tools.set(name, cb)
        return undefined as never
      },
    } as unknown as ToolRegistrar
    registerMemoryCompatTools(registrar)
    const res = await tools.get("forget_memory")!({
      repositoryRef: "compat-repo", memoryId: "m-1", reason: "secret", confirm: false,
    })
    expect(res.isError).toBe(true)
    expect(res.content[0].text).toContain("confirm=true")
  })
})

/** 假 deps：记录调用顺序，便于断言「先留痕后删行」；返回 spy 本体供断言复用 */
function makePurgeDeps(row: Record<string, unknown> | null) {
  const order: string[] = []
  const memFindUnique = vi.fn(() => Promise.resolve(row))
  const memUpdateMany = vi.fn(() => {
    order.push("clearSupersedePointers")
    return Promise.resolve({ count: 2 })
  })
  const memDelete = vi.fn(() => {
    order.push("deleteMemory")
    return Promise.resolve(row)
  })
  const linkDeleteMany = vi.fn(() => {
    order.push("clearLinks")
    return Promise.resolve({ count: 3 })
  })
  const itemDeleteMany = vi.fn(() => {
    order.push("clearRecallItems")
    return Promise.resolve({ count: 1 })
  })
  const auditCreate = vi.fn(({ data }: { data: Record<string, unknown> }) => {
    order.push("writeAudit")
    return Promise.resolve({ id: "audit-1", ...data })
  })
  const deps = {
    repositoryRef: repo,
    context: { projectKey: repo, adapterKey: "codex", contextId: "ctx-1" },
    memoryDb: { findUnique: memFindUnique, updateMany: memUpdateMany, delete: memDelete },
    linkDb: { deleteMany: linkDeleteMany },
    recallItemDb: { deleteMany: itemDeleteMany },
    auditDb: { create: auditCreate },
    ensureUserId: vi.fn(() => Promise.resolve("ai-assistant")),
  } as unknown as PurgeDeps
  return { deps, order, memFindUnique, memDelete, linkDeleteMany, auditCreate }
}

const memoryRow = {
  id: "m-1",
  repositoryRef: repo,
  status: "ACTIVE",
  kind: "CONSTRAINT",
  topic: "敏感结论",
  contentHash: "h-1",
  scopeType: "REPOSITORY",
  scopeValue: repo,
  embeddingState: "DISABLED",
}

describe("purgeMemory 合规清除", () => {
  it("清三类占用 → 先写审计 → 再删行，并返回清除计数", async () => {
    const { deps, order } = makePurgeDeps(memoryRow)
    const result = await purgeMemory(deps, {
      memoryId: "m-1", repositoryRef: repo, reason: "secret", actor: "human",
    })

    expect(order).toEqual([
      "clearLinks",
      "clearRecallItems",
      "clearSupersedePointers",
      "writeAudit",
      "deleteMemory",
    ])
    expect(result).toMatchObject({
      deleted: true, memoryId: "m-1", reason: "secret",
      ftsCleared: true, vectorCleared: false,
      clearedLinks: 3, clearedRecallItems: 1, clearedSupersedePointers: 2,
      auditId: "audit-1",
    })
  })

  it("审计内容含清除前后状态与原因（ADD-5）", async () => {
    const { deps, auditCreate } = makePurgeDeps(memoryRow)
    await purgeMemory(deps, { memoryId: "m-1", repositoryRef: repo, reason: "compliance" })
    const data = auditCreate.mock.calls[0][0].data
    expect(data.action).toBe("MEMORY_PURGE")
    expect(data.projectKey).toBe(repo)
    expect(data.reason).toBe("compliance")
    const before = data.beforeState as Record<string, unknown>
    expect(before.evidenceLinks).toBe(3)
    expect(before.recallItems).toBe(1)
    expect(before.supersedePointers).toBe(2)
    expect(before.status).toBe("ACTIVE")
    const after = data.afterState as Record<string, unknown>
    expect(after.deleted).toBe(true)
    expect(after.ftsCleared).toBe(true)
  })

  it("非 DISABLED 的 embeddingState → vectorCleared=true（有向量列需清）", async () => {
    const { deps } = makePurgeDeps({ ...memoryRow, embeddingState: "ENABLED" })
    const result = await purgeMemory(deps, { memoryId: "m-1", repositoryRef: repo, reason: "privacy" })
    expect(result.vectorCleared).toBe(true)
  })

  it("越库清除被拒绝，且不删除任何数据", async () => {
    const { deps, memDelete, auditCreate } = makePurgeDeps({ ...memoryRow, repositoryRef: "other-repo" })
    await expect(
      purgeMemory(deps, { memoryId: "m-1", repositoryRef: repo, reason: "secret" }),
    ).rejects.toThrow(/ERR_REPOSITORY_MISMATCH/)
    expect(memDelete).not.toHaveBeenCalled()
    expect(auditCreate).not.toHaveBeenCalled()
  })

  it("调用方 repositoryRef 与运行时不一致 → 直接拒绝", async () => {
    const { deps, memFindUnique } = makePurgeDeps(memoryRow)
    await expect(
      purgeMemory(deps, { memoryId: "m-1", repositoryRef: "other-repo", reason: "secret" }),
    ).rejects.toThrow(/ERR_REPOSITORY_MISMATCH/)
    expect(memFindUnique).not.toHaveBeenCalled()
  })

  it("记忆不存在 → ERR_NOT_FOUND（不产生审计噪声）", async () => {
    const { deps, auditCreate } = makePurgeDeps(null)
    await expect(
      purgeMemory(deps, { memoryId: "missing", repositoryRef: repo, reason: "compliance" }),
    ).rejects.toThrow(/ERR_NOT_FOUND/)
    expect(auditCreate).not.toHaveBeenCalled()
  })
})
