import type { McpServer } from "@modelcontextprotocol/server"
import { registerAddStateResources } from "./add-state.js"
import { registerRoundTaskResources } from "./round-task.js"
import { registerVersionResource } from "./add-coder-version.js"
import { registerHookEventResources } from "./hook-events-report.js"
import { registerHitlApprovalWidgetResource } from "./hitl-approval-widget.js"
import { registerWidgetProbeResource } from "./widget-probe.js"

export function registerAllResources(server: McpServer) {
  registerAddStateResources(server)
  registerRoundTaskResources(server)
  registerVersionResource(server)
  registerHookEventResources(server)  // 2 resources: hook-events/{daily,weekly}
  registerHitlApprovalWidgetResource(server)
  registerWidgetProbeResource(server)  // 1 resource: 最小 MCP Apps 渲染探针（诊断用）
}
