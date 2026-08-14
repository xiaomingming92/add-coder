// lib/subagent-stop-router.ts — SubagentStop 入口路由（core 通用协议参考实现，Task 2.2 薄壳化）
// 治理卡位 #11: 子agent边界校验 + 审计聚合 + 阻断
// 与 SubagentStopGuard（能力对齐版）的关系: 本类是 core 入口版语义（bash 逐字），
//   SubagentStopGuard 供 claude/vscode 薄壳消费（additionalContext 文本差异）。
//   ——两者文本契约不同（IDE 协议差异），行为等价基线各自由 golden 固化。
//
// 设计范式: OOP 路由类（边界校验 + 审计聚合单一职责）。

import { existsSync, readFileSync } from "node:fs"
import { detectActiveAdd, EXIT_BLOCK, localIsoSeconds } from "./common.js"

/**
 * SubagentStop 入口路由（core 入口版，bash subagent-stop.sh 逐字语义）:
 *   ① 边界校验: 检查交付物是否超出 spec 边界（无活跃 Plan → 无法校验告警）
 *   ② 审计聚合: stderr 审计输出（对齐 bash date -Iseconds）
 */
export class SubagentStopRouter {
  /** 对齐 bash jq -r '.agent_type // .subagent_name // "unknown"'：
   * 空输入/非法 JSON → jq 无输出 → 空串（不是 "unknown"）；字段缺失才回退 "unknown" */
  private agentNameFrom(input: string): string {
    if (input.trim() === "") return ""
    try {
      const parsed = JSON.parse(input) as { agent_type?: unknown; subagent_name?: unknown }
      const v = parsed.agent_type ?? parsed.subagent_name
      return typeof v === "string" && v !== "" ? v : "unknown"
    } catch {
      return ""
    }
  }

  // ─────────────────────────── 扩展点 ───────────────────────────

  /** ① 无活跃 Plan 告警（core: stderr；qoder 子类 override: stdout JSON） */
  protected emitNoPlanWarn(agentName: string): void {
    process.stderr.write(`[ADD SubagentStop] ⚠️ ${agentName} 已完成，但无活跃 ADD Plan 无法校验边界\n`)
  }

  /** ② 边界通过审计（core: stderr；qoder 子类 override: stdout JSON） */
  protected emitBoundaryPass(agentName: string, planKw: string, _handoff: string): void {
    process.stderr.write(`[ADD SubagentStop] ${agentName} 已完成 — 关联 Plan: ${planKw}\n`)
    process.stderr.write(`[ADD SubagentStop] ${agentName} 边界校验通过 — ${localIsoSeconds()}\n`)
  }

  /** 交付物越界检查开关（core: true；qoder: false——qoder 轻量提示无阻断） */
  protected checkDeliverables(): boolean {
    return true
  }

  /** 主路由：返回 exit code（0 放行 / 2 阻断） */
  run(input: string): number {
    const agentName = this.agentNameFrom(input)

    // ── ① 边界校验：检查子 agent 交付物是否超出 spec 范围 ──
    const state = detectActiveAdd()
    if (state === null) {
      this.emitNoPlanWarn(agentName)
      return 0
    }

    const planKw = state.split("::")[0] ?? ""
    const handoff = state.split("::")[3] ?? ""

    // 如果 handoff 中存在允许的文件清单，检查交付物是否越界（扩展点: qoder 关闭）
    if (this.checkDeliverables() && handoff && handoff !== "none" && existsSync(handoff)) {
      /** 对齐 bash jq -r '.deliverables // ""' */
      const deliverablesRaw = (() => {
        try {
          const parsed = JSON.parse(input) as { deliverables?: unknown }
          return typeof parsed.deliverables === "string" ? parsed.deliverables : ""
        } catch {
          return ""
        }
      })()
      if (deliverablesRaw !== "") {
        const handoffContent = readFileSync(handoff, "utf-8")
        const violations: string[] = []
        for (const f of deliverablesRaw.split(/\s+/)) {
          if (f === "") continue
          if (!handoffContent.includes(f)) violations.push(f)
        }
        if (violations.length > 0) {
          process.stderr.write(`[ADD SubagentStop] ❌ ${agentName} 交付物超出 spec 边界: ${violations.join(" ")}\n`)
          process.stderr.write("[ADD SubagentStop] 要求重做——请检查这些文件是否属于本轮 spec 范围\n")
          return EXIT_BLOCK
        }
      }
    }

    // ── ② 审计聚合（扩展点: core stderr / qoder stdout JSON）──
    this.emitBoundaryPass(agentName, planKw, handoff)
    return 0
  }
}
