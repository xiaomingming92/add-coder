/*
 * HITL 提案文档内容用例（2026-09-14 修复"生成器不满足自身 schema"的回归防线）
 *
 * 核心断言：**生成物必须通过它自己声明的 schema**——这条就是当初漏掉的检查
 * （6 份 *.hitl.md 全部缺 `## 审批结论`，而模板与 schema 都要求它）。
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  HITL_VERDICT_HEADING,
  applyHitlDecisionToProposal,
  buildHitlProposalMarkdown,
  ensureHitlVerdictSection,
} from "../templates/core/scripts/mcp-server/shared/hitl-proposal-content.js"
import { validateAgainstSchema, type SchemaFile } from "../templates/core/validation/schema-validator.js"
import { shouldSkipHitlCreateDialog } from "../templates/core/scripts/mcp-server/shared/hitl-create-policy.js"
import { projectRoot } from "../src/shared/paths.js"

const ROOT = projectRoot() ?? process.cwd()
const schema = JSON.parse(
  readFileSync(join(ROOT, "templates/core/templates/hitl-template.schema.json"), "utf-8"),
) as SchemaFile

const build = () =>
  buildHitlProposalMarkdown({
    planName: "demo-plan-v1",
    round: 2,
    type: "PLAN_REVIEW",
    createdAt: "2026-09-14T05:00:00.000Z",
    dimensions: [{ name: "范围界定", content: "只做校验真源统一" }, { name: "新增依赖", content: "无" }],
  })

describe("HITL 提案生成物", () => {
  it("两章节齐备（HITL 计划总览 + 审批结论）", () => {
    const doc = build()
    expect(doc).toContain("## HITL 计划总览")
    expect(doc).toContain(HITL_VERDICT_HEADING)
  })

  it("通过 hitl-template.schema.json（生成器必须满足自身 schema）", () => {
    expect(validateAgainstSchema(build(), schema)).toEqual([])
  })

  it("维度行按传入维度生成（不是固定 8 行）", () => {
    const doc = build()
    expect(doc).toContain("| 1 | 范围界定 |")
    expect(doc).toContain("| 2 | 新增依赖 |")
    expect(doc).not.toContain("| 3 | MCP 工具 |")
  })

  it("替换模板占位符（不得残留 {{...}}）", () => {
    const doc = build()
    for (const ph of schema.placeholders ?? []) expect(doc).not.toContain(ph)
  })
})

describe("审批结论回写", () => {
  it("写入时间/决策/原因，并刷新状态行", () => {
    const out = applyHitlDecisionToProposal(build(), {
      status: "TONGYI",
      at: "2026-09-14T06:00:00.000Z",
      reason: "全部同意",
    })
    expect(out).toContain("状态: TONGYI")
    expect(out).toContain("| 2026-09-14T06:00:00.000Z | TONGYI | 全部同意 |")
    expect(validateAgainstSchema(out, schema)).toEqual([])
  })

  it("重复回写幂等（不追加重复行）", () => {
    const once = applyHitlDecisionToProposal(build(), { status: "TONGYI", at: "T1" })
    const twice = applyHitlDecisionToProposal(once, { status: "BOHUI", at: "T2", reason: "改方案" })
    expect(twice.match(/\| T1 \|/g)).toBeNull()
    expect(twice.match(/\| T2 \| BOHUI \| 改方案 \|/g)?.length).toBe(1)
  })

  it("历史产物（无审批结论章节）也能补写并通过 schema", () => {
    const legacy = `# p — HITL 提案 (round 1)\n\n> 创建: T  |  类型: PLAN  |  状态: DRAFT\n\n## HITL 计划总览\n\n| # | 维度 | 方案内容 | 决策 |\n|---|------|----------|:----:|\n| 1 | 范围界定 | x | 同意/驳回 |\n`
    const out = applyHitlDecisionToProposal(legacy, { status: "TONGYI", at: "T3" })
    expect(out).toContain(HITL_VERDICT_HEADING)
    expect(validateAgainstSchema(out, schema)).toEqual([])
  })

  it("ensureHitlVerdictSection：DRAFT（旧生成器产物）补骨架后即满足 schema，且不改已有内容", () => {
    const legacy = `# p — HITL 提案 (round 1)\n\n> 创建: T  |  类型: PLAN  |  状态: DRAFT\n\n## HITL 计划总览\n\n| # | 维度 | 方案内容 | 决策 |\n|---|------|----------|:----:|\n| 1 | 范围界定 | x | 同意/驳回 |\n`
    const draft = ensureHitlVerdictSection(legacy)
    expect(draft).toContain(HITL_VERDICT_HEADING)
    expect(draft.startsWith(legacy.trimEnd().slice(0, 40))).toBe(true) // 原内容前缀不变
    expect(validateAgainstSchema(draft, schema)).toEqual([])
    expect(ensureHitlVerdictSection(draft)).toBe(draft) // 幂等
  })
})

describe("create_hitl 的环境裁决（Codex 空转回归）", () => {
  it("mcpApps（Codex）→ 跳过创建弹框（审批走 widget，不展开 inputRequired）", () => {
    expect(shouldSkipHitlCreateDialog("mcpApps")).toBe(true)
  })

  it("inputRequired 环境（claude/vscode/trae）→ 仍走弹框", () => {
    expect(shouldSkipHitlCreateDialog("inputRequired")).toBe(false)
  })

  it("genui 模式：本体仍走引导分支（不是静默创建）；显式 _use_genui 才跳过", () => {
    // genui（Qoder）由 create 里的引导分支处理：返回 widget 引导，不创建 —— 故此处应为 false
    expect(shouldSkipHitlCreateDialog("genui")).toBe(false)
    expect(shouldSkipHitlCreateDialog("genui", { useGenui: true })).toBe(true)
  })

  it("降级：_fallback 显式声明时跳过弹框", () => {
    expect(shouldSkipHitlCreateDialog("inputRequired", { useGenui: true })).toBe(true)
    expect(shouldSkipHitlCreateDialog("inputRequired", { fallback: true })).toBe(true)
  })
})
