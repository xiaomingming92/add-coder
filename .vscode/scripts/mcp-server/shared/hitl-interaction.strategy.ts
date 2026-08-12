// ⚠️ 由 caijuehub/transcribe.ts 自动生成，不要手动编辑！
// 改 *-rules.toml 后重新运行: add-coder generate

// >>> CAIJUE GENERATED START >>>
export const HITL_INTERACTION_CONFIG = {
    default: { mode: "inputRequired" as const },
    qoder: { mode: "genui" as const, widget_path: "templates/core/templates/hitl-approval-widget.html" },
    claude: { mode: "inputRequired" as const },
    vscode: { mode: "inputRequired" as const },
    trae: { mode: "inputRequired" as const },
    codex: { mode: "inputRequired" as const }
} as const;

export type HitlInteractionMode = (typeof HITL_INTERACTION_CONFIG)[keyof typeof HITL_INTERACTION_CONFIG]["mode"];
// <<< CAIJUE GENERATED END <<<// >>> USER CODE >>>
// 在此添加自定义配置覆盖
// <<< USER CODE <<<
