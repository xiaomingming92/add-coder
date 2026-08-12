/*
 * @Author       : xiaomingming wujixmm@gmail.com
 * @Date         : 2026-08-10 18:41:34
 * @LastEditors  : xiaomingming wujixmm@gmail.com
 * @LastEditTime : 2026-08-10 18:41:35
 * @FilePath     : /farm-agent/home/xmm/ai/add-coder/templates/core/scripts/mcp-server/shared/redact.ts
 * @Description  : 
 */
// 敏感信息脱敏（进程层并发契约 v2：日志/错误不泄露 DATABASE_URL/密码）
// 统一入口：response.ts 的 textResponse/errorResponse 内部调用，一处封装全覆盖所有工具

const CONNECTION_URL_RE =
  /(postgres(?:ql)?|mysql|redis|mongodb(?:\+srv)?):\/\/[^\s"'`]+/gi

export function redactUrl(url: string): string {
  // postgres://user:pass@host:port/db → postgres://user:****@host:port/db
  return url.replace(/(:\/\/[^:/\s]+:)([^@/\s]+)(@)/, "$1****$3")
}

export function redact(text: string): string {
  return text.replace(CONNECTION_URL_RE, (m) => {
    try {
      return redactUrl(m)
    } catch {
      return m
    }
  })
}
