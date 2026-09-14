/*
 * review 专司（Task 2.4 / Spec §5，三型共用：方案 / 实现 / 运行时）
 *
 * 语义规则：必须有「问题清单」章节且清单条目带严重度标记（P0/P1/P2 或 🔴🟡🟢），
 * 否则 Review 只是叙述、不构成可执行缺陷清单。
 */
import { countMatches, issue, proseOnly, type TypeCheckContext } from "./types.js"
import type { ValidationIssue } from "../schema-validator.js"

export function checkReview(ctx: TypeCheckContext): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const body = proseOnly(ctx.content)

  // 发现清单的等价形态：HITL 发现总览（review-template 的现行结构）/ 问题清单 / 发现列表
  // （2026-09-13 修订：原实现只认后两者，对 review-template 产生假阳性）
  if (!/HITL 发现总览|问题清单|发现列表/.test(body)) {
    issues.push(issue("REVIEW_FINDINGS_MISSING", "缺少发现清单（HITL 发现总览 / 问题清单 / 发现列表）"))
  }
  const severities = countMatches(body, /(🔴|🟡|🟢)|\bP[012]\b/g)
  if (severities === 0) {
    issues.push(issue("REVIEW_SEVERITY_MISSING", "清单条目未见严重度标记（P0/P1/P2 或 🔴🟡🟢）"))
  }
  if (ctx.type === "review.runtime") {
    const unchecked = countMatches(body, /^- \[ \]\s*Triage/gm)
    if (unchecked > 0) {
      issues.push(issue("RUNTIME_TRIAGE_OPEN", `运行时发现未 Triage ${unchecked} 条（不得静默累积）`))
    }
  }
  return issues
}
