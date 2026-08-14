// lib/context-inject.ts — 上下文注入模板（Qoder CN 版，Task 4.1 diff 合并 core）
// R2 回流: context-inject diff 已合并——7 象限文本真源 = hook-context-rules.toml
//   （[context.quadrants] core 基线 + [context.adapter_quadrants] qoder 差异）
// 差异保留（行为等价红线）:
//   has_add_dev_unclosed: qoder 版含「（不要等下次会话）」文本差异
//   ~~{{info}} 字面量不插值~~ → 2026-08-14 Task 9.4.1 修复: 回归统一 replaceAll 插值语义
//   （bash <<'EOF' 单引号 heredoc 缺陷照搬——issues 参数实际不生效，已修复）

import { context } from "../../../../core/governance/rules.js"

/** 象限条目（rules.context.quadrants / adapter_quadrants 结构） */
interface Quadrant {
  adapter?: string
  id: string
  consumed: boolean
  text: string
}

/** 结构化 SessionStart JSON 注入（与 core buildSessionStartJson 逐字一致） */
export function buildSessionStartJson(
  plan: string,
  step: string,
  round: string,
  handoff: string
): string {
  return `{
  "continue": true,
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "上次 ADD 流程未完成:\\n  Plan: ${plan}\\n  轮次: ${round}\\n  当前 Step: ${step} (add-route)\\n  恢复命令: query_audit_logs({ planKeyword: '${plan}' })\\n  handoff: ${handoff}"
  }
}
`
}

/** 象限文本索引（adapter 差异优先，回退 core 基线） */
const QUADRANTS: Map<string, Quadrant> = new Map()
for (const q of ((context.adapter_quadrants as unknown as Quadrant[]) ?? []).filter((x) => x.adapter === "qoder")) {
  QUADRANTS.set(q.id, q)
}
for (const q of ((context.quadrants as unknown as Quadrant[]) ?? [])) {
  if (!QUADRANTS.has(q.id)) QUADRANTS.set(q.id, q)
}

/**
 * Stop 七象限分流 few-shot 上下文（Qoder CN 版）。
 * Task 9.4.1 修复: has_add_dev_unclosed 的 {{info}} 正常插值（原 bash <<'EOF' 缺陷照搬——不 replace）
 */
export function buildStopContext(quadrant: string, info: string): string {
  const q = QUADRANTS.get(quadrant)
  if (!q) return ""
  return q.text.replaceAll("{{info}}", info)
}

/** 写操作前置守卫上下文（与 core buildPretoolContext 逐字对齐） */
export function buildPretoolContext(plan: string, round: string): string {
  return `[ADD PreToolUse] 当前 Plan: ${plan}，轮次: ${round}。
本次写入应属于 ADD Step 3 代码实现阶段。
完成后执行 record_dev_operation 记录审计。
`
}
