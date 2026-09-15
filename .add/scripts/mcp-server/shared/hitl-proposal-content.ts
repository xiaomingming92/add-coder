/*
 * HITL 提案文档内容（生成 + 裁决回写）
 *
 * 为什么抽出来（2026-09-14 修复"生成器不满足自身 schema"）：
 * `create_hitl` 原先把 markdown 直接内联在工具体里拼字符串，产物**缺 `## 审批结论`**，
 * 而真源 `templates/core/templates/hitl-template.md` 与 `hitl-template.schema.json`
 * 都把它列为必需章节；同时 `update_hitl` 只改状态行与维度列，**裁决结论不回写文档**——
 * 结果 6/6 `*.hitl.md` 不满足自身 schema，"文件通道"残缺（结论只在 DB 与哨兵里）。
 * 抽成纯函数后：生成物可用同一校验层直接断言（tests/hitl-proposal-content.test.ts）。
 */

/** 真源模板中的必需章节名（改这里必须同时改 hitl-template.md / .schema.json） */
export const HITL_VERDICT_HEADING = "## 审批结论"

export interface HitlDimension {
  name: string
  content?: string
}

export interface BuildHitlProposalInput {
  planName: string
  round: number
  type: string
  createdAt: string
  dimensions?: HitlDimension[]
}

const escapeCell = (value: string) => value.replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>")

/** 生成 HITL 提案 markdown（与 `hitl-template.md` 章节对齐） */
export function buildHitlProposalMarkdown(input: BuildHitlProposalInput): string {
  const dims = input.dimensions ?? []
  const tableRows = dims.length > 0
    ? dims.map((d, i) => `| ${i + 1} | ${d.name} | ${escapeCell(d.content ?? "")} | 同意/驳回 |`).join("\n")
    : [
        "| 1 | 实施主体 | | 同意/驳回 |",
        "| 2 | 数据模型 | | 同意/驳回 |",
        "| 3 | MCP 工具 | | 同意/驳回 |",
        "| 4 | 文件命名 | | 同意/驳回 |",
        "| 5 | 模板 + schema | | 同意/驳回 |",
        "| 6 | 新增依赖 | | 同意/驳回 |",
        "| 7 | 预计文件数 | | 同意/驳回 |",
        "| 8 | 预计轮次 | | 同意/驳回 |",
      ].join("\n")

  return [
    `# ${input.planName} — HITL 提案 (round ${input.round})`,
    "",
    `> 创建: ${input.createdAt}  |  类型: ${input.type}  |  状态: DRAFT`,
    "",
    "## HITL 计划总览",
    "",
    "请填写以下决策维度，人工审核后点击 update_hitl 弹框选择「同意/驳回」完成审批：",
    "",
    "| # | 维度 | 方案内容 | 决策 |",
    "|---|------|----------|:----:|",
    tableRows,
    "",
    HITL_VERDICT_HEADING,
    "",
    "> **tongyi**：方案通过。",
    "> **bohui**：方案驳回，需修正后重新 create_hitl 发起下一轮。",
    "",
    "| 时间 | 决策 | 原因 |",
    "|------|:----:|------|",
    "| | | |",
    "",
  ].join("\n")
}

export interface HitlVerdict {
  status: string
  at: string
  reason?: string
}

/** 结论表骨架（DRAFT 状态下为空白行；与 buildHitlProposalMarkdown 产出同形） */
export const HITL_VERDICT_TABLE = [
  "| 时间 | 决策 | 原因 |",
  "|------|:----:|------|",
] as const

/** 保证「审批结论」章节存在（历史产物/旧生成器产物补骨架，不改动已有结论行） */
export function ensureHitlVerdictSection(content: string): string {
  if (content.includes(HITL_VERDICT_HEADING)) return content
  return content.trimEnd() + "\n\n" + [HITL_VERDICT_HEADING, "", ...HITL_VERDICT_TABLE, "| | | |", ""].join("\n")
}

/**
 * 把裁决回写进提案：刷新状态行 + 在「审批结论」表写入（或覆盖）一行。
 * 幂等：同一提案重复调用只保留最后一行，不追加重复行。
 */
export function applyHitlDecisionToProposal(content: string, verdict: HitlVerdict): string {
  const withStatus = ensureHitlVerdictSection(content).replace(/(状态:\s*)[A-Z_]+/, `$1${verdict.status}`)
  const row = `| ${verdict.at} | ${verdict.status} | ${escapeCell(verdict.reason ?? "")} |`
  const idx = withStatus.indexOf(HITL_VERDICT_HEADING)
  const freshSection = [HITL_VERDICT_HEADING, "", "| 时间 | 决策 | 原因 |", "|------|:----:|------|", row, ""].join("\n")
  if (idx < 0) {
    // 历史产物（生成器修复前）没有该章节 → 补章节再写行，保证"文件通道"完整
    return withStatus.trimEnd() + "\n\n" + freshSection
  }
  const lines = withStatus.slice(idx).split("\n")
  const headerIdx = lines.findIndex((l) => l.startsWith("| 时间 |"))
  if (headerIdx < 0) return withStatus.slice(0, idx) + freshSection
  // 保留到分隔行，替换全部数据行；其后非表格内容（如追加说明）原样保留
  const kept = lines.slice(headerIdx + 2).filter((l) => !l.trim().startsWith("|"))
  while (kept.length > 0 && kept[0].trim() === "") kept.shift()
  const head = withStatus.slice(0, idx) // 标题/元信息/维度表等「审批结论」之前的内容
  return head + [...lines.slice(0, headerIdx + 2), row, ...(kept.length > 0 ? ["", ...kept] : [])].join("\n")
}
