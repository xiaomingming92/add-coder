/**
 * MCP Notifications 单元测试
 * 测试 sendLoggingMessage 推送和 registerAllNotifications 注册
 *
 * 运行: npx vitest run tests/notifications.test.ts
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
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

describe("Notifications: registerAllNotifications", () => {
    let server: McpServer

    beforeEach(() => {
        server = new McpServer(
            { name: "test", version: "0.0.0" },
            { capabilities: { tools: {} } }
        )
    })

    it("不抛异常", async () => {
        const { registerAllNotifications } = await import("../templates/core/scripts/mcp-server/notifications/index.js")
        expect(() => registerAllNotifications(server)).not.toThrow()
    })

    it("hitl 模块可注册", async () => {
        const { registerHitlNotifications } = await import("../templates/core/scripts/mcp-server/notifications/hitl.js")
        expect(() => registerHitlNotifications(server)).not.toThrow()
    })

    it("hook 模块可注册", async () => {
        const { registerHookNotifications } = await import("../templates/core/scripts/mcp-server/notifications/hook.js")
        expect(() => registerHookNotifications(server)).not.toThrow()
    })
})

describe("Notifications: sendLoggingMessage", () => {
    it("sendLoggingMessage 接受 notice 级别", async () => {
        const server = new McpServer(
            { name: "test", version: "0.0.0" },
            { capabilities: { tools: {} } }
        )
        await expect(
            server.sendLoggingMessage({ level: "notice" as const, data: "test" })
        ).resolves.not.toThrow()
    })

    it("sendLoggingMessage 接受 info 级别", async () => {
        const server = new McpServer(
            { name: "test", version: "0.0.0" },
            { capabilities: { tools: {} } }
        )
        await expect(
            server.sendLoggingMessage({ level: "info" as const, data: "info msg" })
        ).resolves.not.toThrow()
    })
})
