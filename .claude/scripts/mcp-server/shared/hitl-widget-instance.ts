/*
 * HITL 审批实例 HTML（Plan hitl-widget-runtime-gap §WidgetInstance / §RenderFallback）
 *
 * 为什么需要：MCP Apps 类客户端（Codex）才渲染 widget；其余环境（Qoder/弹框/无 UI）下
 * 审批必须仍有确定性入口。本模块把 core widget 模板 + 本次提案的维度数据落成一份**可直接打开**的
 * 实例 HTML（文件面板/浏览器均可），并把路径回给调用方（render_hitl_approval 的 fallback）。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

export const HITL_INSTANCE_DIR = "hitl"

export interface HitlInstanceInput {
  planName: string
  type: string
  round: number
  status: string
  dimensions: { name: string; content: string }[]
  templateHtml: string
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/** 生成实例 HTML：在模板 </body> 前注入 JSON 载荷 + 人类可读维度表（模板无占位符，故用注入而非替换） */
export function buildHitlInstanceHtml(input: HitlInstanceInput): string {
  const payload = {
    planName: input.planName,
    type: input.type,
    round: input.round,
    status: input.status,
    dimensions: input.dimensions,
  }
  const rows = input.dimensions
    .map(
      (d, i) =>
        `<tr><td>${i + 1}</td><td>${escapeHtml(d.name)}</td><td>${escapeHtml(d.content)}</td><td>同意 / 驳回</td></tr>`,
    )
    .join("")
  const injected = [
    `<script id="hitl-instance-payload" type="application/json">${JSON.stringify(payload).replace(/</g, "\\u003c")}</script>`,
    `<section id="hitl-fallback-panel" data-plan="${escapeHtml(input.planName)}" data-round="${input.round}">`,
    `<h2>HITL 审批（${escapeHtml(input.planName)} · ${escapeHtml(input.type)} round ${input.round}）</h2>`,
    `<p>状态：${escapeHtml(input.status)} · 共 ${input.dimensions.length} 个维度。逐项确认后，把裁决结果告知 AI 即可落库（本页面为只读降级入口，不直接改库）。</p>`,
    `<table><thead><tr><th>#</th><th>维度</th><th>方案内容</th><th>决策</th></tr></thead><tbody>${rows}</tbody></table>`,
    `</section>`,
  ].join("\n")

  const bodyClose = input.templateHtml.match(/<\/body>/i)
  if (bodyClose && bodyClose.index !== undefined) {
    return (
      input.templateHtml.slice(0, bodyClose.index) + injected + "\n" + input.templateHtml.slice(bodyClose.index)
    )
  }
  return `${input.templateHtml}\n${injected}\n`
}

export interface WriteHitlInstanceResult {
  htmlPath: string
  created: boolean
}

/**
 * 落盘实例 HTML（幂等：同 plan+round 覆盖写）。
 * 模板缺失 → 抛明确错误（禁止静默返回空 HTML）。
 */
export function writeHitlInstanceHtml(
  input: Omit<HitlInstanceInput, "templateHtml"> & { projectRoot: string; magicDir: string },
): WriteHitlInstanceResult {
  const templatePath = join(input.projectRoot, input.magicDir, "templates", "hitl-approval-widget.html")
  if (!existsSync(templatePath)) {
    throw new Error(`HITL widget 模板缺失: ${templatePath}（请执行 add-coder sync）`)
  }
  const dir = join(input.projectRoot, input.magicDir, HITL_INSTANCE_DIR)
  mkdirSync(dir, { recursive: true })
  const htmlPath = join(dir, `${input.planName}-round${input.round}.html`)
  const html = buildHitlInstanceHtml({ ...input, templateHtml: readFileSync(templatePath, "utf-8") })
  writeFileSync(htmlPath, html, "utf-8")
  return { htmlPath, created: true }
}
