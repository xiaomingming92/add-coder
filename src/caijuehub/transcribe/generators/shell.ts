import type { TomlData, RuleGenerator } from "../types.js";
// Shell 产线生成器 + SHELL_GENERATORS
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

// ── Shell 配置生成器（产出 .sh 文件，不走 TS 策略路径）──
export const SHELL_GENERATORS: Record<string, RuleGenerator> = {
    "sync-magic-bash": genSyncMagicBashShell,
};
