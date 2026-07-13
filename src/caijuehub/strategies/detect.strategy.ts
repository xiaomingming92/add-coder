// ⚠️ 由 caijuehub/transcribe.ts 自动生成，不要手动编辑！
// 改 *-rules.toml 后重新运行: add-coder generate

// >>> CAIJUE GENERATED START >>>
export const DETECT_RULES = [
  { env: "QODER_CN_IDE", value: "qoder" },
  { env: "QODERCN_AGENT", value: "qoder" },
  { env: "QODERCN_PROJECT_DIR", value: "qoder" },
  { env: "QODER_PROJECT_DIR", value: "qoder" },
  { env: "CLAUDE_PROJECT_DIR", value: "claude" },
  { env: "TERM_PROGRAM", match: "vscode", value: "vscode" },
  { dir: ".claude", value: "claude" },
  { dir: ".qoder", value: "qoder" },
  { dir: ".vscode", value: "vscode" },
];
export const DETECT_FALLBACK = "auto";
// <<< CAIJUE GENERATED END <<<
// >>> USER CODE >>>
import { existsSync } from "fs";
import { join } from "path";

export function detectIDE(projectRoot: string): string {
  for (const rule of DETECT_RULES) {
    if (rule.env && process.env[rule.env]) {
      if (rule.match && process.env[rule.env] !== rule.match) continue;
      return rule.value;
    }
    if (rule.dir && existsSync(join(projectRoot, rule.dir))) {
      return rule.value;
    }
  }
  return DETECT_FALLBACK;
}
// <<< USER CODE <<<
