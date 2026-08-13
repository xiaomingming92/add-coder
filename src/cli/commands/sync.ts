/*
 * Author       : xiaomingming wujixmm@gmail.com
 * Date         : 2026-07-16 10:20:00
 * LastEditors  : xiaomingming wujixmm@gmail.com
 * LastEditTime : 2026-07-24 10:00:00
 * FilePath     : /add-coder/src/cli/commands/sync.ts
 * Description  : ADD 模板同步命令 — 补缺 / --patch 更新。策略由 caijuehub 驱动。
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { createHash } from "crypto";
import { renderCoreForTargets } from "../../core/renderer";
import { renderAdapter as renderClaude } from "../../adapters/claude/renderer";
import { renderAdapter as renderQoder } from "../../adapters/qoder/renderer";
import { renderAdapter as renderVSCode } from "../../adapters/vscode/renderer";
import { renderAdapter as renderTrae } from "../../adapters/trae/renderer";
import { renderAdapter as renderCodex } from "../../adapters/codex/renderer";
import type { Adapter, AddCoderConfig } from "../../config/schema";
import { writeFiles } from "../writer";
import { loadConfig } from "../config-loader";
import { detectIDE, resolveAdapters } from "../detect";
import { magicDirFor, ADD_DIR } from "../../shared/paths.js";

import { selectFiles } from "../../lib/select-files";
import { ask } from "../../lib/utils";
import { runCommand } from "../../lib/run-command";
import { resolveAtlasBin } from "../../caijuehub/strategies/prisma.strategy";
import { normalizeRelPath } from "../../lib/path-normalize";
import { resolveEmbeddingModel, isModelCached, ensureEmbeddingModel } from "../../lib/model-predownload";
import { ensurePortsContract } from "../../lib/ports-contract";
import { SYNC_CONFIG } from "../../caijuehub/strategies/sync.strategy";
import { SYNC_PRISMA_CONFIG } from "../../caijuehub/strategies/prisma-sync.strategy";
import { diffPrisma, parseSchemaBlocks } from "../writer";

const ADAPTER_RENDERERS: Record<string, (config: AddCoderConfig, targetDir: string, dryRun: boolean, magicDir: string) => Map<string, string>> = {
    claude: renderClaude, qoder: renderQoder, vscode: renderVSCode, trae: renderTrae, codex: renderCodex,
};

function resolveAdapter(projectRoot: string, specified?: string): Adapter {
    if (specified) {
        if (!magicDirFor(specified)) throw new Error(`未知 adapter: ${specified}`);
        console.log(`目标 IDE: ${specified} (--adapter)`);
        return specified as Adapter;
    }
    const detected = detectIDE(projectRoot);
    if (detected !== "auto") { console.log(`检测到 IDE: ${detected} (自动)`); return detected; }
    console.log("未检测到 IDE 环境，默认 qoder");
    return "qoder";
}

export function isUserData(p: string) { return SYNC_CONFIG.PATCH_GUARD.some(r => r.test(normalizeRelPath(p))); }
function hash8(c: string) { return createHash("sha256").update(c).digest("hex").slice(0, SYNC_CONFIG.HASH_HEX_LENGTH); }
export function classifyPatchCandidate(
    currentContent: string,
    incomingContent: string,
    storedHash?: string,
): "same" | "update" | "conflict" {
    const currentHash = hash8(currentContent);
    if (currentHash === hash8(incomingContent)) return "same";
    if (storedHash && currentHash === storedHash) return "update";
    return "conflict";
}
export type PatchConflictMode = "all" | "interactive" | "skip";

/** 当前 adapter 的 core 分发目标；Codex 自治，不写 `.add`。 */
export function coreTargetsForAdapter(target: Adapter, magicDir = magicDirFor(target)): string[] {
    return target === "codex" ? [magicDir] : [ADD_DIR, magicDir];
}

/** 仅依赖 Claude Agent Host 的 adapter 需要额外生成 `.claude`。 */
export function needsClaudeAgentHost(adapters: readonly string[]): boolean {
    return adapters.includes("vscode") || adapters.includes("trae");
}

/**
 * patch 冲突处理必须显式区分自动确认、交互终端与管道/CI：
 * - --yes：调用方已明确授权覆盖全部冲突；
 * - TTY：交给文件选择器逐项确认；
 * - non-TTY：没有可用的人机确认通道，默认跳过，禁止把 EOF 当成确认。
 */
export function resolvePatchConflictMode(
    yes = false,
    isTTY = Boolean(process.stdin.isTTY),
): PatchConflictMode {
    if (yes) return "all";
    return isTTY ? "interactive" : "skip";
}
export function loadHashFile(root: string, magic: string): Record<string, string> {
    try {
        const raw = JSON.parse(readFileSync(resolve(root, magic, SYNC_CONFIG.HASH_OUTPUT_FILE), "utf-8")) as Record<string, string>;
        // key 统一 POSIX：兼容既有 Windows 反斜杠 key（issue #10 P0-2 配套）
        const normalized: Record<string, string> = {};
        for (const [k, v] of Object.entries(raw)) normalized[normalizeRelPath(k)] = v;
        return normalized;
    } catch { return {}; }
}
function loadVersionFile(root: string, magic: string): string {
    try { return readFileSync(resolve(root, magic, SYNC_CONFIG.VERSION_SENTINEL), "utf-8").trim(); } catch { return ""; }
}
function saveVersionFile(root: string, magic: string, version: string) {
    writeFileSync(resolve(root, magic, SYNC_CONFIG.VERSION_SENTINEL), version + "\n", "utf-8");
}

/** 发布包与仓库自举共用的模板版本真源。 */
export function loadTemplateVersion(root: string): string {
    const candidates = [
        resolve(root, "node_modules", "add-coder", "templates", ".add-coder-src-hash.json"),
        resolve(import.meta.dirname, "../templates/.add-coder-src-hash.json"),
        resolve(import.meta.dirname, "../../../templates/.add-coder-src-hash.json"),
    ];
    for (const candidate of candidates) {
        try {
            return (JSON.parse(readFileSync(candidate, "utf-8")) as Record<string, string>)._version ?? "";
        } catch { /* try next package layout */ }
    }
    return "";
}
/**
 * 写 hash 文件。
 * ⚠️ 契约（Review-implementation #1 双重 hash 修复）：files 的 value 必须是**最终 hash 值**，
 * 直接写盘、禁止再次 hash8——上游 mergeFullHash 已产出最终 hash（outHash 旧值原样 + 磁盘刷新值）。
 * 历史上曾在此处二次 hash8 导致写盘 hash8(hash8(content))，下次 patch 全量误判 conflict。
 */
export function saveHashFile(root: string, magic: string, files: Map<string, string>) {
    const m: Record<string, string> = {};
    for (const [p, c] of files) m[p] = c;
    writeFileSync(resolve(root, magic, SYNC_CONFIG.HASH_OUTPUT_FILE), JSON.stringify(m, null, 2) + "\n", "utf-8");
}

/**
 * 全量基线合并（issue #10 P0-2）：旧 hash 全量保留 + 已确认 candidates 的磁盘内容刷新。
 * 未批准而跳过的 conflict 保留旧 hash，使下一轮仍是 conflict，禁止重复运行绕过确认。
 * ⚠️ 契约（Review-implementation #1）：返回值 value 为**最终 hash 值**（旧值原样、新值由 readDiskHash 提供），
 * 消费方（saveHashFile）直接写盘，禁止再次 hash。
 * @param outHash 旧 hash（key 已 POSIX 规范化，value 为 hash8 值）
 * @param candidates 本轮全部候选文件（relPath 可能含 Windows 反斜杠）
 * @param readDiskHash 读取磁盘当前内容并返回 **hash8 值**（文件不存在返回 null）
 * @param preserveKeys 本轮未批准的 conflict key；保留旧基线或保持无基线
 */
export function mergeFullHash(
    outHash: Record<string, string>,
    candidates: { relPath: string; absPath: string }[],
    readDiskHash: (absPath: string) => string | null,
    preserveKeys: ReadonlySet<string> = new Set(),
): Map<string, string> {
    const finalHash = new Map<string, string>();
    for (const [k, v] of Object.entries(outHash)) finalHash.set(k, v);
    for (const { relPath, absPath } of candidates) {
        const key = normalizeRelPath(relPath);
        // 未经明确批准而跳过的 conflict 必须保留旧基线；否则下一轮会被误判为安全 update。
        if (preserveKeys.has(key)) continue;
        const h = readDiskHash(absPath);
        if (h !== null) finalHash.set(key, h);
    }
    return finalHash;
}

/**
 * 移除不属于当前 adapter 分发集合的旧 hash 基线。
 * Codex 从历史 `.add/.claude` 联合分发迁移为自治后，必须清掉旧 key，
 * 否则后续 patch 仍会把越界文件视为 Codex 管理对象。
 */
export function pruneHashToCandidates(
    hashes: Map<string, string>,
    candidatePaths: Iterable<string>,
): Map<string, string> {
    const allowed = new Set([...candidatePaths].map(normalizeRelPath));
    return new Map([...hashes].filter(([key]) => allowed.has(normalizeRelPath(key))));
}

/**
 * @description: 增量同步缺失的 ADD 模板文件（含 adapter 专属文件）。--patch 覆盖已有。
 *              行为由 caijuehub/sync-rules.toml 驱动。
 * @param {object} options
 * @param {string} [options.adapter]
 * @param {boolean} [options.patch]
 * @param {boolean} [options.interactive]
 * @param {boolean} [options.model] 缓存缺失时下载 embedding 模型（review-implementation #1）
 * @param {boolean} [options.yes] 显式确认覆盖全部 patch 冲突并跳过后续询问
 */
/**
 * embedding 模型检测/下载（model-predownload Plan）：
 * - 默认：缓存缺失时仅提示 `model:download` 入口（不自动下载）
 * - `--model`：缓存缺失时触发下载；失败 warn 不阻断主流程（降级边界，Review P2 #3）
 * - resolveEmbeddingModel 抛错（toml 缺失）→ warn 后跳过检测
 */
async function maybeModelDownload(options: { model?: boolean }) {
    let model: string;
    try {
        model = resolveEmbeddingModel();
    } catch (e) {
        console.warn(`⚠️ 模型配置缺失（跳过检测）: ${e instanceof Error ? e.message : String(e)}`);
        return;
    }
    if (isModelCached(model)) return;
    if (options.model) {
        try {
            const r = await ensureEmbeddingModel();
            console.log(`模型预下载: ${r.status} (${r.model})`);
        } catch (e) {
            console.warn(`⚠️ 模型预下载失败（首次 DPS 调用会自动补下载）: ${e instanceof Error ? e.message : String(e)}`);
        }
    } else {
        console.log(`模型未预下载: 运行 \`add-coder model:download\` 提前下载（首次 DPS 调用也会自动下载）`);
    }
}

export async function syncCommand(options: { adapter?: string; interactive?: boolean; patch?: boolean; model?: boolean; yes?: boolean } = {}) {
    const projectRoot = process.cwd();
    const target = resolveAdapter(projectRoot, options.adapter);
    const magicDir = magicDirFor(target);

    const config: AddCoderConfig = await loadConfig(projectRoot);
    config.projectRoot = projectRoot;
    config.magicDir = magicDir;

    // Codex 是完整自治 adapter：只写 `.codex`；其他 adapter 保留既有 `.add + adapter` 分发。
    const coreTargets = coreTargetsForAdapter(target, magicDir);
    const allFiles = renderCoreForTargets(config, false, coreTargets);
    // 渲染 adapter 文件
    const resolved = resolveAdapters(target);
    for (const adapter of resolved) {
        const renderFn = ADAPTER_RENDERERS[adapter];
        if (renderFn) {
            const adapterMagicDir = magicDirFor(adapter);
            const adapterFiles = renderFn(
                { ...config, magicDir: adapterMagicDir },
                projectRoot,
                false,
                adapterMagicDir,
            );
            for (const [p, c] of adapterFiles) allFiles.set(p, c);
            console.log(`${adapter} adapter: ${adapterFiles.size} 文件`);
        }
    }

    // VS Code / Trae 仍使用 Claude Agent Host；Codex 有原生 hooks，不分发 `.claude`。
    if (needsClaudeAgentHost(resolved)) {
        const claudeMagicDir = magicDirFor("claude");
        const claudeFiles = renderClaude(
            { ...config, magicDir: claudeMagicDir },
            projectRoot,
            false,
            claudeMagicDir,
        );
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
        const npmVersion = loadTemplateVersion(projectRoot);
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
            // key 统一 POSIX（Windows 渲染路径为反斜杠，先 normalize 再参与比较/存储）
            const key = normalizeRelPath(relPath);
            const absPath = resolve(projectRoot, relPath);
            if (!existsSync(absPath)) {
                missingFiles.set(key, content);
            } else if (establishBaseline) {
                missingFiles.set(key, content);
            } else {
                const classification = classifyPatchCandidate(
                    readFileSync(absPath, "utf-8"),
                    content,
                    outHash[key],
                );
                if (classification === "same") sameCount++;
                else if (classification === "update") missingFiles.set(key, content);
                else conflictFiles.set(key, content);
            }
        }
        console.log(`patch: ${allFiles.size} → skip user ${skipped} | missing ${missingFiles.size} | conflict ${conflictFiles.size} | same ${sameCount}`);
        if (missingFiles.size > 0) {
            const r = await writeFiles(projectRoot, missingFiles, { force: true, yes: true });
            console.log(`  missing: 新建 ${r.created}`);
        }
        const unresolvedConflictKeys = new Set<string>();
        if (conflictFiles.size > 0) {
            const conflictMode = resolvePatchConflictMode(options.yes);
            let sel = new Map<string, string>();
            if (conflictMode === "all") {
                sel = conflictFiles;
            } else if (conflictMode === "interactive") {
                sel = await selectFiles(projectRoot, conflictFiles);
            } else {
                console.warn(`  conflict: 非交互终端默认跳过 ${conflictFiles.size} 个冲突文件；如需全部覆盖请重跑并显式传入 --yes`);
            }
            if (sel.size > 0) {
                const r = await writeFiles(projectRoot, sel, { force: true, yes: true });
                console.log(`  conflict: 覆盖 ${r.overwritten}, 跳过 ${conflictFiles.size - sel.size}`);
            } else if (conflictMode === "interactive") {
                console.log(`  conflict: 用户取消，${conflictFiles.size} 个文件未写入`);
            }
            for (const key of conflictFiles.keys()) {
                if (!sel.has(key)) unresolvedConflictKeys.add(key);
            }
        }
        if (missingFiles.size === 0 && conflictFiles.size === 0) {
            console.log(SYNC_CONFIG.PROMPT_PATCH_DONE);
        }
        // 全量基线保存（issue #10 P0-2）：旧 hash 全量保留 + 本轮处理后磁盘当前内容刷新
        let finalHash = mergeFullHash(
            outHash,
            [...candidates].map(([relPath]) => ({ relPath, absPath: resolve(projectRoot, relPath) })),
            (absPath) => (existsSync(absPath) ? hash8(readFileSync(absPath, "utf-8")) : null),
            unresolvedConflictKeys,
        );
        if (target === "codex") {
            finalHash = pruneHashToCandidates(finalHash, candidates.keys());
        }
        saveHashFile(projectRoot, magicDir, finalHash);
        saveVersionFile(projectRoot, magicDir, npmVersion);
        
        // Prisma schema diff
        await checkPrismaDiff(projectRoot, options);
        // 端口契约检查（add-coder-ports-contract Plan）：saveHashFile 之后调用——
        // ports.md 是用户项目文档，不进入 hash/conflict 机制（Review P1 #4）；只补缺不覆盖
        ensurePortsContract(projectRoot, config);
        // embedding 模型检测/下载（model-predownload Plan）：patch 分支末尾
        await maybeModelDownload(options);
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

    // ════════════ Prisma schema diff ════════════
    await checkPrismaDiff(projectRoot, options);
    // 端口契约检查（add-coder-ports-contract Plan）：默认分支补缺后调用（只补缺不覆盖）
    ensurePortsContract(projectRoot, config);
    // embedding 模型检测/下载（model-predownload Plan）：普通分支末尾
    await maybeModelDownload(options);
}

/** 迁移命令指引：从 caijuehub POST_SYNC 策略渲染场景化后续命令（按宿主 migrations 状态分流） */
function printMigrateGuidance(targetPath: string, changed: number) {
    const g = SYNC_PRISMA_CONFIG.POST_SYNC;
    const isManaged = existsSync(resolve(dirname(targetPath), "migrations"));
    const actions = isManaged ? g.MANAGED_ACTIONS : g.UNMANAGED_ACTIONS;

    console.log(`  ▶ 已写入 ${changed} 处变更，${g.HEADER}`);

    for (const a of actions) {
        if ("cmd" in a && "label" in a) {
            const prefix = isManaged ? "├─" : "├─";
            console.log(`     ${prefix} ${(a as {label: string}).label}: ${(a as {cmd: string}).cmd}`);
        } else if ("steps" in a) {
            const item = a as { label: string; hint?: string; steps: string[] };
            console.log(`     └─ ${item.label}:`);
            if (item.hint) console.log(`        ⚠️  ${item.hint}`);
            for (const s of item.steps) console.log(`          ${s}`);
        }
    }

    if (isManaged) {
        console.log(`     ⚠️  ${g.P3005.hint}`);
        console.log(`          ${g.P3005.cmd}`);
    }
    console.log(`     ⚠️  所有场景收尾: ${g.FINAL}`);
}

/**
 * Atlas 能力承诺（能力闭环）：检测 → 缺失提示安装（同意自动装 / 拒绝给降级文档）
 * 消费方有 Prisma 注入（prisma/add.prisma）时，Atlas 是数据库同步（diff/apply）的能力底座
 */
async function ensureAtlasCapability(projectRoot: string, yes = false): Promise<void> {
    const bin = resolveAtlasBin(projectRoot);
    if (bin) {
        console.log(`   ✅ Atlas 能力就绪: ${bin}`);
        return;
    }
    // win32 降级（RPT-03/#14）：@ariga/atlas install.js 不支持 win32，跳过安装 + 降级提示
    if (process.platform === "win32") {
        console.warn("   ⚠️  Atlas 在 Windows 不可用（@ariga/atlas install.js 不支持 win32）");
        console.log("   降级路径：数据库同步使用 prisma-diff（免 shadow）；如需 Atlas 请在 WSL 环境手动安装");
        console.log("   文档: README.md → 章节「Atlas 数据库同步能力」/ DEVELOPMENT.md §九");
        return;
    }
    console.warn("   ⚠️  Atlas 不可用——数据库同步（Atlas diff/apply）能力缺失");
    const a = yes ? "y" : await ask("   是否自动安装 @ariga/atlas（npm 依赖，走 registry）？[Y/n] ");
    if (a === "n" || a === "no") {
        console.log("   已跳过。数据库同步将降级 prisma-diff（免 shadow）；可随时补装恢复 Atlas");
        console.log("   文档: README.md → 章节「Atlas 数据库同步能力」/ DEVELOPMENT.md §九");
        return;
    }
    const pm = existsSync(resolve(projectRoot, "pnpm-lock.yaml")) ? "pnpm" : "npm";
    console.log(`   安装 ${pm} add -D @ariga/atlas ...`);
    const r = runCommand(pm, ["add", "-D", "@ariga/atlas"], { cwd: projectRoot, timeout: 180000 });
    if (r.status !== 0) {
        console.error("   安装失败。请手动执行:");
        console.error(`     ${pm} add -D @ariga/atlas`);
        console.error("   pnpm 11 注意: 需在 pnpm-workspace.yaml allowBuilds 放行 '@ariga/atlas': true");
        return;
    }
    console.log("   ✅ @ariga/atlas 已安装，Atlas 能力就绪（node_modules/.bin/atlas）");
}

/**
 * 宿主 db-ensure.sh Atlas 段检测（提示不强制——宿主自有脚本，尊重不覆盖）
 * 缺失时提示三步合入法，避免宿主日常同步缺 ADD 治理模型
 */
function checkHostAtlasSegment(projectRoot: string): void {
    const script = resolve(projectRoot, "scripts", "db-ensure.sh");
    if (!existsSync(script)) return; // 无宿主自有脚本（用模板渲染版）无需提示
    const content = readFileSync(script, "utf-8");
    if (content.includes("atlas_sync")) return; // 已含 Atlas 段
    console.warn("   ⚠️  宿主 scripts/db-ensure.sh 未包含 Atlas 同步段（日常 db-ensure 将缺少 ADD 治理模型同步）");
    console.warn("      职责边界: add-coder 只同步 ADD 治理模型(7 表)；宿主业务表 diff 推荐 Atlas 但不强求");
    console.warn("      合入三步：");
    console.warn("        ① 复制模板 Atlas 模块段: sed -n '/# ════ Atlas 声明式同步模块/,/^fi$/p' node_modules/add-coder/templates/core/scripts/db-ensure.sh");
    console.warn("        ② 变量适配（DB_URL→DATABASE_URL 等，见文档变量对照表）");
    console.warn("        ③ 粘贴到脚本末尾（迁移/generate 之后），触发: bash scripts/db-ensure.sh <engine> <container> --migrate");
    console.warn("      宿主业务表推荐做法: 见 DEVELOPMENT.md §九 9.5（推荐 Atlas 可选；保持 migrate dev/deploy 亦可）");
}

/** Prisma schema diff 检查（--patch 模式下触发） */
async function checkPrismaDiff(projectRoot: string, options: { adapter?: string; patch?: boolean; yes?: boolean }) {
    if (!options.patch) return;
    const basePath = resolve(projectRoot, SYNC_PRISMA_CONFIG.BASE_SCHEMA);
    const targetPath = resolve(projectRoot, SYNC_PRISMA_CONFIG.TARGET_PATTERN);
    if (!existsSync(basePath)) {
        console.log(`\n⚠️  基准 schema 不存在: ${basePath}`);
        console.log(`  请确保 add-coder 已正确安装。`);
        return;
    }
    // Atlas 能力承诺（能力闭环）：Prisma 注入存在 → 确保 Atlas 底座可用
    await ensureAtlasCapability(projectRoot, options.yes);
    // 宿主 db-ensure.sh Atlas 段检测（提示三步合入，避免宿主日常同步缺 ADD 治理模型）
    checkHostAtlasSegment(projectRoot);
    const result = diffPrisma(basePath, targetPath);
    if (!result.hasDiff) {
        console.log(`\n✅ Prisma schema 与 add-coder 标准一致，无需同步。`);
        return;
    }

    const targetExists = existsSync(targetPath);
    // 实际写入统计（决定汇总提示是否建议迁移，避免“零修改也提示”的误导）
    let modifiedCount = 0;

    console.log(`\n⚠️  Prisma schema 差异检测:`);
    console.log(`  基准: ${result.baseSchema} (add-coder 标准)`);
    if (targetExists) console.log(`  目标: ${result.targetPath} (消费方)`);

    // ── 1. 缺表 — 策略: ON_MISSING_MODEL ──
    if (result.missing.length > 0 && targetExists) {
        let selected: typeof result.missing = [];
        await handleDiffAction(SYNC_PRISMA_CONFIG.ON_MISSING_MODEL, {
            label: "缺失模型/枚举",
            show() {
                console.log(`\n  🔴 缺失模型/枚举（${result.missing.length} 项）:`);
                for (let i = 0; i < result.missing.length; i++) {
                    const m = result.missing[i];
                    console.log(`  [${i + 1}] ${m.type} ${m.name} (${m.fields.length} 字段)`);
                }
            },
            async confirm() {
                const ans = options.yes ? "a" : await ask(`\n  输入编号选择性注入（如 1,3），a 全部注入，回车跳过: `);
                if (ans === "a" || ans === "all") {
                    selected = [...result.missing];
                    return true;
                }
                if (!ans.trim()) return false;
                const indices = ans.split(/[,，]+/).map(s => parseInt(s.trim()) - 1).filter(i => !isNaN(i) && i >= 0 && i < result.missing.length);
                if (indices.length === 0) return false;
                selected = indices.map(i => result.missing[i]);
                return true;
            },
            execute() {
                const n = injectMissingModels(result.targetPath, selected);
                modifiedCount += n;
                console.log(`  ✅ 已将 ${n} 个模型/枚举注入 ${result.targetPath}`);
                return Promise.resolve(n);
            },
        });
    }

    // ── 2. 字段级差异 — 策略: ON_FIELD_CONFLICT / ON_MISSING_FIELD / ON_EXTRA_FIELD ──
    if (result.fieldDiffs.length > 0 && targetExists) {
        console.log(`\n  🟡 字段级差异（${result.fieldDiffs.length} 个模型/枚举）:`);

        for (const d of result.fieldDiffs) {
            console.log(`\n  ── ${d.type} ${d.name}:`);

            // 2a. 字段冲突
            if (d.conflicts.length > 0) {
                await handleDiffAction(SYNC_PRISMA_CONFIG.ON_FIELD_CONFLICT, {
                    label: `冲突字段`,
                    show() {
                        console.log(`    ⚡ 冲突字段（同名字段、定义不同）:`);
                        for (const c of d.conflicts) {
                            console.log(`      · ${c.fieldName}`);
                            console.log(`        基准: ${c.baseDef}`);
                            console.log(`        消费方: ${c.targetDef}`);
                        }
                    },
                    async confirm() {
                        const ans = options.yes ? "y" : await ask(`    是否用基准定义覆盖这些冲突字段？(y/n): `);
                        return ans === "y" || ans === "yes";
                    },
                    execute() {
                        const n = overwriteFieldLines(targetPath, basePath, d.name, d.conflicts);
                        modifiedCount += n;
                        console.log(`    ✅ 已覆盖 ${n} 个冲突字段`);
                        return Promise.resolve(n);
                    },
                });
            }

            // 2b. 缺字段
            if (d.missingFields.length > 0) {
                await handleDiffAction(SYNC_PRISMA_CONFIG.ON_MISSING_FIELD, {
                    label: `缺失字段`,
                    show() {
                        console.log(`    📋 消费方缺少 ${d.missingFields.length} 个字段:`);
                        for (const f of d.missingFields) {
                            console.log(`      + ${f}`);
                        }
                    },
                    async confirm() {
                        const ans = options.yes ? "y" : await ask(`    是否补充这些缺失字段？(y/n): `);
                        return ans === "y" || ans === "yes";
                    },
                    execute() {
                        const n = injectFieldLines(targetPath, basePath, d.name, d.missingFields);
                        modifiedCount += n;
                        console.log(`    ✅ 已补充 ${n} 个字段`);
                        return Promise.resolve(n);
                    },
                });
            }

            // 2c. 多余字段 — 策略: ON_EXTRA_FIELD
            if (d.extraFields.length > 0) {
                await handleDiffAction(SYNC_PRISMA_CONFIG.ON_EXTRA_FIELD, {
                    label: `消费方特有字段`,
                    show() {
                        console.log(`    ℹ️  消费方特有 ${d.extraFields.length} 个字段（不做操作）:`);
                        for (const f of d.extraFields) {
                            console.log(`      - ${f}`);
                        }
                    },
                    confirm() { return Promise.resolve(false); },
                    execute() { return Promise.resolve(0); },
                });
            }
        }
    }

    // 汇总提示（覆盖全部分支边界：零差异/拒绝全部/新建/已修改）
    if (targetExists) {
        console.log(`\n  ${SYNC_PRISMA_CONFIG.PROMPT}`);
        if (modifiedCount > 0) {
            printMigrateGuidance(targetPath, modifiedCount);
        } else {
            console.log(`  ▶ 目标 schema 已是最新（未选择任何变更），无需迁移操作`);
        }
    } else {
        console.log(`\n  目标 schema 文件不存在: ${result.targetPath}`);
        mkdirSync(dirname(targetPath), { recursive: true });
        writeFileSync(targetPath, '// add.prisma — ADD 治理模型\n\n', 'utf-8');
        const n = injectMissingModels(targetPath, result.missing);
        console.log(`  ✅ 已创建并注入 ${n} 个模型/枚举`);
        if (n > 0) {
            printMigrateGuidance(targetPath, n);
        }
    }
}

/**
 * 策略驱动的 diff 动作分发。
 * 由 caijuehub/sync-rules.toml [prisma] 定义策略，transcribe.ts 转录到 SYNC_PRISMA_CONFIG。
 */
async function handleDiffAction(
    action: string,
    ctx: {
        label: string;
        show: () => void;
        confirm: () => Promise<boolean>;
        execute: () => Promise<number>;
    },
): Promise<void> {
    if (action === "skip" || action === "ignore") return;

    ctx.show();

    if (action === "auto") {
        const n = await ctx.execute();
        console.log(`  ✅ ${ctx.label}: 已处理 ${n} 项`);
        return;
    }

    if (action === "interactive") {
        const ok = await ctx.confirm();
        if (!ok) { console.log(`  已跳过。`); return; }
        const n = await ctx.execute();
        console.log(`  ✅ ${ctx.label}: 已处理 ${n} 项`);
        return;
    }

    if (action === "block") {
        throw new Error(`⛔ Prisma 同步阻断: ${ctx.label}，策略为 block`);
    }
}

/**
 * 将缺失的模型/枚举块追加到目标 schema 文件。
 */
export function injectMissingModels(
    targetPath: string,
    models: { type: string; name: string; body: string }[],
): number {
    let content = readFileSync(targetPath, "utf-8");
    content = content.replace(/\n*$/, "\n");
    content += `\n// ===== 由 add-coder sync --patch 自动注入 (${new Date().toISOString().slice(0, 10)}) =====\n\n`;
    for (const m of models) {
        content += m.body + "\n\n";
    }
    writeFileSync(targetPath, content, "utf-8");
    return models.length;
}

/**
 * 提取基准 schema 中指定模型的字段完整定义行。
 * 复用 parseSchemaBlocks（行级扫描，注释括号安全）；
 * enum 类型“值行直取”（Review P0-1）：单 token 值无“类型”部分，旧正则匹配不到。
 */
function getBaseFieldLines(basePath: string, modelName: string): Record<string, string> {
    const content = readFileSync(basePath, "utf-8");
    const blocks = parseSchemaBlocks(content);
    const block = blocks.get(`model:${modelName}`) ?? blocks.get(`enum:${modelName}`);
    if (!block) return {};

    const fields: Record<string, string> = {};
    for (const line of block.body.split("\n")) {
        const clean = line.replace(/\/\/.*$/, "").trim();
        if (!clean) continue;
        if (block.type === "enum") {
            // enum 值行直取：单 token，无类型部分；保留原行（含注释）供注入
            if (/^\w+$/.test(clean)) fields[clean] = line.trim();
        } else {
            const fm = line.match(/^\s*(\w+)\s+/);
            if (fm) fields[fm[1]] = line.trim();
        }
    }
    return fields;
}

/**
 * 将缺失字段注入到目标模型块中：
 * - 支持 model 与 enum 双类型块（RPT-20260806-01）
 * - 字段插入在最后一个 `@@` 属性行之前（RPT-20260806-02，Prisma 要求字段在 @@ 之前）
 * - 零注入告警：要求注入但写入 0 → 显式 warn，不静默
 */
export function injectFieldLines(
    targetPath: string,
    basePath: string,
    modelName: string,
    fieldKeys: string[],
): number {
    const baseFields = getBaseFieldLines(basePath, modelName);
    if (Object.keys(baseFields).length === 0) {
        console.warn(`⚠️  注入失败：${modelName} 在基准中未找到字段定义（${fieldKeys.length} 个字段未写入）`);
        return 0;
    }

    const content = readFileSync(targetPath, "utf-8");
    const lines = content.split("\n");
    const blocks = parseSchemaBlocks(content);
    const target = blocks.get(`model:${modelName}`) ?? blocks.get(`enum:${modelName}`);
    if (!target) {
        console.warn(`⚠️  注入失败：目标中不存在 ${modelName} 块（${fieldKeys.length} 个字段未写入）`);
        return 0;
    }

    // 按 body 首行定位块在原文中的行范围
    const bodyLines = target.body.split("\n");
    const startIdx = lines.findIndex((l) => l === bodyLines[0]);
    if (startIdx < 0) {
        console.warn(`⚠️  注入失败：无法定位 ${modelName} 块位置（${fieldKeys.length} 个字段未写入）`);
        return 0;
    }
    const endIdx = startIdx + bodyLines.length - 1;

    // 组装待注入字段行（去重：块内已存在则跳过）
    const existingNames = new Set(
        target.fields.map((f) => f.split(":")[0]),
    );
    const newFieldLines: string[] = [];
    for (const key of fieldKeys) {
        const fieldName = key.split(":")[0];
        const fieldLine = baseFields[fieldName];
        if (!fieldLine) continue;
        if (existingNames.has(fieldName)) continue;
        newFieldLines.push(`  ${fieldLine}`);
    }

    if (newFieldLines.length === 0) {
        if (fieldKeys.length > 0) {
            console.warn(`⚠️  注入失败：${modelName} 的 ${fieldKeys.length} 个字段未写入（可能已存在或定义不匹配）`);
        }
        return 0;
    }

    // 插入点：块内最后一个 @@ 属性行之前；无 @@ 则块尾（endIdx 为闭合行）
    let insertIdx = endIdx;
    for (let k = startIdx + 1; k < endIdx; k++) {
        if (/^\s*@@/.test(lines[k])) insertIdx = k;
    }
    const merged = [
        ...lines.slice(0, insertIdx),
        ...newFieldLines,
        ...lines.slice(insertIdx),
    ];
    writeFileSync(targetPath, merged.join("\n"), "utf-8");
    return newFieldLines.length;
}

/**
 * 覆盖目标模型中冲突的字段行（同名不同定义 → 用基准覆盖）。
 */
function overwriteFieldLines(
    targetPath: string,
    basePath: string,
    modelName: string,
    conflicts: { fieldName: string; baseDef: string; targetDef: string }[],
): number {
    const baseFields = getBaseFieldLines(basePath, modelName);
    if (Object.keys(baseFields).length === 0) return 0;

    let content = readFileSync(targetPath, "utf-8");
    let count = 0;

    for (const { fieldName } of conflicts) {
        const baseLine = baseFields[fieldName];
        if (!baseLine) continue;

        // 找到目标中的字段行，保留缩进替换定义
        const fieldRegex = new RegExp(`^(\\s*)(${fieldName}\\s+.*)$`, "m");
        const match = content.match(fieldRegex);
        if (!match) continue;

        content = content.replace(fieldRegex, `${match[1]}${baseLine}`);
        count++;
    }

    if (count > 0) writeFileSync(targetPath, content, "utf-8");
    return count;
}
