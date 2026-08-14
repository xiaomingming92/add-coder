// prompt-submit.ts — UserPromptSubmit 入口薄壳（Task 2.2 薄壳化）
// 治理逻辑: lib/prompt-router.ts（PromptRouter L1/L2/L3 分流，日报阈值消费 hook-event-rules.toml）
// 入口职责: 仅解析 + 进程语义（<50 行），治理 0 复制。

import { readHookInput } from "../governance/common.js"
import { PromptRouter } from "../governance/prompt-router.js"

const input = readHookInput()
const MAGIC_DIR = process.env.MAGIC_DIR || ".qoder"

process.exit(new PromptRouter(MAGIC_DIR).run(input))
