import type { McpServer } from "@modelcontextprotocol/server"
import { join } from "path"
import { existsSync } from "fs"
import { readFileSafe, readdirRecursive, PROJECT_ROOT, MAGIC_DIR } from "../shared/fs.js"
import { prisma } from "../shared/prisma.js"
import { getRuntimeContext } from "../shared/env.js"

export function registerHitlNotifications(server: McpServer) {
  const runtimeContext = getRuntimeContext()
  // ── HITL 表扫描 ──
  const scanHitl = async () => {
    const plansDir = join(PROJECT_ROOT, MAGIC_DIR, "plans")
    if (!existsSync(plansDir)) return
    const files = await readdirRecursive(plansDir)
    const planFiles = files.filter(f => f.endsWith(".md") && f.includes("-plan-v"))
    for (const pf of planFiles.slice(0, 3)) {
      const content = await readFileSafe(join(plansDir, pf)) || ""
      if (content.includes("## HITL 计划总览") && !content.includes("同意") && content.includes("同意/调整")) {
        await server.sendLoggingMessage({
          level: "notice" as const,
          data: `HITL 表待确认: ${pf.replace(/-plan-v\d+\.md$/, "")}`
        })
      }
    }
  }

  // ── Hook 阈值告警: no-active-plan ≥ 10 次/天 ──
  let lastWarnedCount = 0
  const checkThreshold = async () => {
    try {
      const ops = prisma.devOperation as Record<string, (...a: unknown[]) => unknown>
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
      const count = await ops.count({
        where: {
          action: "HOOK_INTERCEPT",
          planKeyword: "no-active-plan",
          projectKey: runtimeContext.projectKey,
          producerAdapterKey: runtimeContext.adapterKey,
          createdAt: { gte: since },
        },
      }) as number
      if (count >= 10 && count !== lastWarnedCount) {
        lastWarnedCount = count
        await server.sendLoggingMessage({
          level: "warning" as const,
          data: `⚠️ Hook 阈值告警: 过去 24h 内无 Plan 违规 ${count} 次（≥10）。建议创建 Plan 或检查 hooks 误报。`
        })
      }
    } catch { /* DB 不可用，静默 */ }
  }

  // 周期扫描: 30s HITL + 300s 阈值
  setInterval(() => { void scanHitl() }, 30000)
  setInterval(() => { void checkThreshold() }, 300000)
  // 启动后立即执行一次阈值检查
  void checkThreshold()
}
