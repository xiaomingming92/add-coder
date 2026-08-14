// lib/claude-env.ts — Claude 私有环境解析（CLAUDE_PROJECT_DIR 优先）
// 契约: claude 端所有 hook 的 PROJECT_DIR 来源 = ${CLAUDE_PROJECT_DIR:-$PWD}

/** Claude 项目目录解析（对齐 bash ${CLAUDE_PROJECT_DIR:-$PWD}） */
export function resolveClaudeProjectDir(): string {
  return process.env.CLAUDE_PROJECT_DIR || process.cwd()
}
