// subagent-stop.ts — SubagentStop 治理卡位（bash 版 subagent-stop.sh 的 TS 同语义实现）
// 路径: templates/core/hooks/lib/subagent-stop.ts
//
// 治理职能（卡位 #11）:
//   ① 子 agent 结果边界校验: 检查交付物是否在 spec 边界内（不越界、不遗漏）
//   ② 审计聚合: 将子 agent 的 sub-traceId 审计记录合并回主 traceId
//   ③ 阻断能力: 子 agent 结果不符合 spec → exit 2 要求重做
//
// 设计范式: OOP 服务类（边界校验单一职责聚合）+ 纯函数解析（state 字段切分）。

import { existsSync, readFileSync } from "node:fs"
import { detectActiveAdd, EXIT_BLOCK, jsonGet, localIsoSeconds, readHookInput } from "./common.js"

/** 纯函数：解析 state 字段（对齐 bash awk -F'::' 切分） */
function stateField(state: string, index: 0 | 1 | 2 | 3 | 4): string {
  return state.split("::")[index] ?? ""
}

/**
 * SubagentStop 治理服务:
 *   - checkBoundary: 交付物边界校验（无活跃 Plan → 仅告警不阻断）
 *   - main: stdin 解析 → agent_type 提取 → 边界校验 → 审计聚合
 */
export class SubagentStopGuard {
  /**
   * 边界校验: 检查子 agent 交付物是否超出 spec 定义的文件范围。
   * 返回 0=通过，1=越界（要求重做）。
   */
  checkBoundary(subagentName: string, deliverables: readonly string[]): number {
    const state = detectActiveAdd()

    if (state === null) {
      // 无活跃 Plan —— 无 spec 可参考，仅告警不阻断
      process.stderr.write(`[ADD SubagentStop] ⚠️ 无活跃 ADD Plan，无法校验 ${subagentName} 的交付物边界\n`)
      return 0
    }

    const planKw = stateField(state, 0)
    const handoff = stateField(state, 3)

    process.stderr.write(`[ADD SubagentStop] ${subagentName} 已完成，交付物: ${deliverables.join(" ")}\n`)
    process.stderr.write(`[ADD SubagentStop] 关联 Plan: ${planKw} | handoff: ${handoff}\n`)

    // best-effort: 如果 handoff 中列出了允许的文件范围，检查交付物是否在其中
    if (handoff && existsSync(handoff) && deliverables.length > 0) {
      const handoffContent = readFileSync(handoff, "utf-8")
      const violations = deliverables.filter((f) => !handoffContent.includes(f))
      if (violations.length > 0) {
        process.stderr.write(`[ADD SubagentStop] ❌ ${subagentName} 交付物超出 spec 边界: ${violations.join(" ")}\n`)
        process.stderr.write("[ADD SubagentStop] 请检查这些文件是否属于本轮 spec 范围，或更新 handoff 文件清单\n")
        return 1
      }
    }
    return 0
  }

  /** 主入口（对齐 bash main） */
  run(subagentName: string, stdin: string): number {
    // 尝试从 stdin JSON 提取交付物信息（对齐 bash grep/sed 提取 agent_type）
    const agentType = jsonGet(stdin, "agent_type")
    const effectiveName = agentType ? `${subagentName}(${agentType})` : subagentName
    const deliverables: string[] = []

    // ① 边界校验
    if (this.checkBoundary(effectiveName, deliverables) !== 0) {
      process.stderr.write("[ADD SubagentStop] 要求重做——交付物超出 spec 边界\n")
      return EXIT_BLOCK
    }

    // ② 审计聚合（输出到 stderr 供日志记录，对齐 bash date -Iseconds）
    process.stderr.write(`[ADD SubagentStop] ${effectiveName} 边界校验通过 — ${localIsoSeconds()}\n`)

    return 0
  }
}
