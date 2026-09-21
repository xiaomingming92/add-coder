import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { PROJECT_ROOT, MAGIC_DIR } from "./env.js"

export const HITL_APPROVAL_WIDGET_MIME = "text/html;profile=mcp-app"
export const HITL_APPROVAL_WIDGET_FILE = "hitl-approval-widget.html"

/**
 * 资源 URI **基名**（不含内容哈希）。
 *
 * [2026-09-21 修复] 宿主把 resource URI 当**缓存键**（官方 MCP Apps 规范：
 * "Treat the resource URI as a cache key. When you make a breaking change to the HTML,
 * JavaScript, or CSS, publish a new URI and update every tool that references it."）。
 * 2026-09-18 改过 widget HTML 但 URI 未变，宿主命中旧缓存 ⇒ 实测 "This app couldn't be loaded"。
 * 现改为**机制化**：最终 URI = 基名 + widget 内容短哈希（`getHitlApprovalWidgetUri()`），
 * 改 HTML/JS/CSS 即自动换 URI，不再依赖人记得手动 bump。
 */
export const HITL_APPROVAL_WIDGET_URI_BASE = "ui://add-coder/hitl-approval"

let cachedUri: string | null = null

/** widget 内容短哈希（sha256 前 8 位）；文件缺失/不可读返回 ""（调用方回退静态基名） */
export function computeWidgetContentHash(): string {
  try {
    const p = join(PROJECT_ROOT, MAGIC_DIR, "templates", HITL_APPROVAL_WIDGET_FILE)
    if (!existsSync(p)) return ""
    return createHash("sha256").update(readFileSync(p)).digest("hex").slice(0, 8)
  } catch {
    return ""
  }
}

/**
 * 资源注册与工具 `_meta.ui.resourceUri` **共用**的 URI（进程内 memoize，保证两处完全一致）。
 * 同一进程内若替换了 widget 文件，需重启 MCP server 才会换 URI（宿主本就要求重启后重读元数据）。
 */
export function getHitlApprovalWidgetUri(): string {
  if (cachedUri) return cachedUri
  const hash = computeWidgetContentHash()
  cachedUri = hash ? `${HITL_APPROVAL_WIDGET_URI_BASE}-${hash}` : HITL_APPROVAL_WIDGET_URI_BASE
  return cachedUri
}

/** 测试专用：清空 memo，使同一进程内可重新计算（生产路径不需要） */
export function resetHitlApprovalWidgetUriCache(): void {
  cachedUri = null
}
