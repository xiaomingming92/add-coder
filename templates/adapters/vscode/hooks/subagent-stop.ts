// subagent-stop.ts — SubagentStop 入口（VS Code Copilot 版，Task 5.1 继承体系）
// 继承 core SubagentStopRouter，命名子类 VscodeSubagentStopRouter:
//   边界校验 + 审计聚合与 core 逐字同构（2026-08-14 实态核验: vscode 完整实现版
//   与 core 相同，收敛为子类）——当前无 override，命名子类承载端身份 + 未来演进位
// 协议差异: 无

import { readHookInput } from "../../../core/governance/common.js"
import { SubagentStopRouter } from "../../../core/governance/subagent-stop-router.js"

class VscodeSubagentStopRouter extends SubagentStopRouter {
  // 当前无 override（边界校验 + 审计聚合与 core 基线一致）；命名子类承载端身份 + 未来演进位
}

const input = readHookInput()
process.exit(new VscodeSubagentStopRouter().run(input))
