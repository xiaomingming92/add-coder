import { z } from "zod"
import type { ToolRegistrar } from "./registrar.js"
import { WIDGET_PROBE_MIME, WIDGET_PROBE_URI } from "../resources/widget-probe.js"

/**
 * `probe_widget_render` —— 调用即在宿主里触发一次最小 widget 渲染（诊断用，2026-09-21 引入）。
 *
 * 判读方式（见 `resources/widget-probe.ts` 的说明）：
 *   · 面板显示「HTML 已加载（内联脚本未执行）」 ⇒ 宿主默认 CSP 拦 inline script（需在资源 `_meta.ui.csp` 声明）
 *   · 面板显示「内联脚本已执行」           ⇒ 宿主能渲染 app，问题出在业务 widget 的实现（握手/DOM/数据注入）
 *   · 面板仍报 couldn't be loaded          ⇒ 宿主渲染器本身的问题（提上游）
 */
export function registerWidgetProbeTools(server: ToolRegistrar) {
  server.registerTool(
    "probe_widget_render",
    {
      title: "Widget 渲染探针",
      description:
        "渲染一个最小 MCP Apps widget 以定位面板加载失败（诊断用）：区分宿主渲染器故障、宿主 CSP 拦截内联脚本、业务 widget 自身缺陷。只读，不改任何状态。",
      inputSchema: z.object({}),
      outputSchema: z.object({
        probeUri: z.string(),
        mimeType: z.string(),
        hint: z.string(),
      }),
      annotations: { readOnlyHint: true },
      _meta: {
        ui: { resourceUri: WIDGET_PROBE_URI },
        "openai/outputTemplate": WIDGET_PROBE_URI,
        "openai/toolInvocation/invoking": "正在渲染最小 widget 探针…",
        "openai/toolInvocation/invoked": "最小 widget 探针已渲染",
      },
    },
    async () => ({
      content: [
        {
          type: "text" as const,
          text: [
            `已请求渲染最小探针 widget：${WIDGET_PROBE_URI}`,
            "判读：面板显示「内联脚本已执行」= 宿主可渲染 app（问题在业务 widget）",
            "     面板显示「HTML 已加载（内联脚本未执行）」= 宿主 CSP 拦截 inline script",
            "     面板报 couldn't be loaded = 宿主渲染器问题（提上游）",
          ].join("\n"),
        },
      ],
      structuredContent: {
        probeUri: WIDGET_PROBE_URI,
        mimeType: WIDGET_PROBE_MIME,
        hint: "见 content 中的三段判读",
      },
    }),
  )
}
