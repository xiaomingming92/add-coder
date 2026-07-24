import type { McpServer } from "@modelcontextprotocol/server"
import { registerHitlNotifications } from "./hitl.js"
import { registerHookNotifications } from "./hook.js"

export function registerAllNotifications(server: McpServer) {
  registerHitlNotifications(server)
  registerHookNotifications(server)
}
