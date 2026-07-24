/*
 * Author       : xiaomingming wujixmm@gmail.com
 * Date         : 2026-07-16 10:20:00
 * LastEditors  : xiaomingming wujixmm@gmail.com
 * LastEditTime : 2026-07-24 10:00:00
 * FilePath     : /add-coder/src/cli/commands/sync.ts
 * Description  : ADD 模板同步命令 — 补缺 / --patch 更新。策略由 caijuehub 驱动。
 */
import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { createHash } from "crypto";
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
import { SYNC_CONFIG } from "../../caijuehub/strategies/sync.strategy";

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
    if (detected !== "auto") { console.log(`检测到 IDE: ${detected} (自动)`); return detected; }
    console.log("未检测到 IDE 环境，默认 qoder");
    return "qoder";
}

function isUserData(p: string) { return SYNC_CONFIG.PATCH_GUARD.some(r => r.test(p)); }
function hash8(c: string) { return createHash("sha256").update(c).digest("hex").slice(0, SYNC_CONFIG.HASH_HEX_LENGTH); }
function loadHashFile(root: string, magic: string): Record<string, string> {
    try { return JSON.parse(readFileSync(resolve(root, magic, SYNC_CONFIG.HASH_OUTPUT_FILE), "utf-8")) as Record<string, string>; } catch { return {}; }
}
function loadVersionFile(root: string, magic: string): string {
    try { return readFileSync(resolve(root, magic, SYNC_CONFIG.VERSION_SENTINEL), "utf-8").trim(); } catch { return ""; }
}
function saveVersionFile(root: string, magic: string, version: string) {
    writeFileSync(resolve(root, magic, SYNC_CONFIG.VERSION_SENTINEL), version + "\n", "utf-8");
}
function saveHashFile(root: string, magic: string, files: Map<string, string>) {
    const m: Record<string, string> = {};
    for (const [p, c] of files) m[p] = hash8(c);
    writeFileSync(resolve(root, magic, SYNC_CONFIG.HASH_OUTPUT_FILE), JSON.stringify(m, null, 2) + "\n", "utf-8");
}

/**
 * @description: 增量同步缺失的 ADD 模板文件（含 adapter 专属文件）。--patch 覆盖已有。
 *              行为由 caijuehub/sync-rules.toml 驱动。
 * @param {object} options
 * @param {string} [options.adapter]
 * @param {boolean} [options.patch]
 * @param {boolean} [options.interactive]
 */
export async function syncCommand(options: { adapter?: string; interactive?: boolean; patch?: boolean } = {}) {
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

    // ════════════════ --patch: 双 hash + 冲突交互 ════════════════
    if (options.patch) {
        const candidates = new Map<string, string>();
        let skipped = 0;
        for (const [p, c] of allFiles) {
            if (isUserData(p)) { skipped++; continue; }
            candidates.set(p, c);
        }
        const outHash = loadHashFile(projectRoot, magicDir);
        const srcHashPath = resolve(projectRoot, "node_modules", "add-coder", "templates", ".add-coder-src-hash.json");
        let npmVersion = "";
        try { npmVersion = (JSON.parse(readFileSync(srcHashPath, "utf-8")) as Record<string, string>)._version ?? ""; } catch { /* ignore */ }
        const installedVersion = loadVersionFile(projectRoot, magicDir);
        const isFirstPatch = !installedVersion;
        const isUpgrade = installedVersion && npmVersion && installedVersion !== npmVersion;
        const hashLost = installedVersion && !isUpgrade && Object.keys(outHash).length === 0;
        const establishBaseline = isFirstPatch || isUpgrade;
        if (isFirstPatch) { console.log(`🎯 首次 patch，建立基线 v${npmVersion}`); }
        else if (isUpgrade) { console.log(`🎯 版本升级: ${installedVersion} → ${npmVersion}，建立新基线`); }
        else if (hashLost) { console.log(`⚠️  hash 丢失（版本 ${installedVersion} 未变），全部进交互确认`); }
        const missingFiles = new Map<string, string>();
        const conflictFiles = new Map<string, string>();
        let sameCount = 0;
        for (const [relPath, content] of candidates) {
            const absPath = resolve(projectRoot, relPath);
            if (!existsSync(absPath)) {
                missingFiles.set(relPath, content);
            } else if (establishBaseline) {
                missingFiles.set(relPath, content);
            } else {
                const curH = hash8(readFileSync(absPath, "utf-8"));
                const storedH = outHash[relPath];
                if (storedH && curH === storedH) { sameCount++; }
                else { conflictFiles.set(relPath, content); }
            }
        }
        console.log(`patch: ${allFiles.size} → skip user ${skipped} | missing ${missingFiles.size} | conflict ${conflictFiles.size} | same ${sameCount}`);
        if (missingFiles.size > 0) {
            const r = await writeFiles(projectRoot, missingFiles, { force: true, yes: true });
            console.log(`  missing: 新建 ${r.created}`);
        }
        if (conflictFiles.size > 0) {
            const sel = await selectFiles(projectRoot, conflictFiles);
            if (sel.size > 0) {
                const r = await writeFiles(projectRoot, sel, { force: true, yes: true });
                console.log(`  conflict: 覆盖 ${r.overwritten}, 跳过 ${conflictFiles.size - sel.size}`);
            } else {
                console.log(`  conflict: 用户取消，${conflictFiles.size} 个文件未写入`);
            }
        }
        if (missingFiles.size === 0 && conflictFiles.size === 0) {
            console.log(SYNC_CONFIG.PROMPT_PATCH_DONE);
        }
        saveHashFile(projectRoot, magicDir, new Map([...missingFiles, ...conflictFiles]));
        saveVersionFile(projectRoot, magicDir, npmVersion);
        return;
    }

    // ════════════ 默认：只补缺 ════════════
    const missing = new Map<string, string>();
    for (const [relPath, content] of allFiles) {
        if (!existsSync(resolve(projectRoot, relPath))) {
            missing.set(relPath, content);
        }
    }

    if (missing.size === 0) {
        console.log(SYNC_CONFIG.PROMPT_FULL);
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
