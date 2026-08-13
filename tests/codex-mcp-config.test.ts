/*
 * Author       : xiaomingming wujixmm@gmail.com
 * Date         : 2026-08-10
 * Description  : Codex 原生适配回归：MCP TOML、项目配置 merge、hooks wire、repo skills
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { spawnSync } from "child_process";
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

describe("Codex scoped DB Hook status matrix", () => {
    const commonFiles = [
        resolve("templates/adapters/codex/hooks/lib/common.sh"),
        resolve(".codex/hooks/lib/common.sh"),
    ];

    function detect(common: string, snapshot: Record<string, unknown>, rc = 0, projectDir = targetDir) {
        const result = spawnSync("bash", ["-c", [
            'source "$COMMON_FILE"',
            'query_plan_status(){ printf "%s" "$TEST_SNAPSHOT"; return "$TEST_RC"; }',
            'out="$(detect_active_add)"; status=$?',
            'printf "%s\\n%s\\n" "$status" "$out"',
        ].join("\n")], {
            encoding: "utf8",
            env: {
                ...process.env,
                COMMON_FILE: common,
                PROJECT_DIR: projectDir,
                TEST_SNAPSHOT: JSON.stringify(snapshot),
                TEST_RC: String(rc),
            },
        });
        expect(result.status).toBe(0);
        const [status, ...output] = result.stdout.trimEnd().split("\n");
        return { status: Number(status), output: output.join("\n") };
    }

    const ready = (lifecycle: string, isActive: boolean) => ({
        availability: "READY",
        source: "database",
        planName: "runtime-plan-v1",
        lifecycle,
        isActive,
        approvalStatus: "TONGYI",
        progress: { doneTasks: 11, totalTasks: 38 },
    });

    it.each(commonFiles)("%s: ACTIVE/BLOCKED 由 DB snapshot 识别为活跃", (common) => {
        expect(detect(common, ready("ACTIVE", true))).toEqual({
            status: 0,
            output: "runtime-plan-v1::11/38::TONGYI::none::none",
        });
        expect(detect(common, ready("BLOCKED", true))).toEqual({
            status: 0,
            output: "runtime-plan-v1::11/38::TONGYI::none::none",
        });
    });

    it.each(commonFiles)("%s: CLOSED/DRAFT 不被残留文件复活", (common) => {
        const plans = join(targetDir, ".codex", "plans");
        mkdirSync(plans, { recursive: true });
        writeFileSync(join(plans, "runtime-plan-v1.md"), "# stale plan\n");
        writeFileSync(join(plans, "runtime-handoff-v1.md"), "# stale handoff\n");
        writeFileSync(join(plans, "runtime-add-route-v1.md"), "# stale route\n");
        expect(detect(common, ready("CLOSED", false))).toEqual({ status: 1, output: "" });
        expect(detect(common, ready("DRAFT", false))).toEqual({ status: 1, output: "" });
    });

    it.each(commonFiles)("%s: STATUS_UNAVAILABLE 独立 fail-closed，不谎报无 Plan", (common) => {
        expect(detect(common, {
            availability: "STATUS_UNAVAILABLE",
            source: "database",
            reason: "database offline",
        }, 3)).toEqual({
            status: 0,
            output: "__STATUS_UNAVAILABLE__::database offline::database::none::none",
        });
    });

    it.each(commonFiles)("%s: Plan/Handoff/add-route 创建与 mtime 不影响相同 DB 裁决", (common) => {
        const snapshot = ready("ACTIVE", true);
        const before = detect(common, snapshot);
        const plans = join(targetDir, ".codex", "plans");
        mkdirSync(plans, { recursive: true });
        writeFileSync(join(plans, "unrelated-plan-v9.md"), "# unrelated\n");
        writeFileSync(join(plans, "unrelated-handoff-v9.md"), "# unrelated\n");
        writeFileSync(join(plans, "unrelated-add-route-v9.md"), "# unrelated\n");
        const after = detect(common, snapshot);
        expect(after).toEqual(before);
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

describe("Codex hooks adapter truth", () => {
    const adapterRoot = resolve(import.meta.dirname, "../templates/adapters/codex");

    it("hooks.json 使用 event → matcher group → command handler 三层结构", () => {
        const config = JSON.parse(readFileSync(join(adapterRoot, "hooks.json"), "utf-8")) as {
            hooks: Record<string, Array<{ matcher?: string; hooks: Array<{ type: string; command: string }> }>>;
        };

        expect(config.hooks.Notification).toBeUndefined();
        expect(Object.keys(config.hooks)).toEqual([
            "SessionStart",
            "UserPromptSubmit",
            "PreToolUse",
            "PostToolUse",
            "Stop",
        ]);
        for (const groups of Object.values(config.hooks)) {
            for (const group of groups) {
                expect(Array.isArray(group.hooks)).toBe(true);
                for (const handler of group.hooks) {
                    expect(handler.type).toBe("command");
                    expect(handler.command).toContain("git rev-parse --show-toplevel");
                }
            }
        }
        expect(config.hooks.PreToolUse[0].matcher).toContain("apply_patch");
        expect(config.hooks.PostToolUse[0].matcher).toContain("apply_patch");
    });

    it("PreToolUse 使用 deny 并按 canonical apply_patch 分支", () => {
        const script = readFileSync(join(adapterRoot, "hooks/pre-tool-use.sh"), "utf-8");
        expect(script).toContain('permissionDecision: "deny"');
        expect(script).not.toContain('permissionDecision":"ask"');
        expect(script).not.toContain('permissionDecision: "ask"');
        expect(script).toContain('[ "$tool_name" = "apply_patch" ]');
    });

    it("PreToolUse 允许只读 sed 路径中的 -init，并阻断独立 in-place option", () => {
        const sourcePath = join(adapterRoot, "hooks/pre-tool-use.sh");
        const generatedPath = resolve(adapterRoot, "../../../.codex/hooks/pre-tool-use.sh");
        const source = readFileSync(sourcePath, "utf-8");
        expect(readFileSync(generatedPath, "utf-8")).toBe(source);
        expect(source).not.toContain("\\bsed\\b.*-i");

        const runHook = (scriptPath: string, command: string) => {
            const payloadPath = join(targetDir, "pre-tool-use-input.json");
            writeFileSync(payloadPath, JSON.stringify({ tool_name: "Bash", tool_input: { command } }), "utf-8");
            return spawnSync(
                "bash",
                ["-c", 'exec bash "$1" < "$2"', "pre-tool-use-test", scriptPath, payloadPath],
                { cwd: targetDir, encoding: "utf-8" },
            );
        };

        for (const scriptPath of [sourcePath, generatedPath]) {
            const readOnly = runHook(
                scriptPath,
                "wc -l .codex/skills/session-init/SKILL.md && sed -n '1,40p' .codex/skills/session-init/SKILL.md",
            );
            expect(readOnly.status, `${scriptPath}: ${readOnly.stderr}`).toBe(0);
            expect(readOnly.stdout).not.toContain('"permissionDecision":"deny"');

            for (const command of [
                "sed -i 's/a/b/' src/example.ts",
                "sed -n -i.bak '1,2p' src/example.ts",
                "sed --in-place=.bak 's/a/b/' src/example.ts",
            ]) {
                const blocked = runHook(scriptPath, command);
                expect(blocked.status, `${scriptPath}: ${command}`).toBe(2);
                expect(blocked.stdout).toContain('"permissionDecision":"deny"');
                expect(blocked.stderr).toContain("禁止通过 sed -i 直接编辑文件");
            }
        }
    });

    it("Stop 对 exit 0 使用 JSON 并防止递归 continuation", () => {
        const script = readFileSync(join(adapterRoot, "hooks/stop-check.sh"), "utf-8");
        expect(script).toContain("stop_hook_active");
        expect(script).toContain("jq -nc --arg message");
        expect(script).not.toContain('echo "[ADD Stop]');
        expect(script).not.toContain("IFS='::'");
    });

    it("PostToolUse 只有一个 shebang 且识别 apply_patch", () => {
        const script = readFileSync(join(adapterRoot, "hooks/post-tool-use.sh"), "utf-8");
        expect(script.match(/^#!\/bin\/bash/gm)).toHaveLength(1);
        expect(script).toContain('[ "$tool_name" = "apply_patch" ]');
    });

    it("Notification 保持 Codex 自治且只有一个脚本入口", () => {
        const script = readFileSync(join(adapterRoot, "hooks/notification.sh"), "utf-8");
        expect(script.match(/^#!\/bin\/bash/gm)).toHaveLength(1);
        expect(script).toContain('CURRENT_MAGIC=".codex"');
        expect(script).toContain('MAGIC_DIR=".codex"');
        expect(script).not.toContain("Claude Code 适配");
    });

    it("SessionStart 从 git root 定义 Codex plans 路径", () => {
        const script = readFileSync(join(adapterRoot, "hooks/session-start.sh"), "utf-8");
        expect(script).toContain('CURRENT_MAGIC=".codex"');
        expect(script).toContain("git rev-parse --show-toplevel");
        expect(script).toContain('PLANS_DIR="$PROJECT_DIR/$MAGIC_DIR/plans"');
        expect(script).toContain('TEMPLATES_DIR="$PROJECT_DIR/$CURRENT_MAGIC/templates"');
        expect(script).not.toContain("preload-templates.sh");
        expect(script).not.toContain("IFS='::'");
    });

    it("preload 从生成态 .codex/templates 消费 core 标准模板并在缺失时失败", () => {
        const source = readFileSync(join(adapterRoot, "hooks/lib/preload-templates.sh"), "utf-8");
        expect(source).toContain('TEMPLATES_DIR="${SCRIPT_DIR}/../../templates"');
        expect(source).not.toContain("../../../core/templates");

        const generatedRoot = join(targetDir, ".codex");
        const generatedScript = join(generatedRoot, "hooks/lib/preload-templates.sh");
        const templatesDir = join(generatedRoot, "templates");
        const nestedCwd = join(targetDir, "nested/cwd");
        mkdirSync(join(generatedRoot, "hooks/lib"), { recursive: true });
        mkdirSync(templatesDir, { recursive: true });
        mkdirSync(nestedCwd, { recursive: true });
        writeFileSync(generatedScript, source, "utf-8");
        writeFileSync(join(templatesDir, "simple-plan-template.md"), "simple sentinel\n", "utf-8");
        writeFileSync(join(templatesDir, "standard-plan-template.md"), "standard sentinel\n", "utf-8");

        const indexed = spawnSync("bash", [generatedScript, "--index"], {
            cwd: nestedCwd,
            encoding: "utf-8",
        });
        expect(indexed.status, indexed.stderr).toBe(0);
        expect(indexed.stdout).toContain("simple-plan-template.md");
        expect(indexed.stdout).toContain("standard-plan-template.md");

        rmSync(templatesDir, { recursive: true, force: true });
        const missing = spawnSync("bash", [generatedScript, "--index"], {
            cwd: nestedCwd,
            encoding: "utf-8",
        });
        expect(missing.status).not.toBe(0);
        expect(missing.stderr).toContain("[ADD preload] 模板目录不存在:");
        const reportedPath = missing.stderr.trim().replace("[ADD preload] 模板目录不存在: ", "");
        expect(resolve(reportedPath)).toBe(templatesDir);
    });

    it("UserPromptSubmit 与 PreToolUse 从 git root 运行，不加载旧 state-detect", () => {
        const promptScript = readFileSync(join(adapterRoot, "hooks/prompt-submit.sh"), "utf-8");
        const preToolScript = readFileSync(join(adapterRoot, "hooks/pre-tool-use.sh"), "utf-8");

        expect(promptScript).toContain('CURRENT_MAGIC=".codex"');
        expect(promptScript).toContain("git rev-parse --show-toplevel");
        expect(promptScript).toContain('source "$HOOK_DIR/lib/common.sh"');
        expect(promptScript).not.toContain("state-detect.sh");
        expect(promptScript).toContain('cd "$PROJECT_DIR"');
        expect(preToolScript).toContain('cd "$PROJECT_DIR"');
        expect(preToolScript).toContain('$PROJECT_DIR/$MAGIC_DIR/hitl/.tongyi-');
    });

    it("Codex hooks 只读取自己的 Plan/Spec/Review/HITL 真源", () => {
        const hookPaths = [
            "hooks/session-start.sh",
            "hooks/prompt-submit.sh",
            "hooks/pre-tool-use.sh",
            "hooks/post-tool-use.sh",
            "hooks/notification.sh",
            "hooks/lib/common.sh",
            "hooks/lib/context-inject.sh",
            "hooks/lib/vocabulary.sh",
        ];
        const crossAdapterState = /\.(?:qoder|claude|vscode|trae|add)\/(?:plans|specs|reviews|hitl|templates)/;
        const crossAdapterProbe = /for\s+[md]\s+in[^\n]*\.(?:qoder|claude|vscode|trae|add)/;

        for (const hookPath of hookPaths) {
            const script = readFileSync(join(adapterRoot, hookPath), "utf-8");
            expect(script, hookPath).not.toMatch(crossAdapterState);
            expect(script, hookPath).not.toMatch(crossAdapterProbe);
        }

        const preToolScript = readFileSync(join(adapterRoot, "hooks/pre-tool-use.sh"), "utf-8");
        expect(preToolScript).toContain("(^|/)\\.codex/(plans|specs|reviews)/");
    });

    it("Plan index 由脚本物理目录定位当前 adapter", () => {
        const script = readFileSync(resolve(adapterRoot, "../../core/scripts/gen-plan-index.sh"), "utf-8");
        expect(script).toContain('MAGIC_DIR="$(dirname "$SCRIPT_DIR")"');
        expect(script).not.toMatch(/for\s+d\s+in[^\n]*\.qoder/);
    });

    it("治理文档使用当前 adapter 内部的 Plan/Report 相对路径", () => {
        const docsRoot = resolve(adapterRoot, "../../core/docs");
        for (const name of [
            "ADD-governance-claude-code.md",
            "ADD-governance-codex.md",
            "ADD-governance-qoder-cn.md",
            "ADD-governance-trae.md",
            "ADD-governance-vscode-copilot.md",
        ]) {
            const content = readFileSync(join(docsRoot, name), "utf-8");
            expect(content, name).not.toContain("../.qoder/");
            expect(content, name).toContain("../plans/");
        }
    });

    it("审计写入与查询都回显 beforeState/afterState", () => {
        const auditSource = readFileSync(resolve(adapterRoot, "../../core/scripts/mcp-server/tools/audit.ts"), "utf-8");

        expect(auditSource).toContain("beforeState/afterState 必须提供非空 JSON 字符串");
        expect(auditSource).toContain("JSON.stringify(l.beforeState)");
        expect(auditSource).toContain("JSON.stringify(l.afterState)");
        expect(auditSource).toContain("JSON.stringify(log.beforeState)");
        expect(auditSource).toContain("JSON.stringify(log.afterState)");
    });
});
