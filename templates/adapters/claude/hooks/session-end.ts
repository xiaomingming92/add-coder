// session-end.ts — SessionEnd Claude 版（薄包装：source lib 并自动执行 main）
// 治理卡位 #2: 标记清理 + 会话审计结算 + Stop未触发兜底
// 薄包装语义: bash 版 source lib/session-end.sh 后 lib 的 main 自动执行（BASH_SOURCE 判定）。
// TS 版等价: 直接调用 SessionEndGuard.run()（lib 版行为）。

import { SessionEndGuard } from "../../../core/governance/session-end.js"
import { resolveClaudeProjectDir } from "./lib/claude-env.js"

process.env.PROJECT_DIR = resolveClaudeProjectDir()
process.exit(new SessionEndGuard(process.env.PROJECT_DIR).run())
