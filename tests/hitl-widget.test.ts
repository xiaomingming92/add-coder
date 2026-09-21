import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import type { ToolRegistrar } from "../templates/core/scripts/mcp-server/tools/registrar.js"

const runtime = vi.hoisted(() => ({ root: "" }))
const prismaMock = vi.hoisted(() => ({
  hitlRecord: { findMany: vi.fn<(args: Record<string, unknown>) => Promise<unknown[]>>() },
}))

vi.mock("../templates/core/scripts/mcp-server/shared/prisma.js", () => ({
  prisma: prismaMock,
}))

vi.mock("../templates/core/scripts/mcp-server/shared/env.js", () => ({
  PROJECT_ROOT: runtime.root,
  PROJECT_ID: "hitl-widget-test",
  MAGIC_DIR: ".codex",
  DATABASE_URL: "postgresql://test.invalid/add_coder",
  getRuntimeContext: () => ({
    projectRoot: runtime.root,
    projectKey: "project-scope",
    adapterKey: "codex",
    magicDir: ".codex",
    contextId: "project-scope:codex",
  }),
}))

type ToolRegistration = {
  config: Record<string, unknown>
  callback: (args: Record<string, unknown>, context: Record<string, unknown>) => Promise<Record<string, unknown>>
}

function hitlRow(status = "DRAFT") {
  const now = new Date()
  return {
    id: "hitl-1",
    projectKey: "project-scope",
    adapterKey: "codex",
    planName: "widget-plan-v1",
    round: 3,
    type: "PLAN",
    status,
    approvedAt: null,
    rejectedAt: null,
    rejectReason: null,
    createdAt: now,
    updatedAt: now,
  }
}

function writeProposal(root: string) {
  const now = new Date()
  const dir = join(
    root,
    ".codex",
    "plans",
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
    String(now.getDate()).padStart(2, "0"),
  )
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, "widget-plan-v1.hitl.md"), [
    "# HITL",
    "",
    "状态: DRAFT",
    "",
    "| # | 维度 | 方案内容 | 决策 |",
    "|---|------|----------|:----:|",
    "| 1 | 数据边界 | scoped DB | 同意/调整 |",
    "| 2 | UI 协议 | MCP Apps | 同意/调整 |",
  ].join("\n"), "utf-8")
}

describe("HITL core widget + Codex MCP Apps", () => {
  beforeEach(() => {
    if (!runtime.root) runtime.root = join(tmpdir(), `add-coder-hitl-widget-${process.pid}`)
    rmSync(runtime.root, { recursive: true, force: true })
    mkdirSync(runtime.root, { recursive: true })
    vi.clearAllMocks()
    /*
     * [2026-09-21] widget URI 在进程内 memoize（生产语义：同一进程内 URI 稳定，改文件需重启）。
     * 测试里每个用例都要基于"当前 temp root 的 widget 文件是否存在"重新求值 ⇒ 每例前清缓存。
     */
    return import("../templates/core/scripts/mcp-server/shared/hitl-ui.js").then((m) => {
      m.resetHitlApprovalWidgetUriCache()
    })
  })

  afterEach(() => {
    rmSync(runtime.root, { recursive: true, force: true })
  })

  it("Codex strategy selects MCP Apps while Qoder keeps genui", async () => {
    const { HITL_INTERACTION_CONFIG } = await import(
      "../templates/core/scripts/mcp-server/shared/hitl-interaction.strategy.js"
    )
    expect(HITL_INTERACTION_CONFIG.codex.mode).toBe("mcpApps")
    expect(HITL_INTERACTION_CONFIG.qoder.mode).toBe("genui")
  })

  it("render tool is read-only, scoped, and returns proposal structuredContent", async () => {
    writeProposal(runtime.root)
    prismaMock.hitlRecord.findMany.mockResolvedValue([hitlRow()])

    const tools = new Map<string, ToolRegistration>()
    const registrar = {
      registerTool(name: string, config: Record<string, unknown>, callback: ToolRegistration["callback"]) {
        tools.set(name, { config, callback })
        return {}
      },
    } as unknown as ToolRegistrar
    const { registerHitlTools } = await import(
      "../templates/core/scripts/mcp-server/tools/hitl.js"
    )
    registerHitlTools(registrar)

    const render = tools.get("render_hitl_approval")
    expect(render?.config).toMatchObject({
      annotations: { readOnlyHint: true },
      _meta: {
        // [2026-09-21] URI = 基名 + widget 内容哈希（宿主把 URI 当缓存键）；本用例未落 widget 文件 ⇒ 回退基名
        ui: { resourceUri: expect.stringMatching(/^ui:\/\/add-coder\/hitl-approval(-[0-9a-f]{8})?$/) },
        "openai/outputTemplate": expect.stringMatching(/^ui:\/\/add-coder\/hitl-approval(-[0-9a-f]{8})?$/),
      },
    })
    const result = await render!.callback({ planName: "widget-plan-v1", type: "PLAN" }, {})
    const query = prismaMock.hitlRecord.findMany.mock.calls[0]?.[0]
    expect(query?.where).toMatchObject({
      projectKey: "project-scope",
      adapterKey: "codex",
      planName: "widget-plan-v1",
    })
    expect(result.structuredContent).toMatchObject({
      planName: "widget-plan-v1",
      round: 3,
      status: "DRAFT",
      dimensions: [
        { name: "数据边界", content: "scoped DB" },
        { name: "UI 协议", content: "MCP Apps" },
      ],
    })
    /*
     * 渲染入口必须在**结果**上也带 _meta（2026-09-14 修复"widget 不显示"）：
     * 客户端读 result._meta["openai/outputTemplate"] / ui.resourceUri 才知道挂哪个 widget；
     * 只挂声明不挂结果 → 客户端只显示 JSON（此前线上表现）。
     */
    expect(result._meta).toMatchObject({
      ui: { resourceUri: expect.stringMatching(/^ui:\/\/add-coder\/hitl-approval(-[0-9a-f]{8})?$/) },
      "openai/outputTemplate": expect.stringMatching(/^ui:\/\/add-coder\/hitl-approval(-[0-9a-f]{8})?$/),
    })
    expect(prismaMock.hitlRecord.findMany).toHaveBeenCalledTimes(1)
  })

  it("registers the same core HTML as an MCP Apps resource", async () => {
    const widgetSource = readFileSync(
      join(process.cwd(), "templates/core/templates/hitl-approval-widget.html"),
      "utf-8",
    )
    const generatedTemplateDir = join(runtime.root, ".codex", "templates")
    mkdirSync(generatedTemplateDir, { recursive: true })
    writeFileSync(join(generatedTemplateDir, "hitl-approval-widget.html"), widgetSource, "utf-8")

    let registration: {
      uri: string
      config: Record<string, unknown>
      callback: (uri: URL) => Promise<Record<string, unknown>>
    } | undefined
    const fakeServer = {
      registerResource(_name: string, uri: string, config: Record<string, unknown>, callback: (uri: URL) => Promise<Record<string, unknown>>) {
        registration = { uri, config, callback }
      },
    }
    const { registerHitlApprovalWidgetResource } = await import(
      "../templates/core/scripts/mcp-server/resources/hitl-approval-widget.js"
    )
    registerHitlApprovalWidgetResource(fakeServer as never)

    // [2026-09-21] 资源 URI 现由「基名 + widget 内容哈希」构成（写入文件后必然带哈希）
    const widgetUri = registration!.uri
    expect(widgetUri).toMatch(/^ui:\/\/add-coder\/hitl-approval-[0-9a-f]{8}$/)
    expect(registration).toMatchObject({
      config: { mimeType: "text/html;profile=mcp-app" },
    })
    const result = await registration!.callback(new URL(widgetUri))
    expect(result).toEqual({
      contents: [{
        uri: widgetUri,
        mimeType: "text/html;profile=mcp-app",
        text: widgetSource,
      }],
    })
  })

  /*
   * [2026-09-21 修复回归] 官方 MCP Apps 规范：「Treat the resource URI as a cache key. When you make
   * a breaking change to the HTML, JavaScript, or CSS, publish a new URI and update every tool that
   * references it.」—— 2026-09-18 改 widget HTML 未换 URI，宿主命中旧缓存 ⇒ 实测 "This app couldn't
   * be loaded"。本用例把该规则机器化：内容变 ⇒ URI 必变；文件缺失 ⇒ 回退基名（不阻断注册）。
   */
  it("bumps the widget resource URI when content changes (cache-key rule)", async () => {
    const {
      getHitlApprovalWidgetUri,
      resetHitlApprovalWidgetUriCache,
      computeWidgetContentHash,
      HITL_APPROVAL_WIDGET_URI_BASE,
    } = await import("../templates/core/scripts/mcp-server/shared/hitl-ui.js")

    const widgetDir = join(runtime.root, ".codex", "templates")
    mkdirSync(widgetDir, { recursive: true })
    const widgetPath = join(widgetDir, "hitl-approval-widget.html")

    writeFileSync(widgetPath, "<html><body>v1</body></html>", "utf-8")
    resetHitlApprovalWidgetUriCache()
    const uriV1 = getHitlApprovalWidgetUri()
    expect(uriV1).toBe(`${HITL_APPROVAL_WIDGET_URI_BASE}-${computeWidgetContentHash()}`)
    expect(uriV1).toMatch(new RegExp(`^${HITL_APPROVAL_WIDGET_URI_BASE}-[0-9a-f]{8}$`))

    // 内容变更（等价于"改 HTML 没 bump URI"的老做法）⇒ 新 URI 自动生成
    writeFileSync(widgetPath, "<html><body>v2-changed</body></html>", "utf-8")
    resetHitlApprovalWidgetUriCache()
    const uriV2 = getHitlApprovalWidgetUri()
    expect(uriV2).not.toBe(uriV1)

    // 工具 _meta 与资源注册共用同一函数 ⇒ 工具声明同步指向新 URI
    const tools = new Map<string, ToolRegistration>()
    const registrar = {
      registerTool(name: string, config: Record<string, unknown>, callback: ToolRegistration["callback"]) {
        tools.set(name, { config, callback })
        return {}
      },
    } as unknown as ToolRegistrar
    const { registerHitlTools } = await import(
      "../templates/core/scripts/mcp-server/tools/hitl.js"
    )
    registerHitlTools(registrar)
    expect(tools.get("render_hitl_approval")?.config).toMatchObject({
      _meta: { ui: { resourceUri: uriV2 }, "openai/outputTemplate": uriV2 },
    })

    // 文件缺失 ⇒ 回退基名（fail-open，不阻断资源注册）
    rmSync(widgetPath, { force: true })
    resetHitlApprovalWidgetUriCache()
    expect(getHitlApprovalWidgetUri()).toBe(HITL_APPROVAL_WIDGET_URI_BASE)
  })

  it("keeps the table scrollable, binds CSP-safe controls, and falls back through Codex follow-up", () => {
    const html = readFileSync(
      join(process.cwd(), "templates/core/templates/hitl-approval-widget.html"),
      "utf-8",
    )
    expect(html).toMatch(/\.table-wrap\s*\{[\s\S]*overflow:auto/)
    expect(html).toMatch(/thead\s*\{[\s\S]*position:sticky/)
    expect(html).toMatch(/\.footer\s*\{[\s\S]*position:sticky/)
    expect(html).toContain("postRpc('tools/call', { name:'update_hitl'")
    expect(html).toContain("window.openai.callTool('update_hitl', args)")
    expect(html).toContain("window.openai.sendFollowUpMessage")
    expect(html).toContain("请立即调用 update_hitl")
    expect(html).toContain("window.sendToAgent")
    expect(html).toContain("min-height:620px")
    expect(html).toContain("document.getElementById('tbody').addEventListener('click'")
    expect(html).toContain("document.getElementById('tbody').addEventListener('input'")
    expect(html).toContain("document.getElementById('btn_tongyi').addEventListener('click'")
    expect(html).toContain("event.preventDefault()")
    expect(html).toContain("event.stopPropagation()")
    const rowControlBlock = html.slice(
      html.indexOf("document.getElementById('tbody').addEventListener('click'"),
      html.indexOf("document.getElementById('btn_tongyi').addEventListener('click'"),
    )
    expect(rowControlBlock).not.toContain("callUpdateHitl")
    expect(rowControlBlock).not.toContain("sendCodexFollowUp")
    expect(html).not.toMatch(/\son(?:click|input)=/)
    expect(html).not.toMatch(/sendToAgent\(payload,\s*\{\s*submit:\s*true\s*\}\)/)
  })
})
