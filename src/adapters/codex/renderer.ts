/*
 * @Author       : xiaomingming wujixmm@gmail.com
 * @Date         : 2026-07-17 18:26:20
 * @LastEditors  : xiaomingming wujixmm@gmail.com
 * @LastEditTime : 2026-08-12 19:30:00
 * @FilePath     : /add-coder/src/adapters/codex/renderer.ts
 * @Description  : Codex 原生适配：项目 MCP 配置、hooks 模板与 repo skills 发现映射
 */
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import type { AddCoderConfig } from "../../config/schema";
import { render, renderAdapterBase } from "../../core/renderer";
import { magicDirFor } from "../../shared/paths.js";

const __dirname = import.meta.dirname;
const CODEX_SERVER_ID = "add_coder";

export interface CodexLaunch {
    command: string;
    args: string[];
    cwd: string;
}

// server id 归一化规则：add-coder → add_coder（连字符转下划线）
export function normalizeServerId(name: string): string {
    return name.replace(/-/g, "_");
}

export function codexCommandFor(platform: NodeJS.Platform): string {
    return platform === "win32" ? "cmd" : "npx";
}

export function codexLaunchFor(
    platform: NodeJS.Platform,
    targetDir: string,
    magicDir: string,
): CodexLaunch {
    const serverPath = join(targetDir, magicDir, "scripts", "mcp-server.ts");
    const command = codexCommandFor(platform);
    const args = platform === "win32"
        ? ["/c", "npx.cmd", "tsx", serverPath]
        : ["tsx", serverPath];
    return { command, args, cwd: targetDir };
}

function tomlString(value: string): string {
    // TOML basic strings and JSON strings share the escaping needed for project paths.
    return JSON.stringify(value);
}

function tomlArray(values: string[]): string {
    return `[${values.map(tomlString).join(", ")}]`;
}

export function renderCodexMcpTemplate(
    template: string,
    targetDir: string,
    magicDir: string,
    platform: NodeJS.Platform = process.platform,
): string {
    const launch = codexLaunchFor(platform, targetDir, magicDir);
    return template
        .replaceAll("{{codexCommandToml}}", tomlString(launch.command))
        .replaceAll("{{codexArgsToml}}", tomlArray(launch.args))
        .replaceAll("{{codexProjectRootToml}}", tomlString(launch.cwd));
}

export function mergeCodexProjectConfig(existing: string, snippet: string): string {
    const serverTable = /^\s*\[mcp_servers\.(?:add_coder|["']add_coder["'])\]\s*(?:#.*)?$/m;
    if (serverTable.test(existing)) return existing;

    const normalizedSnippet = snippet.trim();
    if (!existing) return `${normalizedSnippet}\n`;
    const separator = existing.endsWith("\n") ? "\n" : "\n\n";
    return `${existing}${separator}${normalizedSnippet}\n`;
}

function findCoreSkillsDir(): string {
    // 源码模式: src/adapters/codex → ../../../templates
    // npm bundle: dist/index.js → ../templates
    const candidates = [
        join(__dirname, "../../../templates/core/skills"),
        join(__dirname, "../templates/core/skills"),
    ];
    const found = candidates.find(existsSync);
    if (!found) {
        throw new Error(`[codex adapter] core skills 真源缺失: ${candidates.join(" | ")}`);
    }
    return found;
}

export function renderCodexSkills(
    config: AddCoderConfig,
    skillsRoot: string = findCoreSkillsDir(),
): Map<string, string> {
    const files = new Map<string, string>();

    function walk(dir: string): void {
        for (const name of readdirSync(dir).sort()) {
            const full = join(dir, name);
            if (statSync(full).isDirectory()) {
                walk(full);
                continue;
            }
            const targetRel = join(".agents", "skills", relative(skillsRoot, full));
            files.set(targetRel, render(readFileSync(full, "utf-8"), config));
        }
    }

    walk(skillsRoot);
    return files;
}

export function renderAdapter(
    config: AddCoderConfig,
    targetDir: string,
    dryRun: boolean,
    magicDir: string,
): Map<string, string> {
    // Codex hooks（含 lib）是 adapter 完整真源，禁止 core hooks/lib 再覆盖。
    const files = renderAdapterBase(config, magicDir, magicDir === magicDirFor("vscode"), dryRun, false);
    const examplePath = join(magicDir, "config.toml.example");
    const projectConfigPath = join(magicDir, "config.toml");
    const example = files.get(examplePath);

    if (!example) {
        throw new Error(`[codex adapter] MCP 配置模板缺失: ${examplePath}`);
    }

    const snippet = renderCodexMcpTemplate(example, targetDir, magicDir);
    files.set(examplePath, snippet);

    const existingPath = join(targetDir, projectConfigPath);
    const existing = existsSync(existingPath) ? readFileSync(existingPath, "utf-8") : "";
    files.set(projectConfigPath, mergeCodexProjectConfig(existing, snippet));

    for (const [relPath, content] of renderCodexSkills(config)) {
        files.set(relPath, content);
    }

    if (!files.has(join(".agents", "skills", "add-paradigm", "SKILL.md"))) {
        throw new Error("[codex adapter] add-paradigm 未映射到 .agents/skills");
    }
    if (!files.has(join(".agents", "skills", "session-init", "SKILL.md"))) {
        throw new Error("[codex adapter] session-init 未映射到 .agents/skills");
    }

    // 防止常量与模板 server id 漂移。
    if (normalizeServerId("add-coder") !== CODEX_SERVER_ID || !snippet.includes(`[mcp_servers.${CODEX_SERVER_ID}]`)) {
        throw new Error(`[codex adapter] MCP server id 漂移: ${CODEX_SERVER_ID}`);
    }

    return files;
}
