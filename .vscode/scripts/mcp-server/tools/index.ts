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
import { PROJECT_ID } from "../shared/env.js"
import type { ToolRegistrar } from "./registrar.js"

export function registerAllTools(server: McpServer) {
  // D9 多 MCP 路由安全：派生装饰版 registrar，为所有工具 description 注入项目身份前缀
  const origRegister = server.registerTool.bind(server)
  type RegisterTool = ToolRegistrar["registerTool"]
  type ToolConfig = Parameters<RegisterTool>[1]
  type ToolCb = Parameters<RegisterTool>[2]
  const registerTool = ((name: string, config: ToolConfig, cb: ToolCb) => {
    const c = config as { description?: string }
    return origRegister(
      name,
      { ...config, description: `[项目: ${PROJECT_ID}] ${c.description ?? ""}` },
      cb,
    )
  }) as RegisterTool
  const registrar: ToolRegistrar = { registerTool }

  registerContextTools(registrar)    // 5 tools
  registerAuditTools(registrar)      // 2 tools
  registerContractTools(registrar)   // 2 tools: contract_track / contract_status
  registerDocsTools(registrar)       // 1 tool
  registerQualityTools(registrar)    // 4 tools
  registerGatewayTools(registrar)    // 5 tools
  registerHookEventTools(registrar)  // 1 tool: get_hook_events
  registerHitlTools(registrar)       // 3 tools: create_hitl / update_hitl / status_hitl
  registerPlanTools(registrar)       // 3 tools: plan_track / plan_status / plan_sync
  registerReviewTools(registrar)     // 3 tools: review_track / review_status / review_sync
  // Total: 29 tools
}
