// ⚠️ 由 caijuehub/transcribe.ts 自动生成，不要手动编辑！
// 改 *-rules.toml 后重新运行: add-coder generate

// >>> CAIJUE GENERATED START >>>
export const AUTO_DEPLOY_ADAPTERS = ["claude", "qoder", "vscode"];

export const MAGIC_DIR_MAP: Record<string, string> = {
    claude: ".claude",
    qoder: ".qoder",
    vscode: ".vscode",
    trae: ".trae",
    codex: ".codex"
};
// <<< CAIJUE GENERATED END <<<// >>> USER CODE >>>
export function resolveAdapters(target: string): string[] {
    return [target];
}

// <<< USER CODE <<<
