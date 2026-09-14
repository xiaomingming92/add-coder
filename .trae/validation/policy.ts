/*
 * 校验策略（Plan core-validation-lifecycle Task 1.2 / Spec §3 §Policy）
 *
 * 口径由**卡位 + 文档类型**共同决定，且结果必须携带 mode 与依据（可审计）。
 * 卡位编号沿用 `templates/core/docs/ADD-governance-*.md` 的 ADD 治理卡位 ①–⑭。
 */

export type ValidationMode = "advisory" | "blocking"
export type GovernanceHook =
  | "SessionStart" | "UserPromptSubmit" | "PreToolUse" | "PostToolUse" | "PostToolUseFailure"
  | "Stop" | "StopFailure" | "SessionEnd" | "PreCompact" | "SubagentStart" | "SubagentStop"
  | "Notification" | "PermissionRequest" | "PermissionDenied" | "ConfigChange"
  | "WorktreeCreate" | "WorktreeRemove" | "manual"

export interface PolicyDecision {
  mode: ValidationMode
  /** 依据说明（进入结果，可审计） */
  basis: string
}

/** 卡位默认口径（Spec §4 矩阵） */
const HOOK_DEFAULT: Partial<Record<GovernanceHook, { mode: ValidationMode; basis: string }>> = {
  PreToolUse: { mode: "blocking", basis: "④ 写入前置守卫：预检阻断，避免写出不合规文档" },
  PostToolUse: { mode: "advisory", basis: "⑤ 文档守卫：写后复检不阻断，转告警 + 留痕" },
  Stop: { mode: "blocking", basis: "⑦ 验收检查：跨文档一致性与封口判定，阻断未收敛" },
  SubagentStop: { mode: "blocking", basis: "⑪ 子代理结果校验：产物同样须合规" },
  SessionEnd: { mode: "advisory", basis: "② 审计结算：批量结果入库，不阻断" },
  manual: { mode: "advisory", basis: "手工/批量调用：仅报告，不阻断" },
}

export function decidePolicy(hook: GovernanceHook, type: string, override?: ValidationMode): PolicyDecision {
  if (override) {
    return { mode: override, basis: `调用方显式指定 mode=${override}（type=${type}）` }
  }
  const byHook = HOOK_DEFAULT[hook]
  if (byHook) return { mode: byHook.mode, basis: byHook.basis }
  return { mode: "advisory", basis: `卡位 ${hook} 未声明口径 → 默认 advisory（不阻断）` }
}

/* ───────────────────────── 规则适用性（Rule × Hook） ─────────────────────────
 * 为什么需要（2026-09-13 修订：抽层时发现的范围放大）：
 * 规则集中到 core 后，若不加适用性约束，**原本只在某个卡位生效的规则会在所有卡位生效**——
 * 例：锚定规则原为「写入时防劣化」，搬进 core 后会在收尾批量校验里把**历史文档**判为缺陷，
 * 把噪音当违规。故规则集（what）与适用性（where）必须分开，严重度（how）由 decidePolicy 决定。
 * ───────────────────────────────────────────────────────────────────────── */

import type { ValidationIssue } from "./schema-validator.js"

/** 规则码 → 适用卡位；`"*"` 表示全卡位 */
export type RuleApplicability = Readonly<Record<string, readonly GovernanceHook[] | "*">>

export const DEFAULT_RULE_APPLICABILITY: RuleApplicability = {
  // 锚定类：仅"写入时防劣化"场景生效；批量/收尾不据此判历史文档为缺陷
  ANCHOR_MISS: ["PreToolUse", "SubagentStop"],
  // 缺失类：全卡位有效（文档缺失章节在哪都算缺陷）
  MISSING_SECTION: "*",
  MISSING_SUBSECTION: "*",
  ROUND_COUNT_SHORT: "*",
  // 占位符残留：全卡位有效
  PLACEHOLDER_LEFT: "*",
  // 结构位禁词：全卡位有效（0.3.27 语义）
  FORBIDDEN_TERM: "*",
  // checklist 证据占位：仅收尾/封口相关卡位算缺陷，写入时属"进行中"（advisory 诊断）
  EVIDENCE_PLACEHOLDER_LEFT: ["Stop", "SessionEnd", "manual"],
} as const

export interface ApplicabilityResult {
  /** 在该卡位算作缺陷的问题（参与 ok 判定） */
  applicable: ValidationIssue[]
  /** 在该卡位不算缺陷、但仍需可见的问题（诊断；不参与 ok 判定） */
  diagnostics: ValidationIssue[]
}

/**
 * 按卡位过滤问题：未声明适用性的规则码默认**全卡位适用**（保守：新规则不会因漏登记而静默失效）。
 */
export function applyApplicability(
  issues: readonly ValidationIssue[],
  hook: GovernanceHook,
  applicability: RuleApplicability = DEFAULT_RULE_APPLICABILITY,
): ApplicabilityResult {
  const applicable: ValidationIssue[] = []
  const diagnostics: ValidationIssue[] = []
  for (const issue of issues) {
    const scope = applicability[issue.code]
    const inScope = scope === undefined || scope === "*" || scope.includes(hook)
    if (inScope) applicable.push(issue)
    else diagnostics.push(issue)
  }
  return { applicable, diagnostics }
}
