import * as z from "zod/v4"
import type { ToolRegistrar } from "./registrar.js"
import { existsSync, readFileSync, writeFileSync } from "fs"
import { join, basename } from "path"
import { textResponse, errorResponse } from "../shared/response.js"
import { readFileSafe, readdirRecursive, PROJECT_ROOT, MAGIC_DIR } from "../shared/fs.js"
import { prisma } from "../shared/prisma.js"

const db = {
  get review() { return prisma.reviewRecord as unknown as Record<string, (...a: unknown[]) => unknown> },
  get plan() { return prisma.planRecord as unknown as Record<string, (...a: unknown[]) => unknown> },
}

// 检测 review 类型
function detectReviewType(filename: string): string {
  const l = filename.toLowerCase()
  if (l.includes("implementation")) return "IMPLEMENTATION"
  if (l.includes("runtime")) return "RUNTIME"
  return "PLAN_REVIEW"
}

// 统计 P0/P1
function countIssueType(content: string): { p0: number; p1: number; backflow: number } {
  let p0 = 0, p1 = 0, backflow = 0
  for (const line of content.split("\n")) {
    if (/^\|\s*\d+\s*\|\s*P0\s*\|/i.test(line)) p0++
    if (/^\|\s*\d+\s*\|\s*P1\s*\|/i.test(line)) p1++
    if (/回流/i.test(line)) backflow++
  }
  return { p0, p1, backflow }
}

export function registerReviewTools(server: ToolRegistrar) {

  // ===== review_track =====
  server.registerTool("review_track", {
    description: "Review 追踪：扫描 reviews/ 目录，解析 review-*.md 文件的 P0/P1 缺陷数、回流率，写入 ReviewRecord。与 PlanRecord 关联（planName）。",
    inputSchema: z.object({
      planName: z.string().optional().describe("指定 PlanName 扫描关联的 review"),
      scanAll: z.boolean().optional().describe("true 扫描全部 review"),
    }),
  }, async (args: Record<string, unknown>) => {
    try {
      const { planName, scanAll } = args as { planName?: string; scanAll?: boolean }
      const pn = typeof planName === "string" ? planName : ""
      const reviewsDir = join(PROJECT_ROOT, MAGIC_DIR, "reviews")
      if (!existsSync(reviewsDir)) return errorResponse(`reviews 目录不存在: ${reviewsDir}`)
      const allFiles = await readdirRecursive(reviewsDir)
      const reviewFiles = allFiles.filter(f => f.endsWith(".md") && f.includes("-review-"))
      const results: string[] = []
      let count = 0

      for (const rf of reviewFiles) {
        const fullPath = join(reviewsDir, rf)
        // 从文件名推导 planName
        // 格式: {plan-name}-review-v1.md 或 {plan-name}-review-implementation.md
        let derivedPlan = basename(rf, ".md")
          .replace(/-review-.*$/, "")
          .replace(/-implementation.*$/, "")
          .replace(/-runtime.*$/, "")
        if (pn && !derivedPlan.includes(pn)) continue

        // 查找匹配的 PlanRecord：PlanRecord.planName 格式为 {planPrefix}-plan-v{n}
        // 而 derivedPlan 为 {planPrefix}（从 review 文件名中去掉了 -review-v{n}）
        // 需要用 contains 匹配，而不是 exact match
        const planMatch = await db.plan.findFirst({
          where: { planName: { contains: derivedPlan } },
        }) as Record<string, unknown> | null
        const actualPlanName = planMatch
          ? (planMatch.planName as string)
          : derivedPlan // fallback，让外键约束报错时提示更清晰

        const content = await readFileSafe(fullPath)
        if (!content) { results.push(`⚠️ ${rf}: 无法读取`); continue }

        const rtype = detectReviewType(rf)
        const stats = countIssueType(content)
        const record = await db.review.findFirst({
          where: { planName: actualPlanName, type: rtype },
        }) as Record<string, unknown> | null

        const data = {
          reviewPath: fullPath,
          p0Count: stats.p0,
          p1Count: stats.p1,
          backflowRate: stats.backflow,
        }
        if (record) {
          await db.review.update({ where: { id: record.id }, data })
          results.push(`🔄 ${rf} (${rtype}) P0=${stats.p0} P1=${stats.p1}`)
        } else {
          await db.review.create({
            data: { planName: actualPlanName, type: rtype, ...data },
          })
          results.push(`✅ ${rf} (${rtype}) P0=${stats.p0} P1=${stats.p1}`)
        }
        count++
      }
      if (!count) results.push(pn ? `未找到关联 review: ${pn}` : "未找到 review 文件")
      return textResponse(results.join("\n"))
    } catch (e) {
      return errorResponse(`review_track 失败: ${e instanceof Error ? e.message : String(e)}`)
    }
  })

  // ===== review_status =====
  server.registerTool("review_status", {
    description: "Review 查询：返回 ReviewRecord 汇总。包含 P0/P1 缺陷数、回流率、类型。与 HITL type=PLAN_REVIEW 联动。",
    inputSchema: z.object({
      planName: z.string().describe("Plan 名称"),
    }),
  }, async (args: Record<string, unknown>) => {
    try {
      const { planName } = args as { planName: string }
      const rows = await db.review.findMany({
        where: { planName },
        orderBy: { type: "asc" },
      }) as Record<string, unknown>[]

      if (!rows.length) {
        return textResponse(
          `📝 Review: 无记录\nplanName: ${planName}\n\n操作: review_track({ planName: "${planName}" })`
        )
      }

      const lines = [`📝 Review: ${planName}`, ``]
      for (const r of rows) {
        const p0 = r.p0Count as number || 0
        const p1 = r.p1Count as number || 0
        const br = r.backflowRate as number || 0
        const total = p0 + p1
        lines.push(
          `  [${r.type}] P0=${p0} P1=${p1} (合计 ${total}) 回流=${br}`,
          r.reviewPath ? `    ${r.reviewPath}` : "",
        )
      }
      // 汇总
      const tP0 = rows.reduce((s: number, r) => s + (r.p0Count as number || 0), 0)
      const tP1 = rows.reduce((s: number, r) => s + (r.p1Count as number || 0), 0)
      lines.push(``, `总计: P0=${tP0} P1=${tP1}`)
      return textResponse(lines.join("\n"))
    } catch (e) {
      return errorResponse(`review_status 失败: ${e instanceof Error ? e.message : String(e)}`)
    }
  })

  // ===== review_sync =====
  server.registerTool("review_sync", {
    description: "Review 回写：将 ReviewRecord 的 P0/P1 数据写回 review-*.md 文档头部元信息。",
    inputSchema: z.object({
      planName: z.string().describe("Plan 名称"),
    }),
  }, async (args: Record<string, unknown>) => {
    try {
      const { planName } = args as { planName: string }
      const rows = await db.review.findMany({ where: { planName } }) as Record<string, unknown>[]

      if (!rows.length) return errorResponse(`无 ReviewRecord: ${planName}`)

      const results: string[] = []
      for (const r of rows) {
        const rp = r.reviewPath as string | undefined
        if (!rp || !existsSync(rp)) {
          results.push(`⚠️ 文件不存在: ${rp || r.type}`)
          continue
        }
        const content = readFileSync(rp, "utf-8")
        const p0 = r.p0Count as number || 0
        const p1 = r.p1Count as number || 0
        const br = r.backflowRate as number || 0

        const metaLines = [
          "<!-- REVIEW_META",
          `  P0: ${p0}`,
          `  P1: ${p1}`,
          `  backflowRate: ${br}`,
          `  trackTime: ${new Date().toISOString()}`,
          `-->`,
        ].join("\n")

        const marker = "<!-- REVIEW_META"
        const idx = content.indexOf(marker)
        let nextContent: string
        if (idx === -1) {
          nextContent = content.replace(/^(#\s+.+)$/m, metaLines + "\n\n$1")
        } else {
          const endIdx = content.indexOf("-->", idx)
          nextContent = content.slice(0, idx) + metaLines + content.slice(endIdx + 3)
        }
        writeFileSync(rp, nextContent, "utf-8")
        results.push(`✅ ${basename(rp)} (P0=${p0}, P1=${p1})`)
      }
      return textResponse(results.join("\n") || "无变更")
    } catch (e) {
      return errorResponse(`review_sync 失败: ${e instanceof Error ? e.message : String(e)}`)
    }
  })

}
