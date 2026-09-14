/*
 * checklist 专司（Task 2.2 / Spec §5）
 *
 * 语义规则（schema 不表达）：
 *  - `[T]` 未勾选数（封口"验收证据"因子的输入）；
 *  - `[R]` 项存在性（运行时验证须留有清单，不得为零）；
 *  - 「(待填写)」证据占位残留（证据必须真实，不接受占位）。
 */
import { countMatches, issue, type TypeCheckContext } from "./types.js"
import type { ValidationIssue } from "../schema-validator.js"

export interface ChecklistStats {
  tTotal: number
  tDone: number
  tOpen: number
  rTotal: number
  evidencePlaceholders: number
}

export function checklistStats(content: string): ChecklistStats {
  const tDone = countMatches(content, /^- \[[xX]\] \[T\]/gm)
  const tOpen = countMatches(content, /^- \[ \] \[T\]/gm)
  return {
    tTotal: tDone + tOpen,
    tDone,
    tOpen,
    rTotal: countMatches(content, /^- \[[ xX]\] \[R\]/gm),
    evidencePlaceholders: countMatches(content, /\(待填写\)/gm),
  }
}

export function checkChecklist(ctx: TypeCheckContext): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const s = checklistStats(ctx.content)

  if (s.tTotal === 0) {
    issues.push(issue("CHECKLIST_T_MISSING", "未发现任何 [T] 编译期验证项（checklist 缺少可判定内容）"))
  }
  if (s.rTotal === 0) {
    issues.push(issue("CHECKLIST_R_MISSING", "未发现任何 [R] 运行时验证项（须留待运行时清单）"))
  }
  if (s.evidencePlaceholders > 0) {
    issues.push(
      issue("EVIDENCE_PLACEHOLDER_LEFT", `证据占位残留 ${s.evidencePlaceholders} 处（(待填写)）——证据必须为真实命令与结果`),
    )
  }
  return issues
}
