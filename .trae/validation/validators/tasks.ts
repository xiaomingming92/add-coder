/*
 * tasks 专司（Task 2.2 / Spec §5）
 *
 * 语义规则：Task 勾选统计（与 `plan_track` 的进度口径一致），
 * 以及「Plan→Task 映射表」存在性（tasks.md 必须能对回 Plan 的 Task）。
 */
import { countMatches, issue, type TypeCheckContext } from "./types.js"
import type { ValidationIssue } from "../schema-validator.js"

export interface TasksStats {
  total: number
  done: number
}

/** Task 级统计：`### Task N.M` 标题数与其中已完成（含子项全勾）的量 */
export function tasksStats(content: string): TasksStats {
  const headings = [...content.matchAll(/^###\s+Task\s+\d+(?:\.\d+)?\s*[:：]/gm)]
  const total = headings.length
  let done = 0
  for (let i = 0; i < headings.length; i++) {
    const start = headings[i].index ?? 0
    const end = i + 1 < headings.length ? (headings[i + 1].index ?? content.length) : content.length
    const body = content.slice(start, end)
    const boxes = body.match(/^- \[[ xX]\]/gm) ?? []
    if (boxes.length > 0 && boxes.every((b) => /\[[xX]\]/.test(b))) done++
  }
  return { total, done }
}

export function checkTasks(ctx: TypeCheckContext): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const stats = tasksStats(ctx.content)
  if (stats.total === 0) {
    issues.push(issue("TASK_HEADING_MISSING", "未发现 `### Task N.M:` 形式的 Task 标题（无法拆解执行）"))
  }
  if (!/Plan\s*→\s*Task|Plan→Task/.test(ctx.content)) {
    issues.push(issue("PLAN_TASK_MAP_MISSING", "缺少「Plan→Task 映射」表（Tasks 必须可对回 Plan）"))
  }
  return issues
}
