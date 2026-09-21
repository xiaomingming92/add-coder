/*
 * MCP Apps 扩展协商与 instructions 契约用例
 * — Plan add-coder-multi-host-adapter-alignment Task 2.3 / Spec §4–§5
 *
 * 为什么断言"序列化后"的 capabilities：宿主协商读的是 initialize 响应的 JSON，
 * 只断言内存对象会漏掉"字段被 SDK 过滤掉"这类静默失败。
 */
import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  MCP_APPS_EXTENSION_ID,
  SERVER_INSTRUCTIONS,
  SERVER_INSTRUCTIONS_MAX_BYTES,
  SERVER_INSTRUCTIONS_PREFIX_CHARS,
  buildServerOptions,
} from "../templates/core/scripts/mcp-server/shared/server-capabilities.js"
import {
  WIDGET_PROBE_HTML,
  WIDGET_PROBE_MIME,
  WIDGET_PROBE_URI,
} from "../templates/core/scripts/mcp-server/resources/widget-probe.js"

const REPO_ROOT = join(import.meta.dirname, "..")

describe("MCP Apps 扩展协商（Spec §4）", () => {
  it("capabilities 序列化后含扩展键 io.modelcontextprotocol/ui", () => {
    const serialized = JSON.parse(JSON.stringify(buildServerOptions().capabilities))
    expect(Object.keys(serialized.extensions ?? {})).toContain(MCP_APPS_EXTENSION_ID)
  })

  it("保留既有能力声明（tools / resources.subscribe）", () => {
    const { capabilities } = buildServerOptions()
    expect(capabilities.tools).toEqual({})
    expect(capabilities.resources.subscribe).toBe(true)
  })

  it("工具侧 legacy 兼容位仍在（删除会让旧宿主失效）", () => {
    const hitlSource = readFileSync(
      join(REPO_ROOT, "templates/core/scripts/mcp-server/tools/hitl.ts"),
      "utf-8",
    )
    expect(hitlSource).toContain("_meta")
    expect(hitlSource).toContain("resourceUri")
    expect(hitlSource).toContain("openai/outputTemplate")
  })

  it("widget 资源 URI 仍是内容哈希形态（与工具 _meta 共用同一函数）", () => {
    const uiSource = readFileSync(
      join(REPO_ROOT, "templates/core/scripts/mcp-server/shared/hitl-ui.ts"),
      "utf-8",
    )
    expect(uiSource).toContain("ui://add-coder/hitl-approval")
  })
})

describe("server instructions 契约（Spec §5）", () => {
  it(`长度 ≤ ${SERVER_INSTRUCTIONS_MAX_BYTES} 字节（超长会被 Claude Code 截断）`, () => {
    expect(Buffer.byteLength(SERVER_INSTRUCTIONS, "utf-8")).toBeLessThanOrEqual(
      SERVER_INSTRUCTIONS_MAX_BYTES,
    )
  })

  it("前 512 字符自包含（含三个必做 WHEN 的关键工具名）", () => {
    const prefix = SERVER_INSTRUCTIONS.slice(0, SERVER_INSTRUCTIONS_PREFIX_CHARS)
    expect(prefix).toContain("get_project_context")
    expect(prefix).toContain("record_dev_operation")
    expect(prefix).toContain("create_hitl")
  })

  it("含全部六个工具族分区（少一族即失去 WHEN 指引）", () => {
    for (const family of [
      "状态与上下文",
      "Plan-Review 生命周期",
      "HITL 审批",
      "审计",
      "质量门禁",
      "记忆",
    ]) {
      expect(SERVER_INSTRUCTIONS).toContain(family)
    }
  })

  it("不写宿主专有开关名（那属治理文档职责，易过期）", () => {
    expect(SERVER_INSTRUCTIONS).not.toContain("enable_mcp_apps")
    expect(SERVER_INSTRUCTIONS).not.toContain("virtualTools")
  })
})

describe("最小 widget 渲染探针（面板失败隔离实验）", () => {
  it("探针 HTML 零外部资源引用（排除 CDN/CSP 变量）", () => {
    expect(WIDGET_PROBE_HTML).not.toMatch(/src\s*=/i)
    expect(WIDGET_PROBE_HTML).not.toMatch(/href\s*=\s*["']?https?:/i)
    expect(WIDGET_PROBE_HTML).not.toMatch(/@import/i)
    expect(WIDGET_PROBE_HTML).not.toMatch(/https?:\/\//i)
  })

  it("探针含三段判读文案（宿主渲染器 / CSP / 业务 widget 可区分）", () => {
    expect(WIDGET_PROBE_HTML).toContain("内联脚本未执行")
    expect(WIDGET_PROBE_HTML).toContain("内联脚本已执行")
    expect(WIDGET_PROBE_HTML).toContain("脚本异常")
  })

  it("探针资源 URI / MIME 合规（与 HITL widget 同约定）", () => {
    expect(WIDGET_PROBE_URI.startsWith("ui://")).toBe(true)
    expect(WIDGET_PROBE_MIME).toBe("text/html;profile=mcp-app")
  })

  it("探针工具已注册：probe_widget_render 在 READ_TOOLS 且注册函数被调用", () => {
    const toolsIndex = readFileSync(
      join(REPO_ROOT, "templates/core/scripts/mcp-server/tools/index.ts"),
      "utf-8",
    )
    expect(toolsIndex).toContain("registerWidgetProbeTools")
    expect(toolsIndex).toContain('"probe_widget_render"')
    const resourcesIndex = readFileSync(
      join(REPO_ROOT, "templates/core/scripts/mcp-server/resources/index.ts"),
      "utf-8",
    )
    expect(resourcesIndex).toContain("registerWidgetProbeResource")
  })
})
