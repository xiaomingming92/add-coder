/*
 * @Author       : xiaomingming wujixmm@gmail.com
 * @Date         : 2026-08-10 18:30:18
 * @LastEditors  : xiaomingming wujixmm@gmail.com
 * @LastEditTime : 2026-08-10 18:31:32
 * @FilePath     : /farm-agent/home/xmm/ai/add-coder/tests/codex-mcp-config.test.ts
 * @Description  : 
 */
/*
 * Author       : xiaomingming wujixmm@gmail.com
 * Date         : 2026-08-10
 * Description  : Codex 原生适配单测（轮次 1）：config.toml 渲染产物 + server id
 *                归一化 + Windows .cmd 平台分支（issue #12 验收 2/4）
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { normalizeServerId, codexCommandFor } from "../src/adapters/codex/renderer";

// renderAdapter 依赖真实模板目录（源码模式无 src/templates）→ mock renderAdapterBase
// 单测聚焦叠加逻辑：{{codexCommand}} 平台替换 + config.toml 条目处理
const mocks = vi.hoisted(() => ({
    renderAdapterBase: vi.fn(),
}));
vi.mock("../src/core/renderer", () => ({
    renderAdapterBase: mocks.renderAdapterBase,
}));
import { renderAdapter } from "../src/adapters/codex/renderer";
import type { AddCoderConfig } from "../src/config/schema";

const mockToml = [
    "[mcp_servers.add_coder]",
    'command = "{{codexCommand}}"',
    'args = ["tsx", ".codex/scripts/mcp-server.ts"]',
    "env = {",
    '  PROJECT_ROOT = "{{projectRoot}}"',
    "}",
].join("\n");

const baseConfig: AddCoderConfig = {
    projectName: "add-coder",
    projectRoot: "/tmp/test-project",
    sourceDir: "src",
    docsDir: "docs",
    logDir: "logs",
    envFilePath: ".env",
    auditLoggerPath: "src/lib/agent-audit-logger.ts",
    mcpServerCommand: "tsx",
    agentAuditImport: "@/lib/agent-audit-logger",
    magicDir: ".codex",
    adapters: ["codex"],
    overrides: {},
};

describe("normalizeServerId（server id 归一化）", () => {
    it("add-coder → add_coder（连字符转下划线）", () => {
        expect(normalizeServerId("add-coder")).toBe("add_coder");
    });
    it("已为下划线的输入幂等", () => {
        expect(normalizeServerId("add_coder")).toBe("add_coder");
    });
    it("多连字符全部归一化", () => {
        expect(normalizeServerId("my-add-coder-server")).toBe("my_add_coder_server");
    });
});

describe("codexCommandFor（平台分支）", () => {
    it("win32 → cmd /c npx.cmd（.cmd 分支）", () => {
        expect(codexCommandFor("win32")).toBe("cmd /c npx.cmd");
    });
    it("posix → npx", () => {
        expect(codexCommandFor("linux")).toBe("npx");
        expect(codexCommandFor("darwin")).toBe("npx");
    });
});

describe("renderAdapter（config.toml 渲染产物）", () => {
    beforeEach(() => {
        mocks.renderAdapterBase.mockReset();
        mocks.renderAdapterBase.mockReturnValue(
            new Map([
                [".codex/config.toml.example", mockToml],
                [".codex/hooks.json", '{"hooks":{}}'],
            ]),
        );
    });
    it("渲染产物含 config.toml 且 {{codexCommand}} 已替换（posix）", () => {
        const files = renderAdapter(baseConfig, "/tmp/test-project", true, ".codex");
        const toml = [...files.entries()].find(
            ([rel]) => rel.endsWith("config.toml.example") || rel.endsWith("config.toml"),
        );
        expect(toml).toBeDefined();
        const content = toml![1];
        expect(content).toContain("[mcp_servers.add_coder]");
        expect(content).not.toContain("{{codexCommand}}");
        expect(content).toContain('command = "npx"');
        expect(content).toContain("PROJECT_ROOT");
    });
    it("win32 平台时注入 .cmd 分支", () => {
        const orig = process.platform;
        Object.defineProperty(process, "platform", { value: "win32" });
        try {
            const files = renderAdapter(baseConfig, "/tmp/test-project", true, ".codex");
            const toml = [...files.entries()].find(
                ([rel]) => rel.endsWith("config.toml") || rel.endsWith("config.toml.example"),
            )!;
            expect(toml[1]).toContain('command = "cmd /c npx.cmd"');
        } finally {
            Object.defineProperty(process, "platform", { value: orig });
        }
    });
    it("非 config.toml 条目不被触碰", () => {
        const files = renderAdapter(baseConfig, "/tmp/test-project", true, ".codex");
        expect(files.get(".codex/hooks.json")).toBe('{"hooks":{}}');
    });
});
