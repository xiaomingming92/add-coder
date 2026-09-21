import type { McpServer } from "@modelcontextprotocol/server"

/**
 * 最小 MCP Apps 渲染探针（诊断用，2026-09-21 引入）。
 *
 * 背景：Codex 桌面端对 HITL 审批 widget 报 "This app couldn't be loaded"，而按 MCP 协议直连 server 的探针
 * 证明 `resources/read` 能取到 widget（15128 字符、`text/html;profile=mcp-app`）——失败在宿主渲染阶段。
 * 为把「宿主加载不了任何 app」与「我们 widget 自身有问题」分开，注册本资源：
 *   · 无任何外部资源引用（无 script src / link / @import）
 *   · 内联脚本只有 10 行、全程 try/catch，**不查任何业务 DOM id**，不外抛异常
 *   · 页面文案会随加载阶段变化，观察文案即可定位：HTML 已加载（脚本未执行）/ 内联脚本已执行 / 脚本异常
 * 配套工具 `probe_widget_render` 携带 `_meta.ui.resourceUri` 指向本资源，调用即触发宿主渲染。
 */
export const WIDGET_PROBE_URI = "ui://add-coder/widget-probe-minimal"
export const WIDGET_PROBE_MIME = "text/html;profile=mcp-app"

export const WIDGET_PROBE_HTML = [
  "<!DOCTYPE html>",
  '<html lang="zh-CN">',
  "<head>",
  '<meta charset="utf-8">',
  "<title>ADD widget probe</title>",
  "<style>body{font:14px/1.6 system-ui,sans-serif;margin:0;padding:12px}</style>",
  "</head>",
  "<body>",
  '<div id="probe-msg">ADD widget probe: HTML 已加载（内联脚本未执行 ⇒ 疑似 CSP 拦截）</div>',
  "<script>",
  "try {",
  '  var m = document.getElementById("probe-msg");',
  '  m.textContent = "ADD widget probe: 内联脚本已执行";',
  '  window.parent.postMessage({ jsonrpc: "2.0", id: 1, method: "ui/initialize", params: { protocolVersion: "2026-07-28" } }, "*");',
  "} catch (e) {",
  '  document.getElementById("probe-msg").textContent = "ADD widget probe: 脚本异常 " + e;',
  "}",
  "</script>",
  "</body>",
  "</html>",
].join("\n")

export function registerWidgetProbeResource(server: McpServer) {
  server.registerResource(
    "widget-probe-minimal",
    WIDGET_PROBE_URI,
    {
      title: "ADD Widget Render Probe",
      description: "最小 MCP Apps 渲染探针：区分「宿主加载不了任何 app」与「业务 widget 自身有问题」",
      mimeType: WIDGET_PROBE_MIME,
    },
    (uri) => ({
      contents: [{ uri: uri.href, mimeType: WIDGET_PROBE_MIME, text: WIDGET_PROBE_HTML }],
    }),
  )
}
