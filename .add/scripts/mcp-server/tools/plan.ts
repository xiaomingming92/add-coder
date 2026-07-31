import * as z from "zod/v4"
import type { McpServer } from "@modelcontextprotocol/server"
import { existsSync, readFileSync, writeFileSync } from "fs"
import { join, basename } from "path"
import { textResponse, errorResponse } from "../shared/response.js"
import { readFileSafe, readdirRecursive, PROJECT_ROOT, MAGIC_DIR } from "../shared/fs.js"
import { prisma } from "../shared/prisma.js"

const db = {
  get plan() { return prisma.planRecord as unknown as Record<string, (...a: unknown[]) => unknown> },
}

export function registerPlanTools(server: McpServer) {

  // ===== plan_track =====
  server.registerTool("plan_track", {
    description: "Plan 追踪：扫描 plans/ 目录，解析 tasks.md（[x]/[ ] 勾选）和 checklist.md，写入 PlanRecord。扫描 review-*.md 文件写入 ReviewRecord。按 planName 去重，已存在则增量更新进度。",
    inputSchema: z.object({
      planName: z.string().optional().describe("指定 Plan 名称扫描单个；不传则扫描全部"),
      scanAll: z.boolean().optional().describe("true 扫描全部 Plan"),
    }),
  }, async (args: Record<string, unknown>) => {
    try {
      const { planName, scanAll } = args as { planName?: string; scanAll?: boolean }
      const pn = typeof planName === "string" ? planName : ""
      const plansDir = join(PROJECT_ROOT, MAGIC_DIR, "plans")
      const specsDir = join(PROJECT_ROOT, MAGIC_DIR, "specs")
      const results: string[] = []

      if (!existsSync(plansDir)) return errorResponse(`plans 目录不存在: ${plansDir}`)

      let targets: { name: string; path: string; keyword: string }[] = []
      const newPlans: string[] = []
      const allFiles = await readdirRecursive(plansDir)
      const planFiles = allFiles.filter(f => f.endsWith(".md") && f.includes("-plan-v"))

      if (pn) {
        const m = planFiles.find(f => f.includes(pn))
        if (m) targets.push({ name: basename(m, ".md"), path: join(plansDir, m), keyword: pn })
      } else {
        for (const f of planFiles) {
          targets.push({ name: basename(f, ".md"), path: join(plansDir, f), keyword: "" })
        }
      }

      for (const t of targets) {
        results.push(`📄 ${t.name}`)
        const content = await readFileSafe(t.path)
        if (!content) { results.push("  ⚠️ 文件无法读取"); continue }
        // 提取 planKeyword（关键词: xxx）
        const kwMatch = content.match(/关键词[:：]\s*(.+)/) || content.match(/planKeyword[:：]\s*"?([^"\n]+)"?/)
        const keyword = kwMatch?.[1]?.trim() || t.name
        // 定位 spec dir
        const specDirName = basename(t.name).replace(/-plan-v\d+$/, "")
        const tasksPath = join(specsDir, specDirName, "tasks.md")
        const checklistPath = join(specsDir, specDirName, "checklist.md")
        const specPath = join(specsDir, specDirName, "spec.md")
        // 统计 tasks
        let totalTasks = 0, doneTasks = 0
        const tasksContent = await readFileSafe(tasksPath)
        if (tasksContent) {
          // 用 indexOf 避免跨行正则（TS 无法编译跨行正则字面量）
          const taskDoneMatches = tasksContent.match(/^- \[x\] /gmi)
          const taskPendingMatches = tasksContent.match(/^- \[ \] /gmi)
          doneTasks = taskDoneMatches?.length || 0
          totalTasks = doneTasks + (taskPendingMatches?.length || 0)
        }
        // 统计 checklist
        let checklistT = 0, checklistTDone = 0, checklistR = 0
        const checklistContent = await readFileSafe(checklistPath)
        if (checklistContent) {
          checklistT = (checklistContent.match(/\[T\]/g) || []).length
          checklistTDone = (checklistContent.match(/\[x\].*\[T\]/g) || []).length
          checklistR = (checklistContent.match(/\[R\]/g) || []).length
        }
        // 定位 add-route
        const planPrefix = basename(t.name).replace(/-plan-v\d+$/, "")
        const addRouteFile = allFiles.find(f =>
          f.includes("add-route") && f.includes(planPrefix)
        )
        const addRoutePath = addRouteFile ? join(plansDir, addRouteFile) : undefined
        // upsert PlanRecord
        const existing = await db.plan.findFirst({ where: { planName: t.name } }) as Record<string, unknown> | null
        const data = {
          planPath: t.path,
          specPath: existsSync(specPath) ? specPath : undefined,
          tasksPath: existsSync(tasksPath) ? tasksPath : undefined,
          checklistPath: existsSync(checklistPath) ? checklistPath : undefined,
          addRoutePath: addRoutePath && existsSync(addRoutePath) ? addRoutePath : undefined,
          totalTasks, doneTasks, checklistT, checklistTDone, checklistR,
          planKeyword: keyword,
        }
        if (existing) {
          await db.plan.update({ where: { id: existing.id }, data })
          results.push(`  ✅ 已更新 (totalTasks=${totalTasks}, done=${doneTasks})` + (addRoutePath ? `, addRoute` : ``))
        } else {
          await db.plan.create({ data: { ...data, planName: t.name, planPath: t.path } })
          results.push(`  ✅ 已创建 (totalTasks=${totalTasks}, done=${doneTasks})` + (addRoutePath ? `, addRoute` : ``))
          newPlans.push(t.name.replace(/-plan-v\d+$/, ""))
        }
      }
      // scanAll 完成后提示用户调用 review_track 填充缺陷指标
      if (newPlans.length > 0) {
        results.push(``, `💡 以下 Plan 为新创建，ReviewRecord 暂无 P0/P1 指标：`)
        for (const pn of newPlans) results.push(`   review_track({ planName: "${pn}" })`)
      }
      return textResponse(results.join("\n") || "无匹配 Plan")
    } catch (e) {
      return errorResponse(`plan_track 失败: ${e instanceof Error ? e.message : String(e)}`)
    }
  })

  // ===== plan_status =====
  server.registerTool("plan_status", {
    description: "Plan 进度查询：返回 PlanRecord 进度数据和关联 Review。tasks.md 完成率、checklist 勾选率、add-route 路径。",
    inputSchema: z.object({
      planName: z.string().describe("Plan 名称"),
    }),
  }, async (args: Record<string, unknown>) => {
    try {
      const { planName } = args as { planName: string }
      const plan = await db.plan.findFirst({ where: { planName } }) as Record<string, unknown> | null
      if (!plan) return textResponse(`📋 Plan: 未跟踪\nplanName: ${planName}\n\n操作: plan_track({ planName: "${planName}" })`)
      const t = plan.totalTasks as number || 0
      const d = plan.doneTasks as number || 0
      const ct = plan.checklistT as number || 0
      const ctd = plan.checklistTDone as number || 0
      const cr = plan.checklistR as number || 0
      const taskPct = t > 0 ? Math.round((d / t) * 100) : 0
      const lines = [
        `📊 ${planName}`,
        ``,
        `tasks.md:     ${d}/${t} (${taskPct}%) ${taskPct >= 100 ? "✅" : d > 0 ? "🔄" : "⬜"}`,
        `checklist:    [T] ${ctd}/${ct} | [R] ${cr} 项`,
        `planKeyword:  ${plan.planKeyword || "—"}`,
        plan.specPath ? `spec:         ${plan.specPath}` : null,
        plan.addRoutePath ? `addRoute:     ${plan.addRoutePath}` : null,
      ].filter(Boolean)
      return textResponse(lines.join("\n"))
    } catch (e) {
      return errorResponse(`plan_status 失败: ${e instanceof Error ? e.message : String(e)}`)
    }
  })

  // ===== plan_sync =====
  server.registerTool("plan_sync", {
    description: "Plan 回写：将 PlanRecord 的进度数据写回 Plan 文档的 📊 Plan 进度快照 区块。使用 indexOf+substring 安全替换，避免跨行正则。",
    inputSchema: z.object({
      planName: z.string().describe("Plan 名称"),
    }),
  }, async (args: Record<string, unknown>) => {
    try {
      const { planName } = args as { planName: string }
      const plan = await db.plan.findFirst({ where: { planName } }) as Record<string, unknown> | null
      if (!plan) return errorResponse(`PlanRecord 未找到: ${planName}`)
      const planPath = plan.planPath as string
      if (!existsSync(planPath)) return errorResponse(`Plan 文件不存在: ${planPath}`)
      const content = readFileSync(planPath, "utf-8")
      const t = plan.totalTasks as number || 0
      const d = plan.doneTasks as number || 0
      const ct = plan.checklistT as number || 0
      const ctd = plan.checklistTDone as number || 0
      const cr = plan.checklistR as number || 0
      const pct = t > 0 ? Math.round((d / t) * 100) : 0
      const snapshot = [
        `## 📊 Plan 进度快照`,
        ``,
        `| 维度 | 进度 | 状态 |`,
        `|------|------|:----:|`,
        `| tasks.md | ${d}/${t} (${pct}%) | ${pct >= 100 ? "✅" : "🔄"} |`,
        `| checklist [T] | ${ctd}/${ct} | ${ct > 0 && ctd >= ct ? "✅" : "⬜"} |`,
        `| checklist [R] | ${cr} 项 | — |`,
        ``,
      ].join("\n")
      // 用 indexOf 安全替换（不用跨行正则）
      const marker = "## 📊 Plan 进度快照"
      const markerEnd = "\n## 📊 Plan 进度快照"
      // 找到现有快照区块的结束位置
      const startIdx = content.indexOf(marker)
      let newContent: string
      if (startIdx === -1) {
        // 没有快照区块，追加到文件末尾
        newContent = content.trimEnd() + "\n\n" + snapshot
      } else {
        // 找到快照区块的下一个 ## 标题作为结束边界
        const afterStart = startIdx + marker.length
        const remaining = content.slice(afterStart)
        const nextH2 = remaining.indexOf("\n## ")
        const endIdx = nextH2 === -1 ? content.length : afterStart + nextH2
        newContent = content.slice(0, startIdx) + snapshot + content.slice(endIdx)
      }
      writeFileSync(planPath, newContent, "utf-8")
      return textResponse(`✅ plan_sync: "${planName}" 进度快照已回写`)
    } catch (e) {
      return errorResponse(`plan_sync 失败: ${e instanceof Error ? e.message : String(e)}`)
    }
  })

}
