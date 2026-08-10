/*
 * @Author       : xiaomingming wujixmm@gmail.com
 * @Date         : 2026-07-17 18:26:20
 * @LastEditors  : xiaomingming wujixmm@gmail.com
 * @LastEditTime : 2026-08-10 17:20:00
 * @FilePath     : /add-coder/src/adapters/codex/renderer.ts
 * @Description  : Codex adapter 渲染 — 基础渲染 + config.toml 平台化叠加
 */
import type { AddCoderConfig } from "../../config/schema";
import { renderAdapterBase } from "../../core/renderer";

// server id 归一化规则：add-coder → add_coder（连字符转下划线，Codex MCP Server ID 约束）
export function normalizeServerId(name: string): string {
    return name.replace(/-/g, "_");
}

// config.toml 占位符注入：{{codexCommand}} 按平台选值（Windows .cmd 分支）
export function codexCommandFor(platform: NodeJS.Platform): string {
    return platform === "win32" ? "cmd /c npx.cmd" : "npx";
}

export function renderAdapter(
    config: AddCoderConfig,
    targetDir: string,
    dryRun: boolean,
    magicDir: string,
): Map<string, string> {
    const files = renderAdapterBase(config, magicDir, magicDir === ".vscode", dryRun);

    // 叠加：config.toml 平台化（win32 → cmd /c npx.cmd；posix → npx）
    // server id 固定 add_coder（归一化规则见 normalizeServerId，单测覆盖）
    const codexCommand = codexCommandFor(process.platform);
    for (const [rel, content] of files) {
        if (rel.endsWith("config.toml.example") || rel.endsWith("config.toml")) {
            files.set(rel, content.replaceAll("{{codexCommand}}", codexCommand));
        }
    }
    return files;
}
