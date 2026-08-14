// stop-check.ts — Stop 入口薄壳（Claude 版，Task 3.1 收敛）
// 治理逻辑: ../../../core/governance/stop-router.js（StopRouter Q0-Q4 分流）
// 协议差异: PROJECT_DIR 来源 CLAUDE_PROJECT_DIR（claude-env 注入链）

import { tryResolveMagicDir } from "../../../core/governance/common.js"
import { StopRouter } from "../../../core/governance/stop-router.js"
import { resolveClaudeProjectDir } from "./lib/claude-env.js"

process.env.PROJECT_DIR = resolveClaudeProjectDir()
const inferredMagicDir = tryResolveMagicDir()
if (inferredMagicDir && !process.env.MAGIC_DIR) {
  process.env.MAGIC_DIR = inferredMagicDir
}

process.exit(new StopRouter().run())
