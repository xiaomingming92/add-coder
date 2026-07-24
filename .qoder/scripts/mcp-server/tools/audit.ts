import * as z from "zod/v4"
import type { McpServer } from "@modelcontextprotocol/server"
import { textResponse, errorResponse } from "../shared/response.js"
import { prisma } from "../shared/prisma.js"

export function registerAuditTools(server: McpServer) {

  // ===== query_audit_logs (L992-1109) =====
  server.registerTool("query_audit_logs", {
    description: "稀疏查询开发操作审计日志（DevOperation 表，MCP-5 稀疏推理恢复）。支持多维度检索，AI 可在不同对话会话中通过任意维度组合查询之前的开发操作记录，实现跨会话的上下文恢复。\n\n典型用法:\n- query_audit_logs({ targetType: \"API_ROUTE\" }) — 查所有 API 路由改动\n- query_audit_logs({ targetId: \"src/app/api/knowledge/route.ts\" }) — 查特定文件改动\n- query_audit_logs({ keyword: \"pagination\" }) — 按关键词搜索\n- query_audit_logs({ planKeyword: \"add-coder\" }) — 按 Plan 关键词查该 Plan 下所有 devlog\n- query_audit_logs({}) — 查最近的记录（session-init 会话恢复）",
    inputSchema: z.object({
      targetType: z.string().optional().describe("按目标类型精确过滤"),
      action: z.string().optional().describe("按操作类型精确过滤"),
      targetId: z.string().optional().describe("按目标标识精确过滤"),
      planKeyword: z.string().optional().describe("按 Plan 关键词过滤"),
      keyword: z.string().optional().describe("关键词搜索"),
      sinceMinutes: z.number().optional().describe("时间窗口起始（分钟前）"),
      limit: z.number().optional().default(20).describe("返回最大条数，默认 20，最大 100"),
    }),
  }, async (args: Record<string, string | number | undefined>, _ctx: unknown) => {
    try {
      const { targetType, action, targetId, planKeyword, keyword, sinceMinutes, limit = 20 } = args
      const where: Record<string, unknown> = {}
      if (sinceMinutes !== undefined) where.createdAt = { gte: new Date(Date.now() - sinceMinutes * 60 * 1000) }
      if (targetType) where.targetType = targetType; if (action) where.action = action; if (targetId) where.targetId = targetId; if (planKeyword) where.planKeyword = planKeyword
      if (keyword) where.OR = [{ action: { contains: keyword, mode: "insensitive" } },{ targetType: { contains: keyword, mode: "insensitive" } },{ targetId: { contains: keyword, mode: "insensitive" } },{ reason: { contains: keyword, mode: "insensitive" } },{ planKeyword: { contains: keyword, mode: "insensitive" } }]
      const logs = await prisma.devOperation.findMany({ where, orderBy: { createdAt: "desc" }, take: Math.min(limit, 100), include: { user: { select: { username: true } } } })
      if (logs.length === 0) {
        const f: string[] = []; if (targetType) f.push(`targetType=${targetType}`); if (action) f.push(`action=${action}`); if (targetId) f.push(`targetId=${targetId}`); if (planKeyword) f.push(`planKeyword=${planKeyword}`); if (keyword) f.push(`keyword="${keyword}"`); if (sinceMinutes !== undefined) f.push(`sinceMinutes=${sinceMinutes}`)
        return textResponse(`=== 开发操作审计日志 ===\n\n未找到匹配的审计记录（条件: ${f.length > 0 ? f.join(", ") : "无条件"}）。\n\n可能原因: 数据库未运行、尚无相关开发操作记录、或 filter 过于严格。`)
      }
      const fl: string[] = []; if (targetType) fl.push(`targetType=${targetType}`); if (action) fl.push(`action=${action}`); if (targetId) fl.push(`targetId=${targetId}`); if (planKeyword) fl.push(`planKeyword=${planKeyword}`); if (keyword) fl.push(`keyword="${keyword}"`); if (sinceMinutes !== undefined) fl.push(`最近${sinceMinutes}分钟`)
      const lines = [`=== 开发操作审计日志 (条件: ${fl.length > 0 ? fl.join(", ") : "无过滤条件（最近全部）"}) ===`, `共 ${logs.length} 条记录`]
      for (let i = 0; i < logs.length; i++) {
        const l = logs[i]; lines.push(`[${i+1}] ${l.createdAt.toISOString()}`, `    action: ${l.action} | targetType: ${l.targetType} | targetId: ${l.targetId || "(无)"}`)
        if (l.reason) lines.push(`    reason: ${l.reason}`); if (l.planKeyword) lines.push(`    planKeyword: ${l.planKeyword}`)
      }
      if (planKeyword) { lines.push("=== Plan 分组 ===", `planKeyword=${planKeyword} 的操作链:`); for (const l of logs) lines.push(`  ${l.createdAt.toISOString().slice(11,19)} ${l.action}`) }
      lines.push("", "=== 稀疏推理建议 ===", "基于以上审计日志，可以恢复开发上下文。")
      return textResponse(lines.join("\n"))
    } catch (error) { return errorResponse(`查询审计日志失败: ${error instanceof Error ? error.message : String(error)}\n可能原因: 数据库未运行或 AuditLog 表不存在。`) }
  })

  // ===== record_dev_operation (L1111-1212) =====
  server.registerTool("record_dev_operation", {
    description: "记录一次开发操作到 DevOperation 表（ADD-7）。AI 助手在对代码进行任何修改/创建/删除操作后，必须调用此工具记录操作审计。\n\n**targetId 路径格式（强制）**：必须使用相对于 workspace 根目录的路径，禁止绝对路径。\n- ✅ src/middleware.ts\n- ✅ ${MAGIC_DIR}/plans/xxx.md\n- ❌ /absolute/path/to/src/middleware.ts",
    inputSchema: z.object({
      action: z.string().describe("操作类型: 'MODIFY', 'CREATE', 'DELETE', 'DOC_UPDATED', 'DOC_CREATED' 等"),
      targetType: z.string().describe("目标类型: 'API_ROUTE', 'COMPONENT', 'SCHEMA', 'RULE', 'DOC', 'PLAN', 'SPEC', 'SKILL', 'AGENT' 等"),
      targetId: z.string().optional().describe("目标标识（相对路径）"),
      planKeyword: z.string().optional().describe("关联 Plan 的关键词"),
      beforeState: z.string().optional().describe("操作前的状态（JSON 字符串）"),
      afterState: z.string().optional().describe("操作后的状态（JSON 字符串）"),
      reason: z.string().optional().describe("操作原因"),
    }),
  }, async (args: Record<string, string | number | undefined>, _ctx: unknown) => {
    try {
      const { action, targetType, targetId, planKeyword, beforeState, afterState, reason } = args
      const pathWarnings: string[] = []
      if (targetId && (targetId.startsWith("/") || /^[A-Z]:\\/.test(targetId))) pathWarnings.push(`⚠️ targetId 使用了绝对路径: "${targetId}"。请使用相对路径。`)
      let parsedBefore: unknown, parsedAfter: unknown
      try { if (beforeState) parsedBefore = JSON.parse(beforeState); if (afterState) parsedAfter = JSON.parse(afterState) } catch { return errorResponse("beforeState/afterState 必须是有效的 JSON 字符串。") }
      let systemUser = await (prisma.addUser as Record<string, (...a: unknown[]) => unknown>).findUnique({ where: { username: "ai-assistant" }, select: { id: true } })
      if (!systemUser) systemUser = await (prisma.addUser as Record<string, (...a: unknown[]) => unknown>).create({ data: { id: "ai-assistant", username: "ai-assistant", email: "ai-assistant@internal" }, select: { id: true } })
      const log = await (prisma.devOperation as Record<string, (...a: unknown[]) => unknown>).create({ data: { userId: systemUser.id, planKeyword: planKeyword || "unknown", action, targetType, targetId: targetId || "unknown", beforeState: parsedBefore ?? null, afterState: parsedAfter ?? null, reason: reason || null } })
      const lines = [`✅ 开发操作已记录`, `  ID: ${log.id}`, `  action: ${action}`, `  targetType: ${targetType}`, `  targetId: ${targetId || "unknown"}`, `  planKeyword: ${planKeyword || "unknown"}`, `  createdAt: ${log.createdAt.toISOString()}`]
      if (pathWarnings.length > 0) { lines.push(""); lines.push(...pathWarnings) }
      lines.push("", `📋 落库回查（必须执行）:`, targetId ? `  query_audit_logs({ targetId: "${targetId}" }) — 确认本条记录已写入` : "")
      return textResponse(lines.join("\n"))
    } catch (error) { return errorResponse(`记录开发操作失败: ${error instanceof Error ? error.message : String(error)}`) }
  })

}
