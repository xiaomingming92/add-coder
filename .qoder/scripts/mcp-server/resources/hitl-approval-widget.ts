import type { McpServer } from "@modelcontextprotocol/server"
import { existsSync, readFileSync } from "fs"
import { join } from "path"
import { PROJECT_ROOT, MAGIC_DIR } from "../shared/fs.js"
import {
  HITL_APPROVAL_WIDGET_FILE,
  HITL_APPROVAL_WIDGET_MIME,
  getHitlApprovalWidgetUri,
} from "../shared/hitl-ui.js"

export function registerHitlApprovalWidgetResource(server: McpServer) {
  // [2026-09-21 修复] 与工具 `_meta.ui.resourceUri` 共用同一函数（基名 + 内容哈希），保证两处严格一致
  const WIDGET_URI = getHitlApprovalWidgetUri()
  server.registerResource(
    "hitl-approval-widget",
    WIDGET_URI,
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
