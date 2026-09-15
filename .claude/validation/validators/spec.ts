/*
 * spec 专司（Task 2.2 / Spec §5）
 *
 * 语义规则：`Plan→Spec 映射` 表至少 1 行（DPS 的映射锚定依赖它），
 * 且每个 Requirement 至少含一条 WHEN-THEN（可判定性）。
 */
import { countMatches, issue, proseOnly, type TypeCheckContext } from "./types.js"
import type { ValidationIssue } from "../schema-validator.js"

export function checkSpec(ctx: TypeCheckContext): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const body = proseOnly(ctx.content)

  const mappingRows = countMatches(body, /^\|\s*\d+\s*\|.*\|/gm)
  if (mappingRows === 0) {
    issues.push(issue("PLAN_SPEC_MAP_MISSING", "缺少「Plan→Spec 映射」表（DPS 映射锚定依赖）"))
  }

  const requirements = countMatches(body, /^#{2,3}\s+\d+\.\s+/gm)
  const whenThen = countMatches(body, /^\s*-\s*WHEN\s+/gm)
  if (requirements > 0 && whenThen === 0) {
    issues.push(issue("WHEN_THEN_MISSING", "存在 Requirements 章节但无任何 WHEN-THEN 条目（不可判定）"))
  }
  return issues
}
