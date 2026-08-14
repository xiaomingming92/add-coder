// subagent-stop.ts — SubagentStop 入口（Qoder CN 版，Task 4.1 继承体系补全）
// 继承 core SubagentStopRouter，命名子类 QoderSubagentStopRouter（qoder 协议差异 override）:
//   ① checkDeliverables: false——qoder 轻量提示无阻断（bash 原文无交付物越界检查）
//   ② emitNoPlanWarn: stdout JSON（qoder 协议；core 是 stderr 文本）
//   ③ emitBoundaryPass: stdout JSON（qoder 协议；core 是 stderr 两行审计）

import { detectActiveAdd, readHookInput } from "../../../core/governance/common.js"
import { SubagentStopRouter } from "../../../core/governance/subagent-stop-router.js"
import { injectProjectDir } from "./lib/qoder-env.js"

class QoderSubagentStopRouter extends SubagentStopRouter {
  /** ① qoder 轻量提示无阻断（bash 原文无交付物越界检查） */
  protected override checkDeliverables(): boolean {
    return false
  }

  /** ② 无活跃 Plan: stdout JSON（qoder 协议） */
  protected override emitNoPlanWarn(agentName: string): void {
    const ctx = `[ADD SubagentStop] ⚠️ ${agentName} 已完成，但无活跃 ADD Plan 无法校验边界。`
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "SubagentStop", additionalContext: ctx } }) + "\n")
  }

  /** ③ 边界通过: stdout JSON（qoder 协议——bash 原文逐字文本） */
  protected override emitBoundaryPass(agentName: string, planKw: string, handoff: string): void {
    const ctx = `[ADD SubagentStop] ${agentName} 子代理结束。Plan: ${planKw}, handoff: ${handoff}。边界校验通过，审计已聚合。`
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "SubagentStop", additionalContext: ctx } }) + "\n")
  }
}

injectProjectDir()

const input = readHookInput()
process.exit(new QoderSubagentStopRouter().run(input))
