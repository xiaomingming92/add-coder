/**
 * MCP Hook Notify 单元测试
 * 测试 hook 事件工具 + Resource 注册
 *
 * 运行: npx vitest run tests/hook-notify.test.ts
 */

import { describe, it, expect } from "vitest"
import { McpServer } from "@modelcontextprotocol/server"

function createServer() {
  return new McpServer(
    { name: "test-hook-notify", version: "0.0.0" },
    { capabilities: { tools: {}, resources: { subscribe: true } } }
  )
}

describe("Hook Event Tools: registerHookEventTools", () => {
  it("注册不抛异常", async () => {
    const { registerHookEventTools } = await import(
      "../templates/core/scripts/mcp-server/tools/hook-event-report.js"
    )
    const server = createServer()
    expect(() => registerHookEventTools(server)).not.toThrow()
  })

  it("重复注册抛出已存在错误", async () => {
    const { registerHookEventTools } = await import(
      "../templates/core/scripts/mcp-server/tools/hook-event-report.js"
    )
    const server = createServer()
    registerHookEventTools(server)
    expect(() => registerHookEventTools(server)).toThrow("already registered")
  })

  it("get_hook_events 工具在 tools/index.ts 中被注册", async () => {
    const { registerAllTools } = await import(
      "../templates/core/scripts/mcp-server/tools/index.js"
    )
    const server = createServer()
    expect(() => registerAllTools(server)).not.toThrow()
  })
})

describe("Hook Event Resources: registerHookEventResources", () => {
  it("注册不抛异常", async () => {
    const { registerHookEventResources } = await import(
      "../templates/core/scripts/mcp-server/resources/hook-events-report.js"
    )
    const server = createServer()
    expect(() => registerHookEventResources(server)).not.toThrow()
  })

  it("重复注册抛出已存在错误", async () => {
    const { registerHookEventResources } = await import(
      "../templates/core/scripts/mcp-server/resources/hook-events-report.js"
    )
    const server = createServer()
    registerHookEventResources(server)
    expect(() => registerHookEventResources(server)).toThrow("already registered")
  })

  it("两个 Resource 均在 resources/index.ts 中被注册", async () => {
    const { registerAllResources } = await import(
      "../templates/core/scripts/mcp-server/resources/index.js"
    )
    const server = createServer()
    expect(() => registerAllResources(server)).not.toThrow()
  })
})
