import * as z from "zod/v4"
import { inputRequired, acceptedContent, type McpServer } from "@modelcontextprotocol/server"
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs"
import { join } from "path"
import { textResponse, errorResponse } from "../shared/response.js"
import { PROJECT_ROOT, MAGIC_DIR } from "../shared/fs.js"
import { prisma } from "../shared/prisma.js"
import { HITL_INTERACTION_CONFIG } from "../shared/hitl-interaction.strategy.js"

const db = {
  get hitl() { return prisma.hitlRecord as unknown as Record<string, (...a: unknown[]) => unknown> },
}

export function registerHitlTools(server: McpServer) {

  // ═══════════════ 辅助：解析 inputRequired 响应 ═══════════════
  function _parseElicitResp(ctx: Record<string, unknown>): { action: string } | null {
    try {
      const responses = (ctx?.mcpReq as Record<string, unknown>)?.inputResponses as Record<string, unknown> | undefined
      return acceptedContent<{ action: string }>(responses, "confirm") ?? null
    } catch {
      return null  // inputRequired 不受支持 → 降级
    }
  }

  // ═══════════════ 辅助：解析逐项决策弹框响应 ═══════════════
  function _parseDecisions(ctx: Record<string, unknown>): Record<string, unknown> | null {
    try {
      const responses = (ctx?.mcpReq as Record<string, unknown>)?.inputResponses as Record<string, unknown> | undefined
      return acceptedContent<Record<string, unknown>>(responses, "confirm") ?? null
    } catch {
      return null
    }
  }

  // ═══════════════ 辅助：查找 hitl.md 文件 ═══════════════
  function findHitlFile(planName: string): string | null {
    const base = join(PROJECT_ROOT, MAGIC_DIR, "plans")
    // 优先尝试今天日期
    const now = new Date()
    const yyyyMM = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`
    const dd = String(now.getDate()).padStart(2,"0")
    const todayPath = join(base, yyyyMM, dd, `${planName}.hitl.md`)
    if (existsSync(todayPath)) return todayPath
    // 跨日兜底：昨天
    const yesterday = new Date(now.getTime() - 86400000)
    const yMM = `${yesterday.getFullYear()}-${String(yesterday.getMonth()+1).padStart(2,"0")}`
    const yDD = String(yesterday.getDate()).padStart(2,"0")
    const yPath = join(base, yMM, yDD, `${planName}.hitl.md`)
    if (existsSync(yPath)) return yPath
    return null
  }

  // ═══════════════ 辅助：解析 hitl.md 表格维度 ═══════════════
  function parseHitlDimensions(filePath: string): { name: string; content: string }[] {
    try {
      const content = readFileSync(filePath, "utf-8")
      const rows: { name: string; content: string }[] = []
      // 匹配表格行: | 数字 | name | content | 同意/驳回 |
      const rowRe = /^\|\s*\d+\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|$/
      for (const line of content.split("\n")) {
        const m = line.match(rowRe)
        if (m && !line.includes("---")) {
          rows.push({ name: m[1].trim(), content: m[2].trim() })
        }
      }
      return rows
    } catch { return [] }
  }

  // ===== create_hitl =====
  server.registerTool("create_hitl", {
    description: "HITL 审批：创建提案。写入 HitlRecord（status=DRAFT，自动递增 round），并生成 hitl.md 提案文件供人工审核。\n" +
      "支持 inputRequired 交互式确认，含逐项决策（LLM 传 dimensions）或简单弹框两种模式。\n" +
      "降级模式（_fallback=true）：跳过弹框，按原始代码行为直接创建。\n" +
      "_use_genui=true：genui widget 回调后使用，跳过所有弹框，直接以传入的 dimensions 创建 DB+文件。\n" +
      "planName 示例: add-coder-hitl-mcp-hook-plan-v1\n" +
      "type: PLAN=计划审批, PLAN_REVIEW=方案评审",
    inputSchema: z.object({
      planName: z.string().describe("Plan 名称，不含 .md 后缀"),
      type: z.enum(["PLAN", "PLAN_REVIEW"]).describe("审批类型"),
      dimensions: z.array(z.object({
        name: z.string().describe("维度名称，如「实施主体」「数据模型」"),
        content: z.string().optional().describe("LLM 建议的方案内容"),
      })).optional().describe("决策维度列表（LLM 根据对话生成）。不传则按模板默认 8 维度"),
      _fallback: z.boolean().optional().default(false).describe("降级模式：跳过 inputRequired，按原始代码行为直接创建 DB 记录+hitl.md"),
      _use_genui: z.boolean().optional().default(false).describe("genui 模式：genui widget 回调后使用，跳过所有弹框直接创建（dimensions 需传最终确认值）"),
    }),
  }, async (args: Record<string, unknown>, ctx: Record<string, unknown>) => {
    try {
      const { planName, type, dimensions, _fallback, _use_genui } = args as { planName: string; type: string; dimensions?: { name: string; content?: string }[]; _fallback?: boolean; _use_genui?: boolean }

      // ── 最终维度内容（从弹框结果合并） ──
      let finalDims: { name: string; content: string }[] = []

      // ── genui 模式：widget 回调已完成决策，直接跳过所有弹框 ──
      if (_use_genui) {
        finalDims = (dimensions || []).map(d => ({ name: d.name, content: d.content || "" }))
      }

      // ── 交互式确认（非降级模式且非 genui 模式） ──
      if (!_fallback && !_use_genui) {
        const hasDims = dimensions && dimensions.length > 0

        if (hasDims) {
          // 增强模式：逐项决策弹框（扁平属性，兼容 MCP PrimitiveSchema）
          const decResp = _parseDecisions(ctx)

          if (!decResp) {
            // 首次调用 — 构建扁平逐项弹框
            const props: Record<string, unknown> = {
              globalAction: {
                type: "string", enum: ["", "同意全部", "驳回全部"],
                description: "同意全部=通过所有(含已调整行); 驳回全部=驳回提案; 留空=逐项"
              }
            }
            const requiredKeys: string[] = ["globalAction"]

            dimensions!.forEach((d, i) => {
              const prefix = `dim_${i}`
              props[`${prefix}_content`] = { type: "string", description: `${d.name}: ${d.content || ""}` }
              props[`${prefix}_decision`] = {
                type: "string", enum: ["同意", "调整"],
                description: `${d.name}: 同意=通过, 调整=修改方案`
              }
              props[`${prefix}_adjusted`] = { type: "string", description: `${d.name} 调整后内容（仅调整时填）` }
              requiredKeys.push(`${prefix}_decision`)
            })

            const dimDesc = dimensions!.map((d, i) => `${i+1}. ${d.name}${d.content ? `: ${d.content}` : ""}`).join("\n")
            return inputRequired({
              inputRequests: {
                confirm: inputRequired.elicit({
                  message: `确认创建 HITL 提案\n\nplan: ${planName}\ntype: ${type}\n\n共 ${dimensions!.length} 个决策维度：\n${dimDesc}`,
                  requestedSchema: { type: "object", properties: props, required: requiredKeys } as any
                })
              }
            })
          }

          if (decResp.globalAction === "驳回全部") {
            return textResponse("用户驳回了 HITL 提案创建")
          }

          if (decResp.globalAction === "同意全部") {
            finalDims = dimensions!.map(d => ({ name: d.name, content: d.content || "" }))
          } else {
            // 逐项处理：合并调整内容
            finalDims = dimensions!.map((d, i) => {
              const decision = decResp[`dim_${i}_decision`] as string | undefined
              if (decision === "调整") {
                const adjusted = decResp[`dim_${i}_adjusted`] as string | undefined
                return { name: d.name, content: (adjusted || d.content || "") }
              }
              return { name: d.name, content: d.content || "" }
            })
          }
        } else {
          // 无维度 → 简单弹框（原行为）
          const elicitResp = _parseElicitResp(ctx)

          if (!elicitResp) {
            return inputRequired({
              inputRequests: {
                confirm: inputRequired.elicit({
                  message: `确认创建 HITL 提案？\n\nplan: ${planName}\ntype: ${type}`,
                  requestedSchema: { type: "object", properties: { action: { type: "string", enum: ["同意", "取消"], description: "同意=确认创建提案, 取消=取消操作" } }, required: ["action"] } as any
                })
              }
            })
          }

          if (elicitResp.action === "取消") {
            return textResponse("用户取消了 HITL 提案创建")
          }
        }
      }

      // ── 原始业务逻辑（创建 DB + 生成 hitl.md。降级模式也走此路） ──
      const rows = await db.hitl.findMany({
        where: { planName },
        orderBy: { round: "desc" },
        take: 1,
      }) as { round: number | null }[]
      const round = (rows[0]?.round ?? 0) + 1
      const record = await db.hitl.create({
        data: { planName, round, type, status: "DRAFT" },
      }) as { id: string }
      // 生成 hitl.md
      const now = new Date()
      const yyyyMM = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`
      const dd = String(now.getDate()).padStart(2,"0")
      const plansDir = join(PROJECT_ROOT, MAGIC_DIR, "plans", yyyyMM, dd)
      const proposalPath = join(plansDir, `${planName}.hitl.md`)
      const isoNow = now.toISOString()

      // 动态生成维度表格行
      const tableRows = finalDims.length > 0
        ? finalDims.map((d, i) => `| ${i + 1} | ${d.name} | ${d.content} | 同意/驳回 |`).join("\n")
        : [
            "| 1 | 实施主体 | | 同意/驳回 |",
            "| 2 | 数据模型 | | 同意/驳回 |",
            "| 3 | MCP 工具 | | 同意/驳回 |",
            "| 4 | 文件命名 | | 同意/驳回 |",
            "| 5 | 模板 + schema | | 同意/驳回 |",
            "| 6 | 新增依赖 | | 同意/驳回 |",
            "| 7 | 预计文件数 | | 同意/驳回 |",
            "| 8 | 预计轮次 | | 同意/驳回 |",
          ].join("\n")

      const tpl = [
        `# ${planName} — HITL 提案 (round ${round})`,
        "",
        `> 创建: ${isoNow}  |  类型: ${type}  |  状态: DRAFT`,
        "",
        "## HITL 计划总览",
        "",
        "请填写以下决策维度，人工审核后点击 update_hitl 弹框选择「同意/驳回」完成审批：",
        "",
        "| # | 维度 | 方案内容 | 决策 |",
        "|---|------|----------|:----:|",
        tableRows,
        "",
      ].join("\n")
      mkdirSync(plansDir, { recursive: true })
      writeFileSync(proposalPath, tpl, "utf-8")

      // 响应
      const lines = [
        `✅ create_hitl`,
        ``,
        `planName: ${planName}`,
        `type:     ${type}`,
        `round:    ${round}`,
        `status:   DRAFT`,
        `proposal: ${proposalPath}`,
        `recordId: ${record.id}`,
      ]
      if (finalDims.length > 0) lines.push(`dimensions: ${finalDims.length} 项`)
      if (_fallback) lines.push(`mode:     _fallback (跳过 dialog，原始代码降级)`)
      return textResponse(lines.join("\n"))
    } catch (e) {
      return errorResponse(`create_hitl 失败: ${e instanceof Error ? e.message : String(e)}`)
    }
  })

  // ===== update_hitl =====
  server.registerTool("update_hitl", {
    description: "HITL 审批：更新状态。SUBMITTED→TONGYI/BOHUI。\n" +
      "交互模式（默认）：返回 inputRequired 弹框让用户确认→确认后写哨兵+更新 DB。\n" +
      "降级模式（_fallback=true）：跳过弹框，直接写哨兵+更新 DB（原代码行为降级）。\n" +
      "_use_genui=true：genui widget 回调后使用，跳过弹框直接以传入的 status/reason 更新。\n" +
      "已终态（TONGYI/BOHUI）不可再更新，BOHUI 后需 create_hitl 新建 round。",
    inputSchema: z.object({
      planName: z.string().describe("Plan 名称"),
      type: z.enum(["PLAN", "PLAN_REVIEW"]).describe("审批类型"),
      status: z.enum(["SUBMITTED", "TONGYI", "BOHUI"]).optional().describe("降级模式(_fallback)或 genui 模式(_use_genui)必填：目标状态"),
      reason: z.string().optional().describe("驳回原因（降级模式手动传，genui 模式从 widget 回调获取）"),
      _fallback: z.boolean().optional().default(false).describe("降级模式：跳过 inputRequired，按原始代码行为直接写哨兵+更新 DB"),
      _use_genui: z.boolean().optional().default(false).describe("genui 模式：genui widget 回调后使用，跳过弹框直接更新（status/reason 需传最终值）"),
    }),
  }, async (args: Record<string, unknown>, ctx: Record<string, unknown>) => {
    try {
      const { planName, type, status, reason, _fallback, _use_genui } = args as Record<string, string | boolean | undefined>

      // ── 交互式确认（非降级模式且非 genui 模式） ──
      let effectiveStatus = status as string | undefined

      if (!_fallback && !_use_genui) {
        // 尝试读取 hitl.md 文件解析维度
        const hitlPath = findHitlFile(planName as string)
        const dims = hitlPath ? parseHitlDimensions(hitlPath) : []

        if (dims.length > 0) {
          // 增强模式：逐项决策弹框
          const decResp = _parseDecisions(ctx)

          if (!decResp) {
            const props: Record<string, unknown> = {
              globalAction: {
                type: "string", enum: ["", "同意全部", "驳回全部"],
                description: "同意全部=通过所有维度; 驳回全部=驳回提案; 留空=逐项"
              }
            }
            const requiredKeys: string[] = ["globalAction"]

            dims.forEach((d, i) => {
              const prefix = `dim_${i}`
              props[`${prefix}_name`] = { type: "string", description: `${d.name}: ${d.content}` }
              props[`${prefix}_decision`] = {
                type: "string", enum: ["同意", "驳回"],
                description: `${d.name}: 同意=通过此项, 驳回=此项驳回`
              }
              requiredKeys.push(`${prefix}_decision`)
            })

            const dimDesc = dims.map((d, i) => `${i+1}. ${d.name}: ${d.content}`).join("\n")
            return inputRequired({
              inputRequests: {
                confirm: inputRequired.elicit({
                  message: `HITL 审批决策\n\nplan: ${planName}\ntype: ${type}\n\n逐项决策以下 ${dims.length} 个维度：\n${dimDesc}`,
                  requestedSchema: { type: "object", properties: props, required: requiredKeys } as any
                })
              }
            })
          }

          if (decResp.globalAction === "同意全部") {
            effectiveStatus = "TONGYI"
          } else if (decResp.globalAction === "驳回全部") {
            effectiveStatus = "BOHUI"
          } else {
            // 逐项：有任一驳回→整体BOHUI
            const anyRejected = dims.some((_, i) => (decResp[`dim_${i}_decision`] as string) === "驳回")
            effectiveStatus = anyRejected ? "BOHUI" : "TONGYI"
          }
        } else {
          // 无维度文件 → 简单三按钮弹框
          const elicitResp = _parseElicitResp(ctx)

          if (!elicitResp) {
            return inputRequired({
              inputRequests: {
                confirm: inputRequired.elicit({
                  message: `HITL 审批决策\n\nplan: ${planName}\ntype: ${type}`,
                  requestedSchema: { type: "object", properties: { action: { type: "string", enum: ["同意", "驳回", "取消"], description: "同意=通过审批, 驳回=驳回重做, 取消=暂不操作" } }, required: ["action"] } as any
                })
              }
            })
          }

          if (elicitResp.action === "取消") {
            return textResponse("用户取消了 HITL 审批操作")
          }
          effectiveStatus = elicitResp.action === "同意" ? "TONGYI" : "BOHUI"
        }
      }

      // 降级模式必须传 status

      // ── 原始业务逻辑（更新 DB + 写哨兵文件。降级模式也走此路） ──
      const s = effectiveStatus!
      const rows = await db.hitl.findMany({
        where: { planName, type },
        orderBy: { round: "desc" },
        take: 1,
      }) as Record<string, unknown>[]
      if (!rows.length) return errorResponse(`未找到 HITL 记录: planName=${planName}, type=${type}`)
      const r = rows[0]
      const prevStatus = r.status as string
      if (prevStatus === "TONGYI" || prevStatus === "BOHUI") {
        return errorResponse(`HITL 已终态（${prevStatus}），不可再更新。BOHUI 后请用 create_hitl 新建 round。`)
      }
      // 更新
      const data: Record<string, unknown> = { status: s }
      if (s === "TONGYI") data.approvedAt = new Date()
      if (s === "BOHUI") {
        data.rejectedAt = new Date()
        if (reason) data.rejectReason = reason
      }
      await db.hitl.update({ where: { id: r.id }, data })
      // 写哨兵文件
      const markerDir = join(PROJECT_ROOT, MAGIC_DIR, "hitl")
      mkdirSync(markerDir, { recursive: true })
      const marker = s === "TONGYI"
        ? join(markerDir, `.tongyi-${planName}`)
        : join(markerDir, `.bohui-${planName}`)
      const markerContent = [
        `status: ${s}`,
        `time: ${new Date().toISOString()}`,
        reason ? `reason: ${reason}` : null,
      ].filter(Boolean).join("\n") + "\n"
      writeFileSync(marker, markerContent, "utf-8")
      // 响应
      const lines = [
        `✅ update_hitl`,
        ``,
        `planName: ${planName}`,
        `round:    ${r.round}`,
        `status:   ${prevStatus} → ${s}`,
      ]
      if (_fallback) lines.push(`mode:     _fallback (跳过 dialog，原始代码降级)`)
      if (s === "TONGYI") lines.push(`marker:   ${marker} (stat() O(1) 兜底)`)
      if (s === "BOHUI") {
        lines.push(`marker:   ${marker}`)
        lines.push(`reason:   ${reason || "—"}`)
        lines.push(``, `💡 驳回后请用 create_hitl 新建 round ${Number(r.round) + 1} 重新发起审批。`)
      }
      return textResponse(lines.join("\n"))
    } catch (e) {
      return errorResponse(`update_hitl 失败: ${e instanceof Error ? e.message : String(e)}`)
    }
  })

  // ===== status_hitl =====
  server.registerTool("status_hitl", {
    description: "HITL 审批：查询状态。返回最新 round 的状态、时间戳、拒绝原因等。与 .hitl-tongyi-{planName} 哨兵文件构成双通道校验。\n未发起时返回提示调用 create_hitl。",
    inputSchema: z.object({
      planName: z.string().describe("Plan 名称"),
      type: z.enum(["PLAN", "PLAN_REVIEW"]).describe("审批类型（默认 PLAN）").default("PLAN"),
    }),
  }, async (args: Record<string, unknown>) => {
    try {
      const { planName, type } = args as { planName: string; type?: string }
      const rows = await db.hitl.findMany({
        where: { planName, type },
        orderBy: { round: "desc" },
        take: 1,
      }) as Record<string, unknown>[]
      if (!rows.length) {
        return textResponse(
          `📋 HITL: 未发起\n` +
          `\nplanName: ${planName}` +
          `\ntype:     ${type || "PLAN"}` +
          `\n\n操作: create_hitl({ planName: "${planName}", type: "${type || "PLAN"}" })`
        )
      }
      const r = rows[0]
      const status = r.status as string
      const icons: Record<string, string> = { DRAFT: "⏳", SUBMITTED: "📤", TONGYI: "✅", BOHUI: "❌" }
      const icon = icons[status] || "❓"
      const lines = [
        `📋 HITL: ${icon} ${status}`,
        ``,
        `planName:   ${planName}`,
        `type:       ${r.type}`,
        `round:      ${r.round}`,
        r.createdAt ? `createdAt:  ${(r.createdAt as Date).toISOString()}` : null,
        r.approvedAt ? `approvedAt: ${(r.approvedAt as Date).toISOString()}` : null,
        r.rejectedAt ? `rejectedAt: ${(r.rejectedAt as Date).toISOString()}` : null,
        r.rejectReason ? `reason:     ${r.rejectReason}` : null,
      ].filter(Boolean)
      if (status === "BOHUI") {
        lines.push(``, `💡 驳回后可 create_hitl 新建 round ${Number(r.round) + 1}。`)
      }
      if (status === "DRAFT" || status === "SUBMITTED") {
        lines.push(``, `操作: update_hitl({ planName: "${planName}", type: "${r.type}", status: "TONGYI|BOHUI" })`)
      }
      return textResponse(lines.join("\n"))
    } catch (e) {
      return errorResponse(`status_hitl 失败: ${e instanceof Error ? e.message : String(e)}`)
    }
  })

}
