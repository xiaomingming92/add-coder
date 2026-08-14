// session-end.ts — SessionEnd 入口薄壳（Task 2.2 薄壳化）
// 治理逻辑: lib/session-end.ts（SessionEndGuard 清理 + 结算 + 兜底）
// 入口职责: 仅解析 + 进程语义（<50 行），治理 0 复制。

import { SessionEndGuard } from "../governance/session-end.js"

const PROJECT_DIR = process.env.PROJECT_DIR || process.cwd()
process.env.PROJECT_DIR = PROJECT_DIR

process.exit(new SessionEndGuard(PROJECT_DIR).run())
