import type { McpServer } from "@modelcontextprotocol/server"
import { existsSync, readFileSync } from "fs"
import { join } from "path"
import { PROJECT_ROOT, MAGIC_DIR } from "../shared/fs.js"
import {
  HITL_APPROVAL_WIDGET_FILE,
  HITL_APPROVAL_WIDGET_MIME,
  HITL_APPROVAL_WIDGET_URI,
} from "../shared/hitl-ui.js"

export function registerHitlApprovalWidgetResource(server: McpServer) {
  server.registerResource(
    "hitl-approval-widget",
    HITL_APPROVAL_WIDGET_URI,
    {
      title: "ADD HITL Approval",
      description: "逐项审核 ADD HITL 提案的 core 标准 widget",
      mimeType: HITL_APPROVAL_WIDGET_MIME,
    },
    (uri) => {
      const widgetPath = join(PROJECT_ROOT, MAGIC_DIR, "templates", HITL_APPROVAL_WIDGET_FILE)
      if (!existsSync(widgetPath)) {
        throw new Error(`HITL widget 缺失: ${widgetPath}。请重新执行 add-coder sync。`)
      }
      return {
        contents: [{
          uri: uri.href,
          mimeType: HITL_APPROVAL_WIDGET_MIME,
          text: readFileSync(widgetPath, "utf-8"),
        }],
      }
    },
  )
}
