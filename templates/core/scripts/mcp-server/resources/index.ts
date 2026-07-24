import type { McpServer } from "@modelcontextprotocol/server"
import { registerAddStateResources } from "./add-state.js"
import { registerRoundTaskResources } from "./round-task.js"
import { registerVersionResource } from "./add-coder-version.js"
import { registerHookEventResources } from "./hook-events-report.js"

export function registerAllResources(server: McpServer) {
  registerAddStateResources(server)
  registerRoundTaskResources(server)
  registerVersionResource(server)
  registerHookEventResources(server)  // 2 resources: hook-events/{daily,weekly}
}
