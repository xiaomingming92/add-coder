import type { McpServer } from "@modelcontextprotocol/server"
import { prisma } from "../shared/prisma.js"

export function registerHookEventResources(server: McpServer) {

  // ── 日报 Resource ──
  server.registerResource("hook-events-daily", "add-coder://report/hook-events/daily",
    { description: "过去 24 小时 Hook 拦截事件日报（按小时分组聚合）", mimeType: "application/json" },
  async () => {
    try {
      const ops = prisma.devOperation as Record<string, (...a: unknown[]) => unknown>
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
      const logs = await ops.findMany({
        where: { action: "HOOK_INTERCEPT", createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
        take: 500,
      }) as Array<Record<string, unknown>>

      // 按小时分组
      const hourly = new Map<string, { total: number; plans: Map<string, number> }>()
      for (const l of logs) {
        const hour = (l.createdAt as Date).toISOString().slice(0, 13) + ":00"
        const kw = (l.planKeyword as string) || "unknown"
        if (!hourly.has(hour)) hourly.set(hour, { total: 0, plans: new Map() })
        const entry = hourly.get(hour)!
        entry.total++
        entry.plans.set(kw, (entry.plans.get(kw) || 0) + 1)
      }

      const breakdown: Array<{ hour: string; total: number; plans: Record<string, number> }> = []
      for (const [hour, entry] of [...hourly.entries()].sort()) {
        const plans: Record<string, number> = {}
        for (const [k, v] of entry.plans) plans[k] = v
        breakdown.push({ hour, total: entry.total, plans })
      }

      return {
        contents: [{
          text: JSON.stringify({ type: "daily", total: logs.length, breakdown }),
          uri: "add-coder://report/hook-events/daily",
          mimeType: "application/json",
        }],
      }
    } catch {
      return {
        contents: [{
          text: JSON.stringify({ type: "daily", total: 0, breakdown: [], error: "数据库不可用" }),
          uri: "add-coder://report/hook-events/daily",
          mimeType: "application/json",
        }],
      }
    }
  })

  // ── 周报 Resource ──
  server.registerResource("hook-events-weekly", "add-coder://report/hook-events/weekly",
    { description: "过去 7 天 Hook 拦截事件周报（按日分组聚合）", mimeType: "application/json" },
  async () => {
    try {
      const ops = prisma.devOperation as Record<string, (...a: unknown[]) => unknown>
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      const logs = await ops.findMany({
        where: { action: "HOOK_INTERCEPT", createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
        take: 2000,
      }) as Array<Record<string, unknown>>

      // 按日分组
      const daily = new Map<string, { total: number; plans: Map<string, number> }>()
      for (const l of logs) {
        const day = (l.createdAt as Date).toISOString().slice(0, 10)
        const kw = (l.planKeyword as string) || "unknown"
        if (!daily.has(day)) daily.set(day, { total: 0, plans: new Map() })
        const entry = daily.get(day)!
        entry.total++
        entry.plans.set(kw, (entry.plans.get(kw) || 0) + 1)
      }

      const breakdown: Array<{ day: string; total: number; plans: Record<string, number> }> = []
      for (const [day, entry] of [...daily.entries()].sort()) {
        const plans: Record<string, number> = {}
        for (const [k, v] of entry.plans) plans[k] = v
        breakdown.push({ day, total: entry.total, plans })
      }

      return {
        contents: [{
          text: JSON.stringify({ type: "weekly", total: logs.length, breakdown }),
          uri: "add-coder://report/hook-events/weekly",
          mimeType: "application/json",
        }],
      }
    } catch {
      return {
        contents: [{
          text: JSON.stringify({ type: "weekly", total: 0, breakdown: [], error: "数据库不可用" }),
          uri: "add-coder://report/hook-events/weekly",
          mimeType: "application/json",
        }],
      }
    }
  })

}
