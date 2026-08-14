// context-inject.ts — 上下文注入模板（bash 版 context-inject.sh 的 TS 同语义实现）
// 共享库: SessionStart JSON 注入 + Stop 七象限分流 few-shot + 写操作前置守卫
// 规则真源: hook-context-rules.toml（[context.quadrants] / [context.pretool]）
// consumed 语义（Task 2.3 死代码象限归档）: true = 有入口消费；false = 死代码象限
//   （2026-08-14 实态核验: 全端 stop-check 仅消费 no_add_has_dev + has_add_dev_unclosed）

import { context } from "./rules.js"

/** 象限条目（rules.context.quadrants 结构） */
interface Quadrant {
  id: string
  consumed: boolean
  text: string
}

/** 结构化 SessionStart JSON 注入（与 bash build_session_start_json 逐字对齐） */
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

/** 象限文本索引（真源: hook-context-rules.toml [context.quadrants]）
 * Task 9.4.3 裁剪: 仅加载 consumed=true 象限（no_add_has_dev / has_add_dev_unclosed）——
 * 死代码象限（consumed=false ×5）从运行索引移除（不可达），文本保留 TOML 真源待归档。 */
const QUADRANTS: Map<string, Quadrant> = new Map(
  (((context.quadrants as unknown as Quadrant[]) ?? [])
    .filter((q) => q.consumed === true)
    .map((q) => [q.id, q]) as Array<[string, Quadrant]>)
)

/** Stop 七象限分流 few-shot 上下文（文本真源 = TOML；{{info}} 占位符 replace 插值） */
export function buildStopContext(quadrant: string, info: string): string {
  const q = QUADRANTS.get(quadrant)
  if (!q) return ""
  return q.text.replaceAll("{{info}}", info)
}

/** 写操作前置守卫上下文（真源: hook-context-rules.toml [context.pretool]） */
export function buildPretoolContext(plan: string, round: string): string {
  const tpl = (context.pretool as { text: string }).text
  return tpl.replaceAll("{{plan}}", plan).replaceAll("{{round}}", round)
}
