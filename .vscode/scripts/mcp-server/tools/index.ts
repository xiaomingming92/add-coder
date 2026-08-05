import type { McpServer } from "@modelcontextprotocol/server"
import { registerContextTools } from "./context.js"
import { registerAuditTools } from "./audit.js"
import { registerContractTools } from "./contract.js"
import { registerDocsTools } from "./docs.js"
import { registerQualityTools } from "./quality.js"
import { registerGatewayTools } from "./gateway/index.js"
import { registerHookEventTools } from "./hook-event-report.js"
import { registerHitlTools } from "./hitl.js"
import { registerPlanTools } from "./plan.js"
import { registerReviewTools } from "./review.js"

export function registerAllTools(server: McpServer) {
  registerContextTools(server)    // 5 tools
  registerAuditTools(server)      // 2 tools
  registerContractTools(server)   // 2 tools: contract_track / contract_status
  registerDocsTools(server)       // 1 tool
  registerQualityTools(server)    // 4 tools
  registerGatewayTools(server)    // 5 tools
  registerHookEventTools(server)  // 1 tool: get_hook_events
  registerHitlTools(server)       // 3 tools: create_hitl / update_hitl / status_hitl
  registerPlanTools(server)       // 3 tools: plan_track / plan_status / plan_sync
  registerReviewTools(server)     // 3 tools: review_track / review_status / review_sync
  // Total: 29 tools
}
