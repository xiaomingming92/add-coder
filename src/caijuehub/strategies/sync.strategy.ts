// ⚠️ 由 caijuehub/transcribe.ts 自动生成，不要手动编辑！
// 改 *-rules.toml 后重新运行: add-coder generate

// >>> CAIJUE GENERATED START >>>
export const SYNC_CONFIG = {
    PATCH_GUARD: [/[/]plans[/]/, /[/]specs[/]/, /[/]reviews[/]/, /[/]rules[/]profiles[/]/],
    HASH_OUTPUT_FILE: ".add-coder-hash.json",
    HASH_SRC_FILE: "templates/.add-coder-src-hash.json",
    HASH_HEX_LENGTH: 8,
    PATCH_ON_MISSING: "write",
    PATCH_ON_CONFLICT: "interactive",
    PATCH_ON_SAME: "skip",
    VERSION_ON_FIRST: "baseline",
    VERSION_ON_UPGRADE: "baseline",
    VERSION_ON_HASH_LOST: "conflict",
    VERSION_SENTINEL: ".add-coder-version",
    DEFAULT_ON_MISSING: "write",
    DEFAULT_ON_EXISTING: "skip",
    PROMPT_FULL: "所有 ADD 模板文件已就位。使用 --patch 更新已有文件。",
    PROMPT_PATCH_DONE: "所有 ADD 模板文件已是最新。",
};
// <<< CAIJUE GENERATED END <<<