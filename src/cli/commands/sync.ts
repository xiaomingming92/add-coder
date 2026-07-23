/*
 * Author       : xiaomingming wujixmm@gmail.com
 * Date         : 2026-07-16 10:20:00
 * LastEditors  : xiaomingming wujixmm@gmail.com
 * LastEditTime : 2026-07-23 10:00:00
 * FilePath     : /add-coder/src/cli/commands/sync.ts
 * Description  : ADD 模板增量同步命令 — 补缺所有 adapter 文件
 */
import { existsSync } from "fs";
import { resolve } from "path";
import { renderCore } from "../../core/renderer";
import { renderAdapter as renderClaude } from "../../adapters/claude/renderer";
import { renderAdapter as renderQoder } from "../../adapters/qoder/renderer";
import { renderAdapter as renderVSCode } from "../../adapters/vscode/renderer";
import { renderAdapter as renderTrae } from "../../adapters/trae/renderer";
import { renderAdapter as renderCodex } from "../../adapters/codex/renderer";
import type { Adapter, AddCoderConfig } from "../../config/schema";
import { writeFiles } from "../writer";
import { loadConfig } from "../config-loader";
import { detectIDE, resolveAdapters } from "../detect";

import { selectFiles } from "../../lib/select-files";

const ADAPTER_RENDERERS: Record<string, (config: AddCoderConfig, targetDir: string, dryRun: boolean, magicDir: string) => Map<string, string>> = {
    claude: renderClaude, qoder: renderQoder, vscode: renderVSCode, trae: renderTrae, codex: renderCodex,
};
const MAGIC_DIR_MAP: Record<string, string> = { claude: ".claude", qoder: ".qoder", vscode: ".vscode", trae: ".trae", codex: ".codex" };

function resolveAdapter(projectRoot: string, specified?: string): Adapter {
    if (specified) {
        if (!MAGIC_DIR_MAP[specified]) throw new Error(`未知 adapter: ${specified}`);
        console.log(`目标 IDE: ${specified} (--adapter)`);
        return specified as Adapter;
    }
    const detected = detectIDE(projectRoot);
    if (detected !== "auto") { console.log(`检测到 IDE: ${detected} (自动)`); return detected as Adapter; }
    console.log("未检测到 IDE 环境，默认 qoder");
    return "qoder";
}

/**
 * @description: 增量同步缺失的 ADD 模板文件（含 adapter 专属文件），不覆盖已有文件
 * @param {object} options - 同步选项
 * @param {string} [options.adapter] - 手动指定 IDE 适配器
 * @return {Promise<void>}
 */
export async function syncCommand(options: { adapter?: string; interactive?: boolean } = {}) {
    const projectRoot = process.cwd();
    const target = resolveAdapter(projectRoot, options.adapter);
    const magicDir = MAGIC_DIR_MAP[target];

    const config: AddCoderConfig = await loadConfig(projectRoot);
    config.projectRoot = projectRoot;
    config.magicDir = magicDir;

    // 渲染 core 文件 → .add/ + magicDir/
    const coreFiles = renderCore(config, false);
    const CORE_TARGETS = [".add", magicDir];
    const allFiles = new Map<string, string>();
    for (const [relPath, content] of coreFiles) {
        for (const t of CORE_TARGETS) {
            const targetPath = relPath.replace(/^\.add/, t);
            if (!allFiles.has(targetPath)) allFiles.set(targetPath, content);
        }
    }

    // 渲染 adapter 文件
    const resolved = resolveAdapters(target);
    for (const adapter of resolved) {
        const renderFn = ADAPTER_RENDERERS[adapter];
        if (renderFn) {
            const adapterFiles = renderFn(config, projectRoot, false, magicDir);
            for (const [p, c] of adapterFiles) allFiles.set(p, c);
            console.log(`${adapter} adapter: ${adapterFiles.size} 文件`);
        }
    }

    // vscode / trae / codex 同步产出完整 .claude/
    if (resolved.includes("vscode") || resolved.includes("trae") || resolved.includes("codex")) {
        const claudeFiles = renderClaude(config, projectRoot, false, ".claude");
        for (const [p, c] of claudeFiles) allFiles.set(p, c);
        console.log(`claude adapter (via Agent Host): ${claudeFiles.size} 文件`);
    }

    // 过滤：只保留缺失的文件
    const missing = new Map<string, string>();
    for (const [relPath, content] of allFiles) {
        if (!existsSync(resolve(projectRoot, relPath))) {
            missing.set(relPath, content);
        }
    }

    if (missing.size === 0) {
        console.log("所有 ADD 模板文件已就位。");
        return;
    }

    let filesToWrite = missing;
    if (options.interactive) {
        filesToWrite = await selectFiles(projectRoot, missing);
        if (filesToWrite.size === 0) {
            console.log("未选择任何文件，已取消。");
            return;
        }
    }

    const result = await writeFiles(projectRoot, filesToWrite, { yes: true });
    console.log(`同步完成: 新建 ${result.created}, 跳过 ${result.skipped}`);
}
