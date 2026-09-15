/*
 * handoff 专司（Task 2.1 / Spec §2 多轮计数 + §4）
 *
 * schema 层已负责：章节/子章节存在性、轮次计数、占位符、禁词。
 * 本专司只补两条 schema 表达不了的语义规则：
 *  1. **§8 必须含可执行审计查询**（`query_audit_logs(`）——"给下一个会话的入口"不能只是文字描述；
 *  2. **§9 后置确认必须是逐项勾选状态**（不能整节留空）。
 */
import { countMatches, issue, proseOnly, type TypeCheckContext } from "./types.js"
import type { ValidationIssue } from "../schema-validator.js"

export function checkHandoff(ctx: TypeCheckContext): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const content = ctx.content

  if (!/query_audit_logs\s*\(/.test(content)) {
    issues.push(
      issue("AUDIT_QUERY_MISSING", "缺少可执行审计查询（query_audit_logs(...)）——下一会话无从恢复上下文"),
    )
  }

  // 后置确认：取「后置确认」之后的所有复选框
  const idx = content.indexOf("后置确认")
  const post = idx >= 0 ? content.slice(idx) : ""
  const total = countMatches(post, /^- \[[ xX]\]/gm)
  if (idx < 0) {
    issues.push(issue("POSTCHECK_MISSING", "缺少「后置确认」章节", "后置确认"))
  } else if (total === 0) {
    issues.push(issue("POSTCHECK_EMPTY", "后置确认无逐项勾选状态（须列明确认项）"))
  }

  // 多轮文档：每轮的验证标准必须可判定（非空、含可执行证据字样）
  if ((ctx.expectRounds ?? 1) > 1) {
    const verdicts = countMatches(content, /^- \[[ xX]\]/gm)
    if (verdicts === 0) {
      issues.push(issue("ROUND_VERDICT_MISSING", "多轮文档未见任何逐项验证标准（- [ ] / - [x]）"))
    }
  }

  // 脱敏：不得出现凭据硬编码（此处只做"可疑赋值"提示，属 advisory 语义）
  if (/(POSTGRES_PASSWORD|JWT_SECRET|API_KEY)\s*[:=]\s*["'][^"']{8,}["']/.test(proseOnly(content))) {
    issues.push(issue("SECRET_HARDCODED", "疑似凭据硬编码（应以环境变量引用）"))
  }

  return issues
}
