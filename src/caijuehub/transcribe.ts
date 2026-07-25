#!/usr/bin/env node
import { parse } from "smol-toml";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface CaijueEntry { id: string; type: string; description: string; rules: string; implementation: string; }
interface CaijueIndex { caijue: CaijueEntry[]; }

const HEADER = `// ⚠️ 由 caijuehub/transcribe.ts 自动生成，不要手动编辑！\n// 改 *-rules.toml 后重新运行: add-coder generate\n\n`;

const GENERATED_MARKER = "// >>> CAIJUE GENERATED START >>>";
const GENERATED_END = "// <<< CAIJUE GENERATED END <<<";

type TomlData = Record<string, unknown>;
type RuleGenerator = (rules: TomlData) => string;

// ── 每个生成器只产出【规则数据】，不写业务逻辑 ──

function genDetectRules(rules: TomlData): string {
    const d = rules as { rule?: Array<{ env?: string; dir?: string; match?: string; value?: string }>; fallback?: { value?: string } };
    const items: string[] = [];
    for (const r of (d.rule || [])) {
        if (r.env) {
            const m = r.match ? `, match: "${r.match}"` : "";
            items.push(`  { env: "${r.env}"${m}, value: "${r.value}" },`);
        } else if (r.dir) {
            items.push(`  { dir: "${r.dir}", value: "${r.value}" },`);
        }
    }
    return `export const DETECT_RULES = [\n${items.join("\n")}\n];\nexport const DETECT_FALLBACK = "${d.fallback?.value || "auto"}";`;
}

function genAdapterRules(rules: TomlData): string {
    const d = rules as { auto?: { deploy?: string[] } };
    const s = (d.auto?.deploy || ["claude", "qoder", "vscode"]).map((s: string) => `"${s}"`).join(", ");
    return `export const AUTO_DEPLOY_ADAPTERS = [${s}];`;
}

function genPrismaRules(rules: TomlData): string {
    type B = { on_missing?: string; on_existing_add_prisma?: string; on_migrate_fail?: string; auto_generate?: boolean };
    type M = { name?: string; schema_arg?: string };
    const d = rules as { behavior?: B; migration?: M; requires?: { user_model?: boolean } };
    const b = d.behavior || {};
    const m = d.migration || {};
    return `export const PRISMA_CONFIG = {
    onMissing: "${b.on_missing || "block"}",
    onExistingAddPrisma: "${b.on_existing_add_prisma || "ask"}",
    onMigrateFail: "${b.on_migrate_fail || "rollback"}",
    autoGenerate: ${b.auto_generate !== false},
    migrationName: "${m.name || "add_workflow_init"}",
    schemaArg: "${m.schema_arg || "--schema=prisma/"}",
    requiresUserModel: ${(d.requires?.user_model) !== false},
};`;
}

function genWriterRules(rules: TomlData): string {
    const d = rules as { behavior?: { on_existing?: string; json_merge?: string; shell_chmod?: boolean } };
    const b = d.behavior || {};
    return `export const WRITER_CONFIG = {
    onExisting: "${b.on_existing || "ask"}",
    jsonMerge: "${b.json_merge || "deep"}",
    shellChmod: ${b.shell_chmod !== false},
};`;
}

function genSyncRules(rules: TomlData): string {
    const d = rules as { guard?: { patterns?: string[] }; hash?: { output_file?: string; src_file?: string; hex_length?: number }; patch?: { on_missing?: string; on_conflict?: string; on_same?: string }; version?: { on_first_patch?: string; on_upgrade?: string; on_hash_lost?: string; sentinel_file?: string }; default?: { on_missing?: string; on_existing?: string; prompt_full?: string; prompt_patch_done?: string } };
    const g = d.guard?.patterns ?? [];
    const h = d.hash ?? {};
    const p = d.patch ?? {};
    const v = d.version ?? {};
    const def = d.default ?? {};
    const patterns = g.map((s: string): string => `/${s}/`).join(", ");
    return `export const SYNC_CONFIG = {
    PATCH_GUARD: [${patterns}],
    HASH_OUTPUT_FILE: "${h.output_file || '.add-coder-hash.json'}",
    HASH_SRC_FILE: "${h.src_file || 'templates/.add-coder-src-hash.json'}",
    HASH_HEX_LENGTH: ${h.hex_length || 8},
    PATCH_ON_MISSING: "${p.on_missing || 'write'}",
    PATCH_ON_CONFLICT: "${p.on_conflict || 'interactive'}",
    PATCH_ON_SAME: "${p.on_same || 'skip'}",
    VERSION_ON_FIRST: "${v.on_first_patch || 'baseline'}",
    VERSION_ON_UPGRADE: "${v.on_upgrade || 'baseline'}",
    VERSION_ON_HASH_LOST: "${v.on_hash_lost || 'conflict'}",
    VERSION_SENTINEL: "${v.sentinel_file || '.add-coder-version'}",
    DEFAULT_ON_MISSING: "${def.on_missing || 'write'}",
    DEFAULT_ON_EXISTING: "${def.on_existing || 'skip'}",
    PROMPT_FULL: "${def.prompt_full || ''}",
    PROMPT_PATCH_DONE: "${def.prompt_patch_done || ''}",
};`;
}

function genProjectRootRules(rules: TomlData): string {
    const prio = (rules as any).priority || {};
    const tiers: string[] = prio.tiers || ["env_var", "dirname_fallback", "cwd_fallback"];
    const tierList = tiers.map((s: string) => `"${s}"`).join(", ");
    return `export const PROJECT_ROOT_PRIORITY = [${tierList}] as const;\nexport type ProjectRootTier = (typeof PROJECT_ROOT_PRIORITY)[number];`;
}

const GENERATORS: Record<string, RuleGenerator> = {
    "detect-ide": genDetectRules,
    "resolve-adapters": genAdapterRules,
    "prisma-inject": genPrismaRules,
    "write-files": genWriterRules,
    "sync-patch": genSyncRules,
    "project-root-resolution": genProjectRootRules,
};

function readExistingUserCode(filePath: string): string {
    if (!existsSync(filePath)) return "";
    const content = readFileSync(filePath, "utf-8");
    const idx = content.indexOf(GENERATED_END);
    if (idx === -1) {
        // 没有 GENERATED 标记 → 整个文件视为 USER CODE
        return `\n// >>> USER CODE >>>\n${content}\n// <<< USER CODE <<<\n`;
    }
    // 提取 END 之后的内容 = 用户代码
    const after = content.substring(idx + GENERATED_END.length);
    // 提取已有的 USER CODE 区块
    const ucStart = after.indexOf("// >>> USER CODE >>>");
    if (ucStart === -1) return after.trim() ? `\n// >>> USER CODE >>>\n${after.trim()}\n// <<< USER CODE <<<\n` : "";
    return after.substring(ucStart);
}

export function transcribe(caijueDir?: string, outputRoot?: string) {
    const baseDir = caijueDir || join(__dirname);
    const outRoot = outputRoot || join(__dirname, "..", "..");

    const caijuePath = join(baseDir, "caijue.toml");
    if (!existsSync(caijuePath)) {
        console.log("caijue.toml 不存在，跳过转录");
        return;
    }

    const index = parse(readFileSync(caijuePath, "utf-8")) as unknown as CaijueIndex;

    for (const entry of index.caijue) {
        const rulesPath = join(baseDir, entry.rules);
        if (!existsSync(rulesPath)) {
            console.log(`跳过 ${entry.id}: 规则文件 ${entry.rules} 不存在`);
            continue;
        }

        const gen = GENERATORS[entry.id];
        if (!gen) { console.log(`跳过 ${entry.id}: 无生成器`); continue; }

        const rules = parse(readFileSync(rulesPath, "utf-8"));
        const generated = `${HEADER}${GENERATED_MARKER}\n${gen(rules)}\n${GENERATED_END}`;

        const outPath = join(outRoot, entry.implementation);
        const userCode = readExistingUserCode(outPath);

        mkdirSync(dirname(outPath), { recursive: true });
        writeFileSync(outPath, `${generated}\n${userCode}`, "utf-8");
        console.log(`生成 ${entry.implementation}`);
    }
}

if (process.argv[1] && (process.argv[1].endsWith("transcribe.ts") || process.argv[1].endsWith("transcribe.js"))) {
    transcribe();
}