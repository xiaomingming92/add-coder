// subagent-stop.ts — SubagentStop 入口薄壳（Task 2.2 薄壳化）
// 治理逻辑: lib/subagent-stop-router.ts（SubagentStopRouter 边界校验 + 审计聚合）
// 入口职责: 仅解析 + 进程语义（<50 行），治理 0 复制。

import { readHookInput } from "../governance/common.js"
import { SubagentStopRouter } from "../governance/subagent-stop-router.js"

const input = readHookInput()
process.exit(new SubagentStopRouter().run(input))
