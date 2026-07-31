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

interface ProjectRootRules { priority?: { tiers?: string[] } }

function genProjectRootRules(rules: TomlData): string {
    const d = rules as unknown as ProjectRootRules;
    const tiers: string[] = d.priority?.tiers ?? ["env_var", "dirname_fallback", "cwd_fallback"];
    const tierList = tiers.map((s: string) => `"${s}"`).join(", ");
    return `export const PROJECT_ROOT_PRIORITY = [${tierList}] as const;\nexport type ProjectRootTier = (typeof PROJECT_ROOT_PRIORITY)[number];`;
}

interface PrismaSyncRules { base_schema?: string; target_pattern?: string; sync_items?: string[]; on_diff?: string; on_missing_model?: string; on_field_conflict?: string; on_missing_field?: string; on_extra_field?: string; prompt?: string }

function genPrismaSyncRules(rules: TomlData): string {
    const d = (rules as Record<string, unknown>).prisma as PrismaSyncRules | undefined;
    const base = d?.base_schema ?? "prisma/add.prisma";
    const target = d?.target_pattern ?? "prisma/add/schema.prisma";
    const items = (d?.sync_items ?? ["model", "enum"]).map((s: string) => `"${s}"`).join(", ");
    const missingModel = d?.on_missing_model ?? d?.on_diff ?? "interactive";
    const fieldConflict = d?.on_field_conflict ?? d?.on_diff ?? "interactive";
    const missingField = d?.on_missing_field ?? d?.on_diff ?? "interactive";
    const extraField = d?.on_extra_field ?? "ignore";
    const prompt = d?.prompt ?? "add-coder add.prisma 有新模型需要同步。";
    return `export const SYNC_PRISMA_CONFIG = {\n    BASE_SCHEMA: "${base}",\n    TARGET_PATTERN: "${target}",\n    SYNC_ITEMS: [${items}],\n    ON_MISSING_MODEL: "${missingModel}",\n    ON_FIELD_CONFLICT: "${fieldConflict}",\n    ON_MISSING_FIELD: "${missingField}",\n    ON_EXTRA_FIELD: "${extraField}",\n    PROMPT: "${prompt}",\n};`;
}

// ── Sync Magic 生成器 ──
interface SyncMagicRules {
    core?: { project_name?: string; magic_dirs?: string[] };
    exclude?: { patterns?: string[]; log_extensions?: string[] };
    hooks?: Array<{ src: string; dest: string; name: string; magic_dir: string }>;
    categories?: Array<{ name: string; icon: string; bake?: boolean }>;
    verify?: Array<{ src: string; dest: string; name: string }>;
}

function genSyncMagicRules(rules: TomlData): string {
    const d = rules as SyncMagicRules;
    const core = d.core ?? {};
    const exclude = d.exclude ?? {};
    const hooks = d.hooks ?? [];
    const categories = d.categories ?? [];
    const verify = d.verify ?? [];

    const projectName = core.project_name ?? "add-coder";
    const magicDirs = (core.magic_dirs ?? [".add", ".qoder", ".claude", ".vscode"])
        .map((s: string) => `"${s}"`).join(", ");
    const excludePatterns = (exclude.patterns ?? [".gitkeep", ".DS_Store", "debug-dump"])
        .map((s: string) => `"${s}"`).join(", ");
    const logExts = (exclude.log_extensions ?? [".log"])
        .map((s: string) => `"${s}"`).join(", ");

    const hookEntries = hooks.map(h =>
        `    { src: "${h.src}", dest: "${h.dest}", name: "${h.name}", magicDir: "${h.magic_dir}" }`
    ).join(",\n");

    const catEntries = categories.map(c =>
        `    { name: "${c.name}", icon: "${c.icon}", bake: ${c.bake !== false} }`
    ).join(",\n");

    const verifyEntries = verify.map(v =>
        `    { src: "${v.src}", dest: "${v.dest}", name: "${v.name}" }`
    ).join(",\n");

    return `export const SYNC_MAGIC_CONFIG = {
    PROJECT_NAME: "${projectName}",
    MAGIC_DIRS: [${magicDirs}],
    EXCLUDE_PATTERNS: [${excludePatterns}],
    LOG_EXTENSIONS: [${logExts}],
    HOOKS: [
${hookEntries}
    ],
    CATEGORIES: [
${catEntries}
    ],
    VERIFY: [
${verifyEntries}
    ],
} as const;

export type SyncMagicHook = (typeof SYNC_MAGIC_CONFIG)["HOOKS"][number];
export type SyncMagicCategory = (typeof SYNC_MAGIC_CONFIG)["CATEGORIES"][number];
export type SyncMagicVerify = (typeof SYNC_MAGIC_CONFIG)["VERIFY"][number];`;
}

// ── Sync Magic Bash Shell 生成器（跨语言通道：TOML → .sh）──

interface SyncMagicBashRules {
    core?: { project_name?: string; magic_dirs?: string; exclude_patterns?: string; log_extensions?: string };
    hooks?: Record<string, string>;
    categories?: Record<string, string>;
    verify?: Record<string, string>;
}

function genSyncMagicBashShell(rules: TomlData): string {
    const d = rules as SyncMagicBashRules;
    const core = d.core ?? {};
    const hooks = d.hooks ?? {};
    const categories = d.categories ?? {};
    const verify = d.verify ?? {};

    const projectName = core.project_name ?? "add-coder";
    const magicDirs = (core.magic_dirs ?? ".add .qoder .claude .vscode")
        .split(/\s+/).filter(Boolean).map(s => `"${s}"`).join(" ");
    const excludePatterns = (core.exclude_patterns ?? ".gitkeep .DS_Store debug-dump")
        .split(/\s+/).filter(Boolean).map(s => `"${s}"`).join(" ");
    const logExts = (core.log_extensions ?? ".log")
        .split(/\s+/).filter(Boolean).map(s => `"${s}"`).join(" ");

    // 解析管道分隔值: "src|dest|name|magic_dir"
    const parsePipe = (val: string) => val.replace(/^"|"$/g, "").split("|").map(s => s.trim());

    const hookEntries = Object.entries(hooks).map(([, v]) => parsePipe(v));
    const catEntries = Object.entries(categories).map(([k, v]) => {
        const [icon, bake] = parsePipe(v);
        return { name: k.replace(/_/g, " "), icon, bake };
    });
    const verifyEntries = Object.entries(verify).map(([, v]) => parsePipe(v));

    const hookSrcs = hookEntries.map(h => `"${h[0]}"`).join(" ");
    const hookDests = hookEntries.map(h => `"${h[1]}"`).join(" ");
    const hookNames = hookEntries.map(h => `"${h[2]}"`).join(" ");
    const hookMagics = hookEntries.map(h => `"${h[3]}"`).join(" ");

    const catNames = catEntries.map(c => `"${c.name}"`).join(" ");
    const catIcons = catEntries.map(c => `"${c.icon}"`).join(" ");
    const catBakes = catEntries.map(c => c.bake === "1" || c.bake === "true" ? "1" : "0").join(" ");

    const vSrcs = verifyEntries.map(v => `"${v[0]}"`).join(" ");
    const vDests = verifyEntries.map(v => `"${v[1]}"`).join(" ");
    const vNames = verifyEntries.map(v => `"${v[2]}"`).join(" ");

    return `# ⚠️ 由 caijuehub/transcribe.ts 自动生成，不要手动编辑！
# 改 sync-magic-bash-rules.toml 后重新运行: add-coder generate

# ── 核心配置 ──
PROJECT_NAME="${projectName}"
MAGIC_DIRS=(${magicDirs})
EXCLUDE_PATTERNS=(${excludePatterns})
LOG_EXTENSIONS=(${logExts})

# ── Hook 同步映射 (${hookEntries.length} 条) ──
HOOK_COUNT=${hookEntries.length}
HOOK_SRCS=(${hookSrcs})
HOOK_DESTS=(${hookDests})
HOOK_NAMES=(${hookNames})
HOOK_MAGICS=(${hookMagics})

# ── 通用类别同步 (${catEntries.length} 条) ──
CAT_COUNT=${catEntries.length}
CAT_NAMES=(${catNames})
CAT_ICONS=(${catIcons})
CAT_BAKES=(${catBakes})

# ── 验证映射 (${verifyEntries.length} 条) ──
VERIFY_COUNT=${verifyEntries.length}
VERIFY_SRCS=(${vSrcs})
VERIFY_DESTS=(${vDests})
VERIFY_NAMES=(${vNames})
`;
}

// ── HITL 交互策略生成器 ──
interface HitlIdeRule { mode?: string; widget_path?: string }

function genHitlInteractionRules(rules: TomlData): string {
    const d = rules as Record<string, HitlIdeRule | undefined>;
    const def = d.default ?? { mode: "inputRequired" };
    const ideKeys = ["qoder", "claude", "vscode", "trae", "codex"];
    const entries: string[] = [];
    entries.push(`    default: { mode: "${def.mode}" as const }`);
    for (const key of ideKeys) {
        const ide = d[key];
        if (!ide) continue;
        const mode = ide.mode ?? def.mode;
        if (mode === "genui" && ide.widget_path) {
            entries.push(`    ${key}: { mode: "genui" as const, widget_path: "${ide.widget_path}" }`);
        } else {
            entries.push(`    ${key}: { mode: "${mode}" as const }`);
        }
    }
    return `export const HITL_INTERACTION_CONFIG = {\n${entries.join(",\n")}\n} as const;\n\nexport type HitlInteractionMode = (typeof HITL_INTERACTION_CONFIG)[keyof typeof HITL_INTERACTION_CONFIG]["mode"];`;
}

// ── DPS 评分全参数生成器 ──
function genDpsScoringRules(rules: TomlData): string {
    const d = rules as Record<string, Record<string, unknown>>;
    const required = (section: string, key: string) => {
        const v = d[section]?.[key];
        if (v === undefined) throw new Error(`dps-scoring-rules.toml: [${section}] ${key} 未配置`);
        return v;
    };
    const arr = (section: string, key: string): number[] => {
        const v = required(section, key);
        if (!Array.isArray(v)) throw new Error(`dps-scoring-rules.toml: [${section}] ${key} 必须是数组`);
        return v as number[];
    };
    const num = (section: string, key: string): number => {
        const v = required(section, key);
        if (typeof v !== "number") throw new Error(`dps-scoring-rules.toml: [${section}] ${key} 必须是数字`);
        return v;
    };

    return `export const DPS_SCORING_CONFIG = {
    SEMANTIC_WEIGHTS: [${arr("semantic", "weights").join(", ")}],
    SEMANTIC_MISSING_REVIEW_PENALTY: ${num("semantic", "missing_review_penalty")},
    ENTROPY_GAP_MULT: ${num("entropy", "gap_multiplier")},
    DENG_PER_MARKER: ${num("entropy", "deng_per_marker")},
    DENG_MAX_PENALTY: ${num("entropy", "deng_max_penalty")},
    MISSING_SPECS_GAP: ${num("entropy", "missing_specs_gap")},
    CPM_SUB_WEIGHTS: [${arr("cpm", "sub_weights").join(", ")}],
    CPM_OVERLAP_MULT: ${num("cpm", "overlap_multiplier")},
    CPM_MAX_TASK_PAIRS: ${num("cpm", "max_task_pairs")},
    CPM_FILE_LOW: ${num("cpm", "file_per_task_low")},
    CPM_FILE_MID: ${num("cpm", "file_per_task_mid")},
    CPM_ENTROPY_LOW: ${num("cpm", "entropy_low")},
    CPM_ENTROPY_MID: ${num("cpm", "entropy_mid")},
    CPM_ATTENTION_WEIGHTS: [${arr("cpm", "attention_weights").join(", ")}],
    CPM_DEP_WEIGHTS: [${arr("cpm", "dep_weights").join(", ")}],
    STRUCT_PLACEHOLDER: ${num("structure", "placeholder_penalty")},
    STRUCT_MISSING_SPECS: ${num("structure", "missing_specs_penalty")},
    STRUCT_MISSING_TASKS: ${num("structure", "missing_tasks_penalty")},
    STRUCT_MISSING_CHECKLIST: ${num("structure", "missing_checklist_penalty")},
    STRUCT_SUB_WEIGHTS: [${arr("structure", "sub_weights").join(", ")}],
    FFT_COLD_START: ${num("fft", "cold_start_threshold")},
    FFT_HISTORY_LIMIT: ${num("fft", "history_limit")},
    FFT_DEFAULT_WEIGHTS: [${arr("fft", "default_weights").join(", ")}],
    THRESHOLD_PASS: ${num("thresholds", "pass")},
    THRESHOLD_WARN: ${num("thresholds", "warn")},
    EMBEDDING_MODEL: "${String(required("embedding", "model"))}",
} as const;`;
}

const GENERATORS: Record<string, RuleGenerator> = {
    "detect-ide": genDetectRules,
    "resolve-adapters": genAdapterRules,
    "prisma-inject": genPrismaRules,
    "write-files": genWriterRules,
    "sync-patch": genSyncRules,
    "project-root-resolution": genProjectRootRules,
    "sync-prisma-schema": genPrismaSyncRules,
    "sync-magic": genSyncMagicRules,
    "hitl-interaction": genHitlInteractionRules,
    "dps-scoring": genDpsScoringRules,
};

// ── Shell 配置生成器（产出 .sh 文件，不走 TS 策略路径）──
const SHELL_GENERATORS: Record<string, RuleGenerator> = {
    "sync-magic-bash": genSyncMagicBashShell,
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
        const shellGen = SHELL_GENERATORS[entry.id];

        if (!gen && !shellGen) { console.log(`跳过 ${entry.id}: 无生成器`); continue; }

        const rules = parse(readFileSync(rulesPath, "utf-8"));

        // TS 策略生成（如果存在 GENERATOR）
        if (gen) {
            const generated = `${HEADER}${GENERATED_MARKER}\n${gen(rules)}\n${GENERATED_END}`;
            const outPath = join(outRoot, entry.implementation);
            const userCode = readExistingUserCode(outPath);
            mkdirSync(dirname(outPath), { recursive: true });
            writeFileSync(outPath, `${generated}\n${userCode}`, "utf-8");
            console.log(`生成 ${entry.implementation}`);
        }

        // Shell 配置生成（如果存在 SHELL_GENERATOR）
        if (shellGen) {
            const shellContent = shellGen(rules);
            const shellOutPath = join(outRoot, entry.implementation);
            mkdirSync(dirname(shellOutPath), { recursive: true });
            writeFileSync(shellOutPath, shellContent, "utf-8");
            console.log(`生成 ${entry.implementation}`);
        }
    }
}

if (process.argv[1] && (process.argv[1].endsWith("transcribe.ts") || process.argv[1].endsWith("transcribe.js"))) {
    transcribe();
}