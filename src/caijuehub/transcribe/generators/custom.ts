import { genGuardSchema } from "../factories.js";
import type { TomlData, RuleGenerator } from "../types.js";
// 逻辑型产线生成器 + GENERATORS 注册表
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
    const d = rules as { auto?: { deploy?: string[] }; magic_path?: Record<string, string> };
    const s = (d.auto?.deploy || ["claude", "qoder", "vscode"]).map((s: string) => `"${s}"`).join(", ");
    // magic_path 映射真源 → 产出（统一层消费，消灭 MAGIC_DIR_MAP 重复 hardcode——轮次 3）
    const mp = d.magic_path || { claude: ".claude", qoder: ".qoder", vscode: ".vscode", trae: ".trae", codex: ".codex" };
    const mpEntries = Object.entries(mp).map(([k, v]) => `    ${k}: "${v}"`).join(",\n");
    return `export const AUTO_DEPLOY_ADAPTERS = [${s}];\n\nexport const MAGIC_DIR_MAP: Record<string, string> = {\n${mpEntries}\n};`;
}

function genPrismaRules(rules: TomlData): string {
    type B = { on_missing?: string; on_existing_add_prisma?: string; on_migrate_fail?: string; auto_generate?: boolean };
    type M = { name?: string; schema_arg?: string };
    type S = { strategy?: string; add_database_url?: string; atlas_dev_url?: string; backup_dir?: string; backup_keep?: number; backup_required_for_push?: boolean };
    const d = rules as { behavior?: B; migration?: M; requires?: { user_model?: boolean }; sync?: S };
    const b = d.behavior || {};
    const m = d.migration || {};
    const s = d.sync || {};
    return `export const PRISMA_CONFIG = {
    onMissing: "${b.on_missing || "block"}",
    onExistingAddPrisma: "${b.on_existing_add_prisma || "ask"}",
    onMigrateFail: "${b.on_migrate_fail || "rollback"}",
    autoGenerate: ${b.auto_generate !== false},
    migrationName: "${m.name || "add_workflow_init"}",
    schemaArg: "${m.schema_arg || "--schema=prisma/"}",
    requiresUserModel: ${(d.requires?.user_model) !== false},
    sync: {
        strategy: "${s.strategy || "atlas"}",
        addDatabaseUrl: "${s.add_database_url || ""}",
        atlasDevUrl: "${s.atlas_dev_url || ""}",
        backupDir: "${s.backup_dir || ".add/backups/prisma-sync"}",
        backupKeep: ${s.backup_keep ?? 5},
        backupRequiredForPush: ${s.backup_required_for_push !== false},
    },
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

function genPortsRules(rules: TomlData): string {
    type P = { start_hint?: number; scan_limit?: number };
    type B = { reuse_registered?: boolean; read_cross_project?: boolean; on_conflict?: string };
    const d = rules as { pg?: P; behavior?: B };
    const pg = d.pg || {};
    const b = d.behavior || {};
    return `export const PORTS_CONFIG = {
    pg: {
        startHint: ${pg.start_hint ?? 5433},
        scanLimit: ${pg.scan_limit ?? 100},
    },
    behavior: {
        reuseRegistered: ${b.reuse_registered !== false},
        readCrossProject: ${b.read_cross_project !== false},
        onConflict: "${b.on_conflict || "ask"}",
    },
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

interface PrismaSyncRules { base_schema?: string; target_pattern?: string; sync_items?: string[]; on_diff?: string; on_missing_model?: string; on_field_conflict?: string; on_missing_field?: string; on_extra_field?: string; prompt?: string; post_sync?: { header?: string; final?: string; managed_actions?: Array<{label: string; cmd: string}>; p3005?: { hint?: string; cmd?: string }; unmanaged_actions?: Array<{label: string; cmd?: string; hint?: string; steps?: string[]}> } }

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
    // Post-Sync 迁移指引
    const ps = d?.post_sync;
    const header = ps?.header ?? "下一步按你的场景选择迁移命令:";
    const finalCmd = ps?.final ?? "npx prisma generate";
    const p3005 = ps?.p3005;
    const managedItems = (ps?.managed_actions ?? []).map(a => `{ label: "${a.label}", cmd: "${a.cmd}" }`).join(",\n            ");
    const unmanagedItems = (ps?.unmanaged_actions ?? []).map(a => {
        if (a.cmd) return `{ label: "${a.label}", cmd: "${a.cmd}" }`;
        const stepList = (a.steps ?? []).map((s: string) => `"${s}"`).join(", ");
        return `{ label: "${a.label}", hint: "${a.hint || ""}", steps: [${stepList}] }`;
    }).join(",\n            ");
    return `export const SYNC_PRISMA_CONFIG = {
    BASE_SCHEMA: "${base}",
    TARGET_PATTERN: "${target}",
    SYNC_ITEMS: [${items}],
    ON_MISSING_MODEL: "${missingModel}",
    ON_FIELD_CONFLICT: "${fieldConflict}",
    ON_MISSING_FIELD: "${missingField}",
    ON_EXTRA_FIELD: "${extraField}",
    PROMPT: "${prompt}",
    POST_SYNC: {
        HEADER: "${header}",
        FINAL: "${finalCmd}",
        MANAGED_ACTIONS: [
            ${managedItems}
        ],
        P3005: { hint: "${p3005?.hint ?? ""}", cmd: "${p3005?.cmd ?? ""}" },
        UNMANAGED_ACTIONS: [
            ${unmanagedItems}
        ],
    },
};`;
}

// ── Sync Magic 生成器 ──
interface SyncMagicRules {
    core?: { project_name?: string; magic_dirs?: string[] };
    exclude?: { patterns?: string[]; log_extensions?: string[] };
    hooks?: Array<{ src: string; dest: string; name: string; magic_dir: string }>;
    categories?: Array<{ name: string; icon: string; bake?: boolean }>;
    verify?: Array<{ src: string; dest: string; name: string }>;
}

function genCollabContractRules(rules: TomlData): string {
    const d = rules as Record<string, Record<string, string | number>>;
    const filePattern = d.file_pattern ?? {};
    const parse = d.parse ?? {};
    const defaults = d.defaults ?? {};
    const roles = d.roles ?? {};

    const str = (v: string | number | undefined, fallback: string): string =>
        typeof v === "string" && v.length > 0 ? v : fallback;

    return `// ⚠️ 自动生成，不要手动编辑！改 collab-contract-rules.toml 后重新运行: add-coder generate
// >>> CAIJUE GENERATED START >>>
export const COLLAB_CONTRACT_CONFIG = {
    CONTRACT_SUFFIX: "${str(filePattern.contract_suffix, "-collab-contract-")}",
    EXCLUDE_SUFFIX: "${str(filePattern.exclude_suffix, ".hitl.md")}",
    PARTICIPANTS_ANCHOR: "${str(parse.participants_anchor, "**Lead Agent**")}",
    STAGES_ANCHOR: "${str(parse.stages_anchor, "| 阶段 | 专家 | 触发条件 | 并行度 |")}",
    BOUNDARIES_ANCHOR: "${str(parse.boundaries_anchor, "| 专家 | 独占文件域 | 禁区 |")}",
    DEPENDENCY_PREFIX: "${str(parse.dependency_prefix, "依赖:")}",
    MASTER_PLAN_REGEX: "${str(parse.master_plan_regex, "总控 Plan:[ ]*`?([^`]+)`?")}",
    ISOLATION_MODE: "${str(defaults.isolation_mode, "file")}",
    STATUS: "${str(defaults.status, "ACTIVE")}",
    VERSION_START: ${typeof defaults.version_start === "number" ? defaults.version_start : 1},
    ROLE_MASTER: "${str(roles.master, "MASTER")}",
    ROLE_SUB: "${str(roles.sub, "SUB")}",
};
// <<< CAIJUE GENERATED END <<<`;
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


export const GENERATORS: Record<string, RuleGenerator> = {
    "detect-ide": genDetectRules,
    "resolve-adapters": genAdapterRules,
    "prisma-inject": genPrismaRules,
    "write-files": genWriterRules,
    "ports-contract": genPortsRules,
    "sync-patch": genSyncRules,
    "project-root-resolution": genProjectRootRules,
    "sync-prisma-schema": genPrismaSyncRules,
    "sync-magic": genSyncMagicRules,
    "hitl-interaction": genHitlInteractionRules,
    "collab-contract": genCollabContractRules,
    "guard-add-route": genGuardSchema("add_route_template"),
    "guard-spec": genGuardSchema("spec_template"),
    "guard-tasks": genGuardSchema("tasks_template"),
};
