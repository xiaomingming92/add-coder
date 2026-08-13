/**
 * MCP HITL 单元测试
 * 测试 HITL/Plan/Review 工具注册
 *
 * 运行: npx vitest run tests/hitl.test.ts
 */

import { describe, it, expect, vi } from "vitest"
import { McpServer } from "@modelcontextprotocol/server"

vi.mock("../templates/core/scripts/mcp-server/shared/prisma.js", () => ({
  prisma: new Proxy({}, { get: () => ({}) }),
}))

vi.mock("../templates/core/scripts/mcp-server/shared/env.js", () => ({
  PROJECT_ROOT: process.cwd(),
  PROJECT_ID: "add-coder",
  MAGIC_DIR: ".codex",
  DATABASE_URL: "postgresql://test.invalid/add_coder",
  getRuntimeContext: () => ({
    projectRoot: process.cwd(),
    projectKey: "test-project-key",
    adapterKey: "codex",
    magicDir: ".codex",
    contextId: "test-project-key:codex",
  }),
}))

function createServer() {
  return new McpServer(
    { name: "test-hitl", version: "0.0.0" },
    { capabilities: { tools: {} } }
  )
}

describe("HITL Tools: registerHitlTools", () => {
  it("注册不抛异常", async () => {
    const { registerHitlTools } = await import(
      "../templates/core/scripts/mcp-server/tools/hitl.js"
    )
    const server = createServer()
    expect(() => registerHitlTools(server)).not.toThrow()
  })

  it("重复注册抛出已存在错误", async () => {
    const { registerHitlTools } = await import(
      "../templates/core/scripts/mcp-server/tools/hitl.js"
    )
    const server = createServer()
    registerHitlTools(server)
    expect(() => registerHitlTools(server)).toThrow("already registered")
  })
})

describe("Plan Tools: registerPlanTools", () => {
  it("注册不抛异常", async () => {
    const { registerPlanTools } = await import(
      "../templates/core/scripts/mcp-server/tools/plan.js"
    )
    const server = createServer()
    expect(() => registerPlanTools(server)).not.toThrow()
  })

  it("重复注册抛出已存在错误", async () => {
    const { registerPlanTools } = await import(
      "../templates/core/scripts/mcp-server/tools/plan.js"
    )
    const server = createServer()
    registerPlanTools(server)
    expect(() => registerPlanTools(server)).toThrow("already registered")
  })
})

describe("Review Tools: registerReviewTools", () => {
  it("注册不抛异常", async () => {
    const { registerReviewTools } = await import(
      "../templates/core/scripts/mcp-server/tools/review.js"
    )
    const server = createServer()
    expect(() => registerReviewTools(server)).not.toThrow()
  })

  it("重复注册抛出已存在错误", async () => {
    const { registerReviewTools } = await import(
      "../templates/core/scripts/mcp-server/tools/review.js"
    )
    const server = createServer()
    registerReviewTools(server)
    expect(() => registerReviewTools(server)).toThrow("already registered")
  })
})

describe("Tools Index: 9 工具全部注册", () => {
  it("registerAllTools 不抛异常", async () => {
    const { registerAllTools } = await import(
      "../templates/core/scripts/mcp-server/tools/index.js"
    )
    const server = createServer()
    expect(() => registerAllTools(server)).not.toThrow()
  })
})
