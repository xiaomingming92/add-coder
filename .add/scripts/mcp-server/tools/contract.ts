import * as z from "zod/v4"
import type { McpServer } from "@modelcontextprotocol/server"
import { existsSync, readFileSync } from "fs"
import { join, basename } from "path"
import { textResponse, errorResponse } from "../shared/response.js"
import { readdirRecursive, PROJECT_ROOT, MAGIC_DIR } from "../shared/fs.js"
import { prisma } from "../shared/prisma.js"

const db = {
  get collabContract() { return prisma.collabContract as unknown as Record<string, (...a: unknown[]) => unknown> },
  get plan() { return prisma.planRecord as unknown as Record<string, (...a: unknown[]) => unknown> },
}

/** 契约文档结构化解析结果 */
interface ParsedContract {
  participants: unknown[]
  stages: unknown[]
  fileBoundaries: unknown[]
  dependencyGraph: string
  abilityMatrix: unknown
  completionCriteria: unknown
}

/** 从契约文档解析结构化字段（markdown 表格/JSON 块简化提取） */
function parseContractDoc(content: string): ParsedContract {
  const participants: unknown[] = []
  const stages: unknown[] = []
  const fileBoundaries: unknown[] = []
  let dependencyGraph = ""
  const abilityMatrix: unknown = null
  const completionCriteria: unknown = null

  // participants（§二 参与者表）
  const pMatch = content.match(/\| \*\*Lead Agent\*\*[\s\S]*?\n\n/)
  if (pMatch) {
    for (const line of pMatch[0].split("\n")) {
      const m = line.match(/^\|\s*\*\*(.+?)\*\*\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|$/)
      if (m) participants.push({ role: m[1], platformEntity: m[2], boundPlan: m[3], responsibility: m[4] })
    }
  }

  // stages（§3.1 触发条件表）
  const sMatch = content.match(/\| 阶段 \| 专家 \| 触发条件 \| 并行度 \|[\s\S]*?\n\n/)
  if (sMatch) {
    for (const line of sMatch[0].split("\n")) {
      const m = line.match(/^\|\s*([A-Za-z0-9-]+)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*([并行串行]+)\s*\|$/)
      if (m) stages.push({ stage: m[1], expert: m[2], trigger: m[3], parallelism: m[4] === "并行" ? "parallel" : "serial" })
    }
  }

  // fileBoundaries（§3.2 文件边界表）
  const bMatch = content.match(/\| 专家 \| 独占文件域 \| 禁区 \|[\s\S]*?\n\n/)
  if (bMatch) {
    for (const line of bMatch[0].split("\n")) {
      const m = line.match(/^\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|$/)
      if (m && !m[1].startsWith("---")) fileBoundaries.push({ expert: m[1], exclusiveDomain: m[2], forbidden: m[3], isolationMode: "file" })
    }
  }

  // dependencyGraph（§3.1.1 代码块）
  const gMatch = content.match(/```\n(依赖:[\s\S]*?)\n```/)
  if (gMatch) dependencyGraph = gMatch[1]

  return { participants, stages, fileBoundaries, dependencyGraph, abilityMatrix, completionCriteria }
}

export function registerContractTools(server: McpServer) {

  // ===== contract_track =====
  server.registerTool("contract_track", {
    description: "契约追踪：扫描 plans/ 目录的 *-collab-contract-*.md 文档，解析参与者/阶段/文件边界，写入 CollabContract 表。按 contractName 去重，已存在则增量更新版本。",
    inputSchema: z.object({
      contractName: z.string().optional().describe("指定契约名称扫描单个；不传则扫描全部"),
      scanAll: z.boolean().optional().describe("true 扫描全部契约"),
    }),
  }, async (args: Record<string, unknown>) => {
    try {
      const { contractName, scanAll: _scanAll } = args as { contractName?: string; scanAll?: boolean }
      const plansDir = join(PROJECT_ROOT, MAGIC_DIR, "plans")
      if (!existsSync(plansDir)) return errorResponse(`plans 目录不存在: ${plansDir}`)

      const allFiles = await readdirRecursive(plansDir)
      // 契约文档命名：*-collab-contract-*.md（排除 .hitl.md）
      let contractFiles = allFiles.filter(f => f.endsWith(".md") && !f.endsWith(".hitl.md") && f.includes("-collab-contract-"))
      if (contractName) {
        const m = contractFiles.find(f => f.includes(contractName))
        contractFiles = m ? [m] : []
      }

      if (contractFiles.length === 0) {
        return textResponse(`=== 并发协作契约追踪 ===\n\n未找到契约文档（条件: ${contractName || "全部"}）。\n\n扫描规则: plans/ 下 *-collab-contract-*.md 文件`)
      }

      const results: string[] = []
      for (const f of contractFiles) {
        const name = basename(f, ".md")
        const path = join(plansDir, f)
        const content = readFileSync(path, "utf-8")

        // 提取 masterPlan（元信息中"总控 Plan:" 行）
        const mpMatch = content.match(/总控 Plan:\s*`?([^`\n]+)`?/)
        const masterPlanName = mpMatch ? mpMatch[1].trim().replace(/\.md$/, "") : ""

        const parsed = parseContractDoc(content)
        const existing = await db.collabContract.findFirst({ where: { contractName: name } }) as Record<string, unknown> | null
        const version = (existing?.version as number ?? 0) + 1

        const data = {
          contractName: name,
          contractPath: path,
          masterPlanName: masterPlanName || undefined,
          participants: parsed.participants as never,
          abilityMatrix: parsed.abilityMatrix as never,
          stages: parsed.stages as never,
          dependencyGraph: parsed.dependencyGraph,
          fileBoundaries: parsed.fileBoundaries as never,
          completionCriteria: parsed.completionCriteria as never,
          status: "ACTIVE",
          version,
        }

        if (existing) {
          await db.collabContract.update({ where: { contractName: name }, data })
          results.push(`📄 ${name}  ✅ 已更新 (v${version})`)
        } else {
          await db.collabContract.create({ data })
          results.push(`📄 ${name}  ✅ 已创建 (v${version})`)
        }

        // 若 masterPlan 存在，标记 PlanRecord 角色
        if (masterPlanName) {
          await db.plan.updateMany({
            where: { planName: masterPlanName },
            data: { contractRole: "MASTER", contractName: name } as never,
          })
        }
      }

      return textResponse(`=== 并发协作契约追踪 ===\n${results.join("\n")}\n\n💡 新契约建议: create_hitl({ planName: "${basename(contractFiles[0], ".md")}", type: "PLAN" }) 走契约审批`)
    } catch (error) {
      return errorResponse(`contract_track 失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  })

  // ===== contract_status =====
  server.registerTool("contract_status", {
    description: "契约进度查询：返回 CollabContract 记录（版本/状态/参与者数/阶段数/边界数 + masterPlan）。",
    inputSchema: z.object({
      contractName: z.string().describe("契约名称（如 htc-g13-extra-time-quest-collab-contract-v1）"),
    }),
  }, async (args: Record<string, unknown>) => {
    try {
      const { contractName } = args as { contractName: string }
      const contract = await db.collabContract.findFirst({ where: { contractName } }) as Record<string, unknown> | null
      if (!contract) {
        return textResponse(`📋 契约: 未跟踪\ncontractName: ${contractName}\n\n操作: contract_track({ contractName: "${contractName}" })`)
      }
      const participants = (contract.participants as unknown[]) || []
      const stages = (contract.stages as unknown[]) || []
      const boundaries = (contract.fileBoundaries as unknown[]) || []
      const parallelCount = stages.filter((s) => (s as Record<string, unknown>).parallelism === "parallel").length
      const serialCount = stages.filter((s) => (s as Record<string, unknown>).parallelism === "serial").length
      const versionStr = String(contract.version as number ?? "?")
      const statusStr = String(contract.status as string ?? "?")
      const masterStr = String(contract.masterPlanName as string ?? "(未绑定)")
      const depStr = contract.dependencyGraph ? "已声明" : "未声明"
      const pathStr = String(contract.contractPath as string ?? "(无)")
      return textResponse(
        `📊 ${contractName}\n` +
        `版本:      v${versionStr} (${statusStr})\n` +
        `MasterPlan: ${masterStr}\n` +
        `参与者:    ${participants.length} 个\n` +
        `阶段:      ${stages.length} 个（并行 ${parallelCount} / 串行 ${serialCount}）\n` +
        `文件边界:  ${boundaries.length} 个\n` +
        `依赖拓扑:  ${depStr}\n` +
        `文档:      ${pathStr}`,
      )
    } catch (error) {
      return errorResponse(`contract_status 失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  })
}
