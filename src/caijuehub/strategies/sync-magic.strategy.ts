// ⚠️ 由 caijuehub/transcribe.ts 自动生成，不要手动编辑！
// 改 *-rules.toml 后重新运行: add-coder generate

// >>> CAIJUE GENERATED START >>>
export const SYNC_MAGIC_CONFIG = {
    PROJECT_NAME: "add-coder",
    MAGIC_DIRS: [".add", ".qoder", ".claude", ".vscode"],
    EXCLUDE_PATTERNS: [".gitkeep", ".DS_Store", "debug-dump"],
    LOG_EXTENSIONS: [".log"],
    HOOKS: [
    { src: "templates/adapters/claude/hooks", dest: ".claude/hooks", name: "claude hooks", magicDir: ".claude" },
    { src: "templates/adapters/qoder/hooks", dest: ".qoder/hooks", name: "qoder hooks", magicDir: ".qoder" },
    { src: "templates/adapters/vscode/hooks", dest: ".vscode/hooks", name: "vscode hooks", magicDir: ".vscode" },
    { src: "templates/core/hooks", dest: ".add/hooks", name: ".add hooks", magicDir: ".add" },
    { src: "templates/core/hooks", dest: "templates/adapters/codex/hooks", name: "codex hooks", magicDir: ".codex" },
    { src: "templates/core/hooks", dest: "templates/adapters/trae/hooks", name: "trae hooks", magicDir: ".trae" }
    ],
    CATEGORIES: [
    { name: "templates", icon: "📚", bake: false },
    { name: "skills", icon: "🎯", bake: true },
    { name: "rules", icon: "📋", bake: true },
    { name: "agents", icon: "🤖", bake: true },
    { name: "scripts", icon: "📜", bake: true },
    { name: "docs", icon: "📖", bake: true },
    { name: "vocabulary", icon: "📕", bake: true },
    { name: "tools", icon: "🔧", bake: true }
    ],
    VERIFY: [
    { src: "templates/adapters/claude/hooks", dest: ".claude/hooks", name: "claude hooks" },
    { src: "templates/adapters/qoder/hooks", dest: ".qoder/hooks", name: "qoder hooks" },
    { src: "templates/adapters/vscode/hooks", dest: ".vscode/hooks", name: "vscode hooks" },
    { src: "templates/core/hooks", dest: ".add/hooks", name: ".add hooks" },
    { src: "templates/core/templates", dest: ".add/templates", name: ".add templates" }
    ],
} as const;

export type SyncMagicHook = (typeof SYNC_MAGIC_CONFIG)["HOOKS"][number];
export type SyncMagicCategory = (typeof SYNC_MAGIC_CONFIG)["CATEGORIES"][number];
export type SyncMagicVerify = (typeof SYNC_MAGIC_CONFIG)["VERIFY"][number];
// <<< CAIJUE GENERATED END <<<