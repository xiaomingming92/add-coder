// subagent-guard.ts — SubagentStart 入口（Qoder CN 版，Task 4.1 继承体系）
// 继承 core SubagentGuardRouter，命名子类 QoderSubagentGuardRouter:
//   输出形态 = 基类默认（hookSpecificOutput JSON，与 core 同构）——当前无 override，
//   命名子类承载端身份 + 未来演进位（如 SubagentStart 新增字段）。
// 协议差异: PROJECT_DIR 注入链（qoder-env）

import { SubagentGuardRouter } from "../../../core/governance/subagent-guard-router.js"
import { injectProjectDir } from "./lib/qoder-env.js"

class QoderSubagentGuardRouter extends SubagentGuardRouter {
  // 当前无 override（基类 JSON 输出即 qoder 协议）
}

injectProjectDir()

process.exit(new QoderSubagentGuardRouter().run())
