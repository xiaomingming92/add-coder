import * as z from "zod/v4"
import type { ToolRegistrar } from "./registrar.js"
import { textResponse, errorResponse } from "../shared/response.js"
import { prisma } from "../shared/prisma.js"

export function registerHookEventTools(server: ToolRegistrar) {

  server.registerTool("get_hook_events", {
    description:
      "查询 Hook 拦截事件（HOOK_INTERCEPT）。支持按 planKeyword/hook/时间区间过滤，按 planKeyword 分组聚合。" +
      "\n\n典型用法:" +
      "\n- get_hook_events({}) — 查最近 50 条拦截事件" +
      "\n- get_hook_events({ sinceMinutes: 1440 }) — 过去 24h" +
      "\n- get_hook_events({ planKeyword: \"no-active-plan\" }) — 无 Plan 违规" +
      "\n- get_hook_events({ hook: \"pre-tool-use\" }) — 按 hook 类型过滤",
    inputSchema: z.object({
      planKeyword: z.string().optional().describe("按 Plan 关键词过滤"),
      hook: z.string().optional().describe("按 hook 名称过滤: pre-tool-use / doc-format-guard / prompt-submit"),
      sinceMinutes: z.number().optional().describe("时间窗口起始（分钟前），如 1440=过去24h"),
      untilMinutes: z.number().optional().describe("时间窗口截止（分钟前），默认 0（现在）"),
      limit: z.number().optional().default(50).describe("返回最大条数，默认 50，最大 200"),
    }),
  }, async (args: Record<string, string | number | undefined>, _ctx: unknown) => {
    try {
      const { planKeyword, hook, sinceMinutes, untilMinutes, limit = 50 } = args

      const where: Record<string, unknown> = { action: "HOOK_INTERCEPT" }
      if (planKeyword) where.planKeyword = planKeyword
      if (hook) where.targetType = hook

      // 时间范围过滤
      if (sinceMinutes !== undefined || untilMinutes !== undefined) {
        const now = Date.now()
        const since = sinceMinutes !== undefined ? new Date(now - (sinceMinutes as number) * 60 * 1000) : new Date(0)
        const until = untilMinutes !== undefined ? new Date(now - (untilMinutes as number) * 60 * 1000) : new Date()
        where.createdAt = { gte: since, lte: until }
      }

      const ops = prisma.devOperation as Record<string, (...a: unknown[]) => unknown>
      const logs = await ops.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: Math.min(limit as number, 200),
      }) as Array<Record<string, unknown>>

      if (logs.length === 0) {
        const f: string[] = []
        if (planKeyword) f.push(`planKeyword=${planKeyword}`)
        if (hook) f.push(`hook=${hook}`)
        if (sinceMinutes !== undefined) f.push(`过去${sinceMinutes}分钟`)
        return textResponse(
          `=== Hook 拦截事件 ===\n\n未找到匹配的拦截记录（条件: ${f.length > 0 ? f.join(", ") : "无过滤条件"}）。`
        )
      }

      // 按 planKeyword 分组统计
      const groupMap = new Map<string, number>()
      for (const l of logs) {
        const kw = (l.planKeyword as string) || "unknown"
        groupMap.set(kw, (groupMap.get(kw) || 0) + 1)
      }

      const lines = ["=== Hook 拦截事件 ===", `共 ${logs.length} 条记录`, ""]
      lines.push("## 按 Plan 分组", "")
      for (const [kw, count] of [...groupMap.entries()].sort((a, b) => b[1] - a[1])) {
        lines.push(`  ${kw}: ${count} 次`)
      }

      lines.push("", "## 最近事件", "")
      for (let i = 0; i < Math.min(logs.length, 20); i++) {
        const l = logs[i]
        lines.push(
          `  [${(l.createdAt as Date).toISOString().slice(11, 19)}] ${l.targetType || "?"} → ${l.reason || "(无)"} | plan: ${l.planKeyword || "?"}`
        )
      }

      // 治理信号：无 Plan 违规告警
      const noPlanCount = groupMap.get("no-active-plan") || 0
      if (noPlanCount >= 10) {
        lines.push("", `⚠️  阈值告警: 过去 ${sinceMinutes || "?"} 分钟内无 Plan 违规 ${noPlanCount} 次（≥10），建议创建 Plan 或检查 hooks 误报`)
      }

      lines.push("", "=== 稀疏推理建议 ===", "基于以上 hook 事件，可分析近期治理合规情况。")
      return textResponse(lines.join("\n"))
    } catch (error) {
      return errorResponse(
        `查询 hook 事件失败: ${error instanceof Error ? error.message : String(error)}\n可能原因: 数据库未运行。`
      )
    }
  })

}
