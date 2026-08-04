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
import { ask } from "../../lib/utils";
import { SYNC_CONFIG } from "../../caijuehub/strategies/sync.strategy";
import { SYNC_PRISMA_CONFIG } from "../../caijuehub/strategies/prisma-sync.strategy";
import { diffPrisma } from "../writer";

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
        
        // Prisma schema diff
        await checkPrismaDiff(projectRoot, options);
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

/** Prisma schema diff 检查（--patch 模式下触发） */
async function checkPrismaDiff(projectRoot: string, options: { adapter?: string; patch?: boolean }) {
    if (!options.patch) return;
    const basePath = resolve(projectRoot, SYNC_PRISMA_CONFIG.BASE_SCHEMA);
    const targetPath = resolve(projectRoot, SYNC_PRISMA_CONFIG.TARGET_PATTERN);
    if (!existsSync(basePath)) {
        console.log(`\n⚠️  基准 schema 不存在: ${basePath}`);
        console.log(`  请确保 add-coder 已正确安装。`);
        return;
    }
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
                const ans = await ask(`\n  输入编号选择性注入（如 1,3），a 全部注入，回车跳过: `);
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
                        const ans = await ask(`    是否用基准定义覆盖这些冲突字段？(y/n): `);
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
                        const ans = await ask(`    是否补充这些缺失字段？(y/n): `);
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
function injectMissingModels(
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
 */
function getBaseFieldLines(basePath: string, modelName: string): Record<string, string> {
    const content = readFileSync(basePath, "utf-8");
    const blockRegex = /^(model|enum)\s+(\w+)\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/gm;
    let match;
    while ((match = blockRegex.exec(content)) !== null) {
        if (match[2] !== modelName) continue;
        const fields: Record<string, string> = {};
        for (const line of match[3].split("\n")) {
            const fm = line.match(/^\s*(\w+)\s+/);
            if (fm) fields[fm[1]] = line.trim();
        }
        return fields;
    }
    return {};
}

/**
 * 将缺失字段注入到目标模型块中（插入在最后一个字段后）。
 */
function injectFieldLines(
    targetPath: string,
    basePath: string,
    modelName: string,
    fieldKeys: string[],
): number {
    const baseFields = getBaseFieldLines(basePath, modelName);
    if (Object.keys(baseFields).length === 0) return 0;

    let content = readFileSync(targetPath, "utf-8");
    let count = 0;

    for (const key of fieldKeys) {
        const fieldName = key.split(":")[0];
        const fieldLine = baseFields[fieldName];
        if (!fieldLine) continue;

        // 找到目标模型块（限定检查范围，避免误匹配其他 model 的同名字段）
        const modelRegex = new RegExp(`(model\\s+${modelName}\\s*\\{)([^}]*?)(\\n\\s*\\})`, "m");
        const m = content.match(modelRegex);
        if (!m) continue;

        // 字段已存在（仅在当前模型块内检查）则跳过
        if (new RegExp(`^\\s*${fieldName}\\s+`, "m").test(m[2])) continue;

        content = content.replace(modelRegex, `$1$2\n  ${fieldLine}$3`);
        count++;
    }

    if (count > 0) writeFileSync(targetPath, content, "utf-8");
    return count;
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
