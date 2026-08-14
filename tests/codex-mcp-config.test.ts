/*
 * Author       : xiaomingming wujixmm@gmail.com
 * Date         : 2026-08-10
 * Description  : Codex 原生适配回归：MCP TOML、项目配置 merge
 * 2026-08-14 bash 退役：移除「Codex scoped DB Hook status matrix」（bash detect_active_add 矩阵）
 *   与「Codex hooks adapter truth」（.sh 内容断言）——等价能力由 hook-consistency.test.ts
 *   矩阵 + tests/fixtures/hook-golden 固化覆盖；bash 收拢见 .backup/20260814_bash-hooks-retire/
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { parse } from "smol-toml";
import type { AddCoderConfig } from "../src/config/schema";

const mocks = vi.hoisted(() => ({
    renderAdapterBase: vi.fn(),
}));

vi.mock("../src/core/renderer", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../src/core/renderer")>();
    return { ...actual, renderAdapterBase: mocks.renderAdapterBase };
});

import {
    codexCommandFor,
    codexLaunchFor,
    mergeCodexProjectConfig,
    normalizeServerId,
    renderAdapter,
    renderCodexMcpTemplate,
} from "../src/adapters/codex/renderer";

const mockToml = [
    "[mcp_servers.add_coder]",
    "command = {{codexCommandToml}}",
    "args = {{codexArgsToml}}",
    "cwd = {{codexProjectRootToml}}",
    "startup_timeout_sec = 30",
    "",
    "[mcp_servers.add_coder.env]",
    "PROJECT_ROOT = {{codexProjectRootToml}}",
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

let targetDir: string;

beforeEach(() => {
    targetDir = mkdtempSync(join(tmpdir(), "add-coder-codex-"));
    mocks.renderAdapterBase.mockReset();
    mocks.renderAdapterBase.mockReturnValue(new Map([
        [".codex/config.toml.example", mockToml],
        [".codex/hooks.json", '{"hooks":{}}'],
    ]));
});

afterEach(() => {
    if (existsSync(targetDir)) rmSync(targetDir, { recursive: true, force: true });
});

describe("Codex MCP launch", () => {
    it("归一化 server id", () => {
        expect(normalizeServerId("add-coder")).toBe("add_coder");
        expect(normalizeServerId("my-add-coder-server")).toBe("my_add_coder_server");
    });

    it("POSIX 使用 npx 与绝对脚本路径", () => {
        const launch = codexLaunchFor("linux", targetDir, ".codex");
        expect(codexCommandFor("linux")).toBe("npx");
        expect(launch).toEqual({
            command: "npx",
            args: ["tsx", join(targetDir, ".codex", "scripts", "mcp-server.ts")],
            cwd: targetDir,
        });
    });

    it("Windows 使用 cmd /c npx.cmd 参数而不是把整串塞进 command", () => {
        const launch = codexLaunchFor("win32", "C:\\repo", ".codex");
        expect(codexCommandFor("win32")).toBe("cmd");
        expect(launch.command).toBe("cmd");
        expect(launch.args.slice(0, 3)).toEqual(["/c", "npx.cmd", "tsx"]);
    });

    it("渲染结果可被标准 TOML parser 解析", () => {
        const toml = renderCodexMcpTemplate(mockToml, targetDir, ".codex", "linux");
        const parsed = parse(toml) as {
            mcp_servers: { add_coder: { command: string; args: string[]; cwd: string; env: { PROJECT_ROOT: string } } };
        };
        expect(parsed.mcp_servers.add_coder.command).toBe("npx");
        expect(parsed.mcp_servers.add_coder.args[1]).toBe(join(targetDir, ".codex", "scripts", "mcp-server.ts"));
        expect(parsed.mcp_servers.add_coder.cwd).toBe(targetDir);
        expect(parsed.mcp_servers.add_coder.env.PROJECT_ROOT).toBe(targetDir);
    });
});

describe("项目 .codex/config.toml merge", () => {
    it("缺少 add_coder 时保留既有内容并只追加一次", () => {
        const existing = 'model = "gpt-5"\n';
        const merged = mergeCodexProjectConfig(existing, mockToml);
        expect(merged.startsWith(existing)).toBe(true);
        expect(merged.match(/\[mcp_servers\.add_coder\]/g)).toHaveLength(1);
    });

    it("已存在 add_coder 时逐字节原样返回", () => {
        const existing = 'model = "gpt-5"\n\n[mcp_servers.add_coder]\ncommand = "custom"\n';
        expect(mergeCodexProjectConfig(existing, mockToml)).toBe(existing);
    });

    it("renderAdapter 同时输出 example、实际项目配置与官方 repo skills", () => {
        mkdirSync(join(targetDir, ".codex"), { recursive: true });
        const existing = 'model = "gpt-5"\n';
        writeFileSync(join(targetDir, ".codex", "config.toml"), existing, "utf-8");

        const files = renderAdapter({ ...baseConfig, projectRoot: targetDir }, targetDir, true, ".codex");
        const projectToml = files.get(".codex/config.toml")!;
        const parsed = parse(projectToml) as { mcp_servers: { add_coder: { command: string; env: { PROJECT_ROOT: string } } } };

        expect(projectToml.startsWith(existing)).toBe(true);
        expect(parsed.mcp_servers.add_coder.command).toBe(codexCommandFor(process.platform));
        expect(parsed.mcp_servers.add_coder.env.PROJECT_ROOT).toBe(targetDir);
        expect(files.get(".codex/config.toml.example")).not.toContain("{{codex");
        expect(files.get(".agents/skills/add-paradigm/SKILL.md")).toContain('name: "add-paradigm"');
        expect(files.get(".agents/skills/add-paradigm/SKILL.md")).toContain("`.codex/plans/");
        expect(files.get(".agents/skills/session-init/SKILL.md")).toContain('name: "session-init"');
        expect(files.get(".agents/skills/add-paradigm/SKILL.md")).not.toContain("{{magicDir}}");
        expect(files.get(".codex/hooks.json")).toBe('{"hooks":{}}');
    });
});
