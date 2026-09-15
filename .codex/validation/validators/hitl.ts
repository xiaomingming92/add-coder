/*
 * hitl 专司（Task 2.4 / Spec §5）
 *
 * 语义规则：提案必须含维度表格且至少 1 行（无维度 = 无法逐项拍板）；
 * 且状态字段须存在（DRAFT/TONGYI/BOHUI 可判定）。
 */
import { countMatches, issue, proseOnly, type TypeCheckContext } from "./types.js"
import type { ValidationIssue } from "../schema-validator.js"

export function checkHitl(ctx: TypeCheckContext): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const body = proseOnly(ctx.content)

  const dimensionRows = countMatches(body, /^\|\s*\d+\s*\|[^|]+\|[^|]+\|/gm)
  if (dimensionRows === 0) {
    issues.push(issue("HITL_DIMENSION_MISSING", "提案无决策维度行（无法逐项拍板）"))
  }
  if (!/状态\s*[:：]/.test(body)) {
    issues.push(issue("HITL_STATUS_MISSING", "提案缺少状态字段（DRAFT/TONGYI/BOHUI）"))
  }
  return issues
}
