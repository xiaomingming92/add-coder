// session-start.ts — SessionStart 入口薄壳（Task 2.2 薄壳化）
// 治理逻辑: lib/session-start-guard.ts（SessionStartGuard 状态恢复 + 模板索引 + 代办 + HITL）
// 入口职责: 仅解析 + 进程语义（<50 行），治理 0 复制。

import { SessionStartGuard } from "../governance/session-start-guard.js"

const PROJECT_DIR = process.env.PROJECT_DIR || process.cwd()

process.exit(new SessionStartGuard(PROJECT_DIR).run())
