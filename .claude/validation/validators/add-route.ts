/*
 * add-route 专司（Task 2.3 / Spec §5）
 *
 * 语义规则：产出项统计（`- [ ]` / `- [x]`，与 `check_add_route_completeness` 同口径）
 * 与「Task 映射表」存在性——add-route 是 Plan→代码的唯一映射表。
 */
import { countMatches, issue, type TypeCheckContext } from "./types.js"
import type { ValidationIssue } from "../schema-validator.js"

export interface AddRouteStats {
  total: number
  open: number
  done: number
}

export function addRouteStats(content: string): AddRouteStats {
  const done = countMatches(content, /^- \[[xX]\]/gm)
  const open = countMatches(content, /^- \[ \]/gm)
  return { total: done + open, open, done }
}

export function checkAddRoute(ctx: TypeCheckContext): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const stats = addRouteStats(ctx.content)
  if (stats.total === 0) {
    issues.push(issue("ADD_ROUTE_CHECKBOX_MISSING", "未发现任何产出项复选框（- [ ] / - [x]）"))
  }
  if (!/Task\s*映射表|Task 映射表/.test(ctx.content)) {
    issues.push(issue("ADD_ROUTE_TASK_MAP_MISSING", "缺少 Task 映射表（Plan→代码的唯一映射）"))
  }
  return issues
}
