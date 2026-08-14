// pre-compact.ts — 上下文压缩前 ADD 状态保存（Claude 版，Task 3.1 继承体系）
// 治理逻辑: core PreCompactGuard（状态保存 + tpl 标记清理，与 core 同构）
// 协议差异: PROJECT_DIR 来源 CLAUDE_PROJECT_DIR（依赖注入）

import { PreCompactGuard } from "../../../core/governance/pre-compact-guard.js"
import { resolveClaudeProjectDir } from "./lib/claude-env.js"

process.env.PROJECT_DIR = resolveClaudeProjectDir()

process.exit(new PreCompactGuard().run())
