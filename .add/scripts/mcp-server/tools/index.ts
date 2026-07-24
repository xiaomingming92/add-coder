import type { McpServer } from "@modelcontextprotocol/server"
import { registerContextTools } from "./context.js"
import { registerAuditTools } from "./audit.js"
import { registerDocsTools } from "./docs.js"
import { registerQualityTools } from "./quality.js"
import { registerGatewayTools } from "./gateway.js"
import { registerHookEventTools } from "./hook-event-report.js"

export function registerAllTools(server: McpServer) {
  registerContextTools(server)    // 5 tools
  registerAuditTools(server)      // 2 tools
  registerDocsTools(server)       // 1 tool
  registerQualityTools(server)    // 4 tools
  registerGatewayTools(server)    // 5 tools
  registerHookEventTools(server)  // 1 tool: get_hook_events
  // Total: 18 tools
}
