/*
 * report 类专司（Task 2.4 / Spec §5：report / runtime-report / collab-contract / fix-verification / prd）
 *
 * 语义规则：收尾类文档必须有明确结论段（"结论/判定/建议"之一），否则只是过程叙述。
 */
import { issue, proseOnly, type TypeCheckContext } from "./types.js"
import type { ValidationIssue } from "../schema-validator.js"

export function checkReport(ctx: TypeCheckContext): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const body = proseOnly(ctx.content)
  if (!/结论|判定|建议|Triage 结果/.test(body)) {
    issues.push(issue("REPORT_CONCLUSION_MISSING", "缺少结论/判定/建议段（收尾类文档须可判定）"))
  }
  return issues
}
