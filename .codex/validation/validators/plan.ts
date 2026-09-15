/*
 * plan 专司（Task 2.3 / Spec §5）
 *
 * 语义规则：元信息必含「Plan 名称 / 启动时间 / 状态」三字段（HITL 与纳管依赖它们），
 * 且状态不得停留在"待审批"以外的含糊表述（须可判定）。
 */
import { issue, type TypeCheckContext } from "./types.js"
import type { ValidationIssue } from "../schema-validator.js"

const REQUIRED_META = ["**Plan 名称**", "**启动时间**", "**状态**"]

export function checkPlan(ctx: TypeCheckContext): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  for (const field of REQUIRED_META) {
    if (!ctx.content.includes(field)) {
      issues.push(issue("PLAN_META_MISSING", `Plan 元信息缺少字段：${field}`, field))
    }
  }
  return issues
}
