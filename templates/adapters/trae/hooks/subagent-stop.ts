// subagent-stop.ts — SubagentStop 入口（Trae 版，Task 6.1 继承体系）
// 继承 core SubagentStopRouter，命名子类 TraeSubagentStopRouter:
//   ① 边界校验 + deliverables 越界检查 + 审计聚合 = 基类（与 trae bash 原文逐字同构，
//   2026-08-14 实态核验——手写版逻辑与 core 基类完全一致，收敛为子类）
// 协议差异仅剩: PROJECT_DIR = $PWD（trae 无注入链）

import { readHookInput } from "../../../core/governance/common.js"
import { SubagentStopRouter } from "../../../core/governance/subagent-stop-router.js"

class TraeSubagentStopRouter extends SubagentStopRouter {
  // 当前无 override（边界校验 + 审计聚合与 core 基线一致）；命名子类承载端身份 + 未来演进位
}

const input = readHookInput()
process.exit(new TraeSubagentStopRouter().run(input))
