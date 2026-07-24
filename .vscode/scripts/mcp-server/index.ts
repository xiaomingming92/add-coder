import type { McpServer } from "@modelcontextprotocol/server"
import { registerAllTools } from "./tools/index.js"
import { registerAllResources } from "./resources/index.js"
import { registerAllNotifications } from "./notifications/index.js"
// v2: Sampling/Elicitation 通过 inputRequired 在 handler 内触发，不作为独立能力注册
// v2: Tasks 通过 protocol tasks/create 请求处理

export function registerAll(server: McpServer) {
  registerAllTools(server)
  registerAllResources(server)
  registerAllNotifications(server)
  // Sampling/Elicitation: 导出 builder 函数 (createReviewRequest, elicitHitlConfirm 等)
  //   供 tools handler 内部使用: return createReviewRequest(planKeyword)
  // Tasks: 导出工具函数 (enqueueTask, runTask 等)，在 handler 内调用
}
