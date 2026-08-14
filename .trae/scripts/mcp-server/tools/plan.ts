import * as z from "zod/v4"
import type { ToolRegistrar } from "./registrar.js"
import { existsSync, readFileSync, writeFileSync } from "fs"
import { join, basename } from "path"
import { textResponse, errorResponse } from "../shared/response.js"
import { readFileSafe, readdirRecursive, PROJECT_ROOT, MAGIC_DIR } from "../shared/fs.js"
import { prisma } from "../shared/prisma.js"
import type { PlanRow } from "../shared/db-types.js"
import { PlanRowSchema, validatedDelegate } from "../shared/db-types.js"
import { getRuntimeContext } from "../shared/env.js"
import { assertPathInRuntimeScope } from "../shared/runtime-context.js"
import { resolvePlanStatus } from "../shared/plan-lifecycle.js"
import { createPrismaPlanStatusStore } from "../shared/plan-status-store.js"
import {
  trackPlanAndPublish,
  type PlanTrackingDatabase,
} from "../shared/plan-tracking-mutation.js"
import {
  closePlanRoundAndPublish,
  type PlanRoundDatabase,
} from "../shared/plan-round-mutation.js"
import { queryPlanRounds, type PlanRoundReadClient } from "../shared/plan-round-store.js"

// 无类型边界单点（zod 托管）：动态加载的 prisma client 在此一次性转为运行期校验的泛型委托
const db = {
  get plan() { return validatedDelegate<PlanRow>(prisma.planRecord, PlanRowSchema, "PlanRecord") },
}

export function registerPlanTools(server: ToolRegistrar) {
  const runtimeContext = getRuntimeContext()
  const statusStore = createPrismaPlanStatusStore(prisma)
  const parseStructuredState = (value: string, field: string): Record<string, unknown> | unknown[] => {
    let parsed: unknown
    try { parsed = JSON.parse(value) } catch { throw new Error(`${field} 必须是有效 JSON`) }
    if (parsed === null || typeof parsed !== "object") throw new Error(`${field} 必须是非 null JSON 对象或数组`)
    return parsed as Record<string, unknown> | unknown[]
  }

  // ===== plan_track =====
  server.registerTool("plan_track", {
    description: "Plan 追踪：扫描 plans/ 目录，解析 tasks.md（[x]/[ ] 勾选）和 checklist.md，写入 PlanRecord。扫描 review-*.md 文件写入 ReviewRecord。按 planName 去重，已存在则增量更新进度。",
    inputSchema: z.object({
      planName: z.string().optional().describe("指定 Plan 名称扫描单个；不传则扫描全部"),
      scanAll: z.boolean().optional().describe("true 扫描全部 Plan"),
    }),
  }, async (args: Record<string, unknown>) => {
    try {
      const { planName } = args as { planName?: string; scanAll?: boolean }
      const pn = typeof planName === "string" ? planName : ""
      const plansDir = join(PROJECT_ROOT, MAGIC_DIR, "plans")
      const specsDir = join(PROJECT_ROOT, MAGIC_DIR, "specs")
      const results: string[] = []

      if (!existsSync(plansDir)) return errorResponse(`plans 目录不存在: ${plansDir}`)

      const targets: { name: string; path: string; keyword: string }[] = []
      const newPlans: string[] = []
      const allFiles = await readdirRecursive(plansDir)
      // 排除 .hitl.md（HITL 提案不是 Plan 本体，避免 plan_track 误扫为独立 Plan）
      const planFiles = allFiles.filter(f => f.endsWith(".md") && !f.endsWith(".hitl.md") && f.includes("-plan-v"))

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
        // 定位 spec dir（目录名可能带 -vN 版本后缀：优先带版本匹配，再回退不带版本，
        // 最后回退解析 Plan §六 关联文档 Spec 路径真源）[Task 1.8 修复]
        const planBase = basename(t.name).replace(/-plan-v\d+$/, "")
        const versionSuffix = /-plan-(v\d+)$/.exec(basename(t.name))?.[1] ?? ""
        const specCandidates = versionSuffix
          ? [`${planBase}-${versionSuffix}`, planBase]
          : [planBase]
        const specRef = content.match(/specs\/([^/`\s]+)/)
        if (specRef) specCandidates.push(specRef[1])
        const specDirName =
          specCandidates.find((d) => existsSync(join(specsDir, d))) ??
          specCandidates[0]
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
        const data: Partial<PlanRow> = {
          planPath: t.path,
          specPath: existsSync(specPath) ? specPath : undefined,
          tasksPath: existsSync(tasksPath) ? tasksPath : undefined,
          checklistPath: existsSync(checklistPath) ? checklistPath : undefined,
          addRoutePath: addRoutePath && existsSync(addRoutePath) ? addRoutePath : undefined,
          totalTasks, doneTasks, checklistT, checklistTDone, checklistR,
          planKeyword: keyword,
        }
        assertPathInRuntimeScope(runtimeContext, t.path)
        const tracked = await trackPlanAndPublish(prisma as unknown as PlanTrackingDatabase, {
          context: runtimeContext,
          planName: t.name,
          planPath: t.path,
          projection: data,
        })
        if (!tracked.created) {
          results.push(`  ✅ 已更新 (totalTasks=${totalTasks}, done=${doneTasks})` + (addRoutePath ? `, addRoute` : ``))
        } else {
          results.push(`  ✅ 已创建 (totalTasks=${totalTasks}, done=${doneTasks})` + (addRoutePath ? `, addRoute` : ``))
          newPlans.push(t.name.replace(/-plan-v\d+$/, ""))
        }
      }
      // ── 孤儿对账（全量扫描时）：PlanRecord 存在但 planPath 文件缺失 → 悬空清单。
      //    来源：create_hitl 预置行被中断 / 用户放弃未清理。允许暂时存在，不允许不可见。 ──
      if (!pn) {
        const allPlans = await db.plan.findMany({
          where: {
            projectKey: runtimeContext.projectKey,
            adapterKey: runtimeContext.adapterKey,
          },
          orderBy: { createdAt: "desc" },
        })
        const orphans = allPlans.filter(p => !existsSync(p.planPath))
        if (orphans.length > 0) {
          results.push("", `⚠️ 悬空 Plan（记录在、文件缺失）— 续写或清理:`)
          const cutoff = Date.now() - 14 * 86400000
          for (const o of orphans) {
            const stale = o.createdAt.getTime() < cutoff
            results.push(`   ${stale ? "🔴 超 14 天，建议清理" : "·"} ${o.planName} → ${o.planPath}`)
          }
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
      const resolution = await resolvePlanStatus(statusStore, runtimeContext, planName)
      if (resolution.availability === "STATUS_UNAVAILABLE") {
        return errorResponse(`Plan status 不可用（禁止按文件猜测）: ${resolution.reason}`)
      }
      if (resolution.planName === null) {
        return textResponse(`📋 Plan: 未跟踪\nplanName: ${planName}\nsource: database\ncontextId: ${runtimeContext.contextId}\n\n操作: plan_track({ planName: "${planName}" })`)
      }
      const plan = await db.plan.findFirst({
        where: {
          projectKey: runtimeContext.projectKey,
          adapterKey: runtimeContext.adapterKey,
          planName,
        },
      })
      if (!plan) return errorResponse(`Plan status 解析后记录消失，请重试: ${planName}`)
      const t = resolution.progress.totalTasks
      const d = resolution.progress.doneTasks
      const ct = resolution.progress.checklistT
      const ctd = resolution.progress.checklistTDone
      const cr = plan.checklistR || 0
      const taskPct = t > 0 ? Math.round((d / t) * 100) : 0
      const lines = [
        `📊 ${planName}`,
        ``,
        `lifecycle:    ${resolution.lifecycle} (${resolution.isActive ? "active" : "inactive"})`,
        `approval:     ${resolution.approvalStatus ?? "—"}`,
        `revision:     ${resolution.revision}`,
        `source:       database`,
        `contextId:    ${runtimeContext.contextId}`,
        `tasks.md:     ${d}/${t} (${taskPct}%) ${taskPct >= 100 ? "✅" : d > 0 ? "🔄" : "⬜"}`,
        `checklist:    [T] ${ctd}/${ct} | [R] ${cr} 项`,
        `planKeyword:  ${plan.planKeyword || "—"}`,
        plan.specPath ? `spec:         ${plan.specPath}` : null,
        plan.addRoutePath ? `addRoute:     ${plan.addRoutePath}` : null,
        // P3 #5 契约角色展示（PlanRecord 已设置时）
        plan.contractRole ? `contractRole: ${plan.contractRole}` : null,
        plan.contractName ? `contractName: ${plan.contractName}` : null,
        `machine:      ${JSON.stringify(resolution)}`,
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
      const plan = await db.plan.findFirst({
        where: {
          projectKey: runtimeContext.projectKey,
          adapterKey: runtimeContext.adapterKey,
          planName,
        },
      })
      if (!plan) return errorResponse(`PlanRecord 未找到: ${planName}`)
      const planPath = plan.planPath
      assertPathInRuntimeScope(runtimeContext, planPath)
      if (!existsSync(planPath)) return errorResponse(`Plan 文件不存在: ${planPath}`)
      const content = readFileSync(planPath, "utf-8")
      const t = plan.totalTasks || 0
      const d = plan.doneTasks || 0
      const ct = plan.checklistT || 0
      const ctd = plan.checklistTDone || 0
      const cr = plan.checklistR || 0
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

  // ===== plan_round_close =====
  server.registerTool("plan_round_close", {
    description: "关闭一个逻辑 PlanRound：在当前 RuntimeContextKey 内幂等写入 ROUND_CLOSED，并于同一 Prisma transaction 发布 PostgreSQL 唤醒通知。不会关闭整个 Plan，也不会修改 lifecycle/revision。",
    inputSchema: z.object({
      planName: z.string().min(1),
      round: z.number().int().positive(),
      beforeState: z.string().describe("非 null JSON 对象或数组字符串"),
      afterState: z.string().describe("非 null JSON 对象或数组字符串，包含本轮产出摘要"),
      reason: z.string().optional(),
      operationKey: z.string().optional(),
    }),
  }, async (args: Record<string, unknown>) => {
    try {
      const input = args as { planName: string; round: number; beforeState: string; afterState: string; reason?: string; operationKey?: string }
      const result = await closePlanRoundAndPublish(prisma as unknown as PlanRoundDatabase, {
        context: runtimeContext,
        planName: input.planName,
        round: input.round,
        beforeState: parseStructuredState(input.beforeState, "beforeState"),
        afterState: parseStructuredState(input.afterState, "afterState"),
        reason: input.reason,
        operationKey: input.operationKey,
      })
      return textResponse([
        "✅ PlanRound 已关闭",
        `planName: ${result.plan.planName}`,
        `round: ${input.round}`,
        `operationId: ${result.operation.id}`,
        `targetId: ${result.operation.targetId}`,
        `lifecycle: ${result.plan.lifecycle} (未修改)`,
        `revision: ${result.plan.revision} (未修改)`,
        "source: database",
      ].join("\n"))
    } catch (e) {
      return errorResponse(`plan_round_close 失败: ${e instanceof Error ? e.message : String(e)}`)
    }
  })

  // ===== plan_round_status =====
  server.registerTool("plan_round_status", {
    description: "查询当前 RuntimeContextKey 下的 ROUND_CLOSED 记录。数据库是权威状态；通知仅负责唤醒订阅者调用本查询。",
    inputSchema: z.object({
      planName: z.string().min(1),
      round: z.number().int().positive().optional(),
    }),
  }, async (args: Record<string, unknown>) => {
    try {
      const input = args as { planName: string; round?: number }
      const snapshot = await queryPlanRounds(prisma as unknown as PlanRoundReadClient, {
        context: runtimeContext,
        planName: input.planName,
        round: input.round,
      })
      if (!snapshot.planId) return textResponse(`📋 PlanRound: 未找到 scoped Plan\nplanName: ${input.planName}\ncontextId: ${runtimeContext.contextId}`)
      const lines = [
        `📋 PlanRound: ${snapshot.planName}`,
        `contextId: ${runtimeContext.contextId}`,
        `source: database`,
        `records: ${snapshot.rounds.length}`,
      ]
      for (const record of snapshot.rounds) {
        lines.push(`- ${record.targetId} | ${record.createdAt.toISOString()} | operationId=${record.id}`)
      }
      return textResponse(lines.join("\n"))
    } catch (e) {
      return errorResponse(`plan_round_status 失败: ${e instanceof Error ? e.message : String(e)}`)
    }
  })

}
