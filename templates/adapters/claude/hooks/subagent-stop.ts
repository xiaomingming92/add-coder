// subagent-stop.ts — SubagentStop 入口薄壳（Claude 版，Task 3.1 继承体系）
// 治理逻辑: core SubagentStopRouter（边界校验 + 审计聚合，与 core 完全同构）
// 协议差异: PROJECT_DIR 来源 CLAUDE_PROJECT_DIR（依赖注入，无 override 需求）

import { readHookInput } from "../../../core/governance/common.js"
import { SubagentStopRouter } from "../../../core/governance/subagent-stop-router.js"
import { resolveClaudeProjectDir } from "./lib/claude-env.js"

process.env.PROJECT_DIR = resolveClaudeProjectDir()

const input = readHookInput()
process.exit(new SubagentStopRouter().run(input))
