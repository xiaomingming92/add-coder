/**
 * MCP Resources 单元测试
 * 测试 6 个 add-coder:// 端点的注册过程
 *
 * 运行: npx vitest run tests/resources.test.ts
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
        { name: "test", version: "0.0.0" },
        { capabilities: { resources: { subscribe: true } } }
    )
}

describe("Resources: registerAllResources", () => {
    it("不抛异常", async () => {
        const { registerAllResources } = await import("../templates/core/scripts/mcp-server/resources/index.js")
        const server = createServer()
        expect(() => registerAllResources(server)).not.toThrow()
    })

    it("重复注册抛出已存在错误", async () => {
        const { registerAllResources } = await import("../templates/core/scripts/mcp-server/resources/index.js")
        const server = createServer()
        registerAllResources(server)
        expect(() => registerAllResources(server)).toThrow("already registered")
    })
})

describe("Resources: 各子模块独立注册", () => {
    it("add-state: 注册 4 个端点", async () => {
        const { registerAddStateResources } = await import("../templates/core/scripts/mcp-server/resources/add-state.js")
        const server = createServer()
        expect(() => registerAddStateResources(server)).not.toThrow()
    })

    it("round-task: 注册 URI 模板端点", async () => {
        const { registerRoundTaskResources } = await import("../templates/core/scripts/mcp-server/resources/round-task.js")
        const server = createServer()
        expect(() => registerRoundTaskResources(server)).not.toThrow()
    })

    it("add-coder-version: 注册版本端点", async () => {
        const { registerVersionResource } = await import("../templates/core/scripts/mcp-server/resources/add-coder-version.js")
        const server = createServer()
        expect(() => registerVersionResource(server)).not.toThrow()
    })
})
