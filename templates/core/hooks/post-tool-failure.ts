// post-tool-failure.ts — PostToolUseFailure 入口薄壳（Task 5.1 继承体系）
// 治理逻辑: governance/post-tool-failure-router.js（PostToolFailureRouter——jq 语义解析 + emit 输出）
// 入口职责: 仅进程语义（<50 行），治理 0 复制。

import { runPostToolFailure } from "../governance/post-tool-failure-router.js"

runPostToolFailure()
