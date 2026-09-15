/*
 * 规则适用性（Rule × Hook）契约测试 —— 针对"抽层导致范围放大"的副作用
 *
 * 核心断言：
 *  - 锚定规则（ANCHOR_MISS）只在写入时卡位算缺陷；批量/收尾调用时降级为诊断；
 *  - 缺失类规则全卡位适用；
 *  - 未登记适用性的规则码默认全卡位适用（新规则不会因漏登记而静默失效）。
 */
import { describe, expect, it } from "vitest"
import {
  DEFAULT_RULE_APPLICABILITY,
  applyApplicability,
} from "../../templates/core/validation/policy.js"
import type { ValidationIssue } from "../../templates/core/validation/schema-validator.js"

const anchorIssue: ValidationIssue = { code: "ANCHOR_MISS", detail: "缺锚点(x): plan_track" }
const missingIssue: ValidationIssue = { code: "MISSING_SECTION", detail: "缺章节: ## 甲" }
const unknownIssue: ValidationIssue = { code: "SOME_NEW_RULE", detail: "新规则命中" }

describe("applyApplicability", () => {
  it("写入时（PreToolUse）：锚定算缺陷", () => {
    const r = applyApplicability([anchorIssue, missingIssue], "PreToolUse")
    expect(r.applicable.map((i) => i.code).sort()).toEqual(["ANCHOR_MISS", "MISSING_SECTION"])
    expect(r.diagnostics).toEqual([])
  })

  it("批量/收尾调用（manual）：锚定降级为诊断，不参与 ok 判定", () => {
    const r = applyApplicability([anchorIssue, missingIssue], "manual")
    expect(r.applicable.map((i) => i.code)).toEqual(["MISSING_SECTION"])
    expect(r.diagnostics.map((i) => i.code)).toEqual(["ANCHOR_MISS"])
  })

  it("Stop 卡位：锚定仍为诊断（不把历史文档当缺陷阻断收敛）", () => {
    const r = applyApplicability([anchorIssue], "Stop")
    expect(r.applicable).toEqual([])
    expect(r.diagnostics).toHaveLength(1)
  })

  it("未登记适用性的新规则默认全卡位适用（保守，不静默失效）", () => {
    for (const hook of ["PreToolUse", "Stop", "manual", "SessionEnd"] as const) {
      expect(applyApplicability([unknownIssue], hook).applicable).toHaveLength(1)
    }
  })

  it("适用性表可注入覆盖（便于按 adapter/环境调整）", () => {
    const r = applyApplicability([anchorIssue], "manual", { ANCHOR_MISS: "*" })
    expect(r.applicable).toHaveLength(1)
    expect(r.diagnostics).toEqual([])
  })

  it("默认表覆盖已知规则码（命名可审计）", () => {
    expect(DEFAULT_RULE_APPLICABILITY.ANCHOR_MISS).toEqual(["PreToolUse", "SubagentStop"])
    expect(DEFAULT_RULE_APPLICABILITY.MISSING_SECTION).toBe("*")
  })
})
