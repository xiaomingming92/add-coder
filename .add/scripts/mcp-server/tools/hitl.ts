import * as z from "zod/v4"
import { inputRequired, acceptedContent } from "@modelcontextprotocol/server"
import type { ToolRegistrar } from "./registrar.js"
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs"
import { join, basename, relative } from "path"
import { textResponse, errorResponse } from "../shared/response.js"
import { PROJECT_ROOT, MAGIC_DIR } from "../shared/fs.js"
import { prisma } from "../shared/prisma.js"
import { HITL_INTERACTION_CONFIG } from "../shared/hitl-interaction.strategy.js"
import type { HitlRow, PlanRow } from "../shared/db-types.js"
import { HitlRowSchema, PlanRowSchema, validatedDelegate } from "../shared/db-types.js"

// 无类型边界单点（zod 托管）：动态加载的 prisma client 在此一次性转为运行期校验的泛型委托
const db = {
  get hitl() { return validatedDelegate<HitlRow>(prisma.hitlRecord, HitlRowSchema, "HitlRecord") },
  get plan() { return validatedDelegate<PlanRow>(prisma.planRecord, PlanRowSchema, "PlanRecord") },
}

export function registerHitlTools(server: ToolRegistrar) {

  // ═══════════════ 辅助：按安装环境裁决交互模式（caijuehub: hitl-interaction-rules.toml） ═══════════════
  const _interaction = (() => {
    const key = MAGIC_DIR.replace(/^\./, "") as keyof typeof HITL_INTERACTION_CONFIG
    return (HITL_INTERACTION_CONFIG[key] ?? HITL_INTERACTION_CONFIG.default) as { mode: string; widget_path?: string }
  })()

  // genui 模式客户端（如 Qoder）未声明 elicitation capability，弹框必然失败 → 返回 genui 流程引导
  function _genuiGuide(recallStep: string): string {
    // D2（Review 回流）：widget 模板多候选探测——sync 实际落脚含 core/ 层级，
    // toml 原值为源仓路径（消费方不存在），逐候选回退，全 miss 显式告警。
    // 输出必须为 workspace 相对路径：genui show_widget 实测拒绝绝对路径（2026-08-11 验证）。
    let widgetPath = ""
    if (_interaction.widget_path) {
      const base = basename(_interaction.widget_path)
      const candidates = [
        join(PROJECT_ROOT, MAGIC_DIR, "templates", "core", "templates", base),
        join(PROJECT_ROOT, MAGIC_DIR, "templates", base),
        join(PROJECT_ROOT, _interaction.widget_path),
      ]
      const abs = candidates.find((p) => existsSync(p)) ?? ""
      widgetPath = abs ? relative(PROJECT_ROOT, abs) : ""
    }
    const lines = [
      `⚠️ 当前环境（${MAGIC_DIR}）客户端不支持 elicitation 弹框，交互模式已裁决为 genui。请按以下流程完成：`,
    ]
    if (widgetPath) {
      lines.push(`1. 调用 genui show_widget 渲染审批表单（widget_path: ${widgetPath}，workspace 相对路径，维度列表经 data 注入）`)
    } else {
      lines.push(`1. ⚠️ widget 模板缺失（hitl-approval-widget.html 未同步到 ${MAGIC_DIR}/templates/），请先执行 add-coder sync 补齐，再走 genui show_widget 流程`)
      lines.push(`   - 兜底可用 inline widget_code 渲染；数据契约: window.__WIDGET_DATA__ = { planName, type, dimensions: [{name, content}] }`)
    }
    lines.push(`2. 用户在 widget 中逐项拍板`)
    lines.push(`3. ${recallStep}`)
    return lines.join("\n")
  }

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
      "交互模式按安装环境自动裁决（caijuehub: hitl-interaction-rules.toml）：\n" +
      "- genui 模式环境（如 Qoder，客户端未声明 elicitation capability）：MUST 直接走 genui 流程——先用 genui show_widget 渲染逐项决策表单，用户拍板后以 _use_genui=true + 最终 dimensions 调用本工具。不带模式参数调用会返回 genui 引导而非弹框。\n" +
      "- 支持 elicitation 的客户端（2026-07-28+ 协议）：inputRequired 弹框，含逐项决策（LLM 传 dimensions）或简单弹框两种模式。\n" +
      "降级模式（_fallback=true）：genui 与弹框均不可用时兜底，跳过弹框直接以传入的 dimensions 创建，人工审核 hitl.md。\n" +
      "_use_genui=true：genui widget 回调后使用，跳过所有弹框，直接以传入的 dimensions 创建 DB+文件。\n" +
      "planName 示例: add-coder-hitl-mcp-hook-plan-v1\n" +
      "type: PLAN=计划审批, PLAN_REVIEW=方案评审",
    inputSchema: z.object({
      planName: z.string().describe("Plan 名称，不含 .md 后缀"),
      type: z.enum(["PLAN", "PLAN_REVIEW", "COLLAB_CONTRACT"]).describe("审批类型"),
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

      // ── planName 入口强校验（弱模型友好：不合规返回可照抄修正调用，而非让错误漂移） ──
      const _pnValid = /-(plan|collab-contract)-v\d+$/.test(planName)
        || /-review(-v\d+|-implementation(-v\d+)?|-runtime(-v\d+)?)?$/.test(planName)
        || planName.endsWith(".hitl")
      if (!_pnValid) {
        const suggested = type === "COLLAB_CONTRACT" ? `${planName}-collab-contract-v1` : `${planName}-plan-v1`
        return errorResponse(
          `planName 格式不合规: "${planName}"\n` +
          `要求: 以 -plan-v{n} / -collab-contract-v{n} / -review-* 结尾（哨兵命名依赖此后缀剥离）\n` +
          `可照抄修正: create_hitl({ planName: "${suggested}", type: "${type}" })`
        )
      }

      // ── 最终维度内容（从弹框结果合并） ──
      let finalDims: { name: string; content: string }[] = []

      // ── genui/降级模式：无弹框环节，直接采用传入的 dimensions（降级丢维度会退化成默认空模板） ──
      if (_use_genui || _fallback) {
        finalDims = (dimensions || []).map(d => ({ name: d.name, content: d.content || "" }))
      }

      // ── 交互式确认（非降级模式且非 genui 模式） ──
      if (!_fallback && !_use_genui) {
        // 环境裁决：genui 模式下不发起注定失败的 elicitation，引导 LLM 走 widget 流程
        if (_interaction.mode === "genui") {
          const dimDesc = (dimensions || []).map((d, i) => `${i + 1}. ${d.name}: ${d.content || ""}`).join("\n")
          return textResponse(
            _genuiGuide("携带最终确认的 dimensions 以 _use_genui=true 重新调用 create_hitl") +
            (dimDesc ? `\n\n待决策维度：\n${dimDesc}` : "\n\n（未传 dimensions，请先根据对话生成决策维度再渲染 widget）")
          )
        }
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
      const now = new Date()
      const yyyyMM = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`
      const dd = String(now.getDate()).padStart(2,"0")
      const plansDir = join(PROJECT_ROOT, MAGIC_DIR, "plans", yyyyMM, dd)
      const proposalPath = join(plansDir, `${planName}.hitl.md`)

      // ── FK 断环修复：HitlRecord.planName 外键要求 PlanRecord 先行。
      //    全新 Plan 首次审批时自动预置占位行（约定式 planPath，文件存在性即指纹），
      //    Plan 文件写出后由 plan_track 回刷真实路径——机器占位机器回刷，不消耗 LLM 认知。
      //    D5（Review 回流）：占位路径按 type 分流——PLAN_REVIEW 指向 reviews/ 目录，
      //    review 文档写出后由 review_track/plan_track 回刷消解（避免永久悬空）。 ──
      let planProvisioned = false
      const existingPlan = await db.plan.findFirst({ where: { planName } })
      if (!existingPlan) {
        const placeholderPath = type === "PLAN_REVIEW"
          ? join(PROJECT_ROOT, MAGIC_DIR, "reviews", yyyyMM, dd, `${planName}.md`)
          : join(plansDir, `${planName}.md`)
        await db.plan.create({
          data: {
            planName,
            planPath: placeholderPath,
            planKeyword: String(planName).replace(/-(plan|collab-contract|review)-v\d+$/, ""),
            totalTasks: 0, doneTasks: 0, checklistT: 0, checklistTDone: 0, checklistR: 0,
          },
        })
        planProvisioned = true
      }

      const rows = await db.hitl.findMany({
        where: { planName },
        orderBy: { round: "desc" },
        take: 1,
      })
      const round = (rows[0]?.round ?? 0) + 1
      const record = await db.hitl.create({
        data: { planName, round, type: type as HitlRow["type"], status: "DRAFT" },
      })
      // 生成 hitl.md
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
      if (planProvisioned) lines.push(`PlanRecord: 自动预置（占位行，Plan 文件写出后 plan_track 回刷真实路径）`)
      if (_fallback) lines.push(`mode:     _fallback (跳过 dialog，原始代码降级)`)
      return textResponse(lines.join("\n"))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes("Foreign key")) {
        return errorResponse(
          `create_hitl 外键异常（PlanRecord 自动预置可能失败）: ${msg}\n` +
          `处方: 检查数据库连接与 PlanRecord 表结构，或改用 plan_track({ planName }) 先建立追踪记录后重试`
        )
      }
      return errorResponse(`create_hitl 失败: ${msg}`)
    }
  })

  // ===== update_hitl =====
  server.registerTool("update_hitl", {
    description: "HITL 审批：更新状态。SUBMITTED→TONGYI/BOHUI。\n" +
      "交互模式按安装环境自动裁决（caijuehub: hitl-interaction-rules.toml）：\n" +
      "- genui 模式环境（如 Qoder）：MUST 先用 genui show_widget 渲染审批表单（维度取自 hitl.md），用户拍板后以 _use_genui=true + status(TONGYI/BOHUI) 调用本工具。不带模式参数调用会返回 genui 引导而非弹框。\n" +
      "- 支持 elicitation 的客户端：inputRequired 弹框确认→确认后写哨兵+更新 DB。\n" +
      "降级模式（_fallback=true）：genui 与弹框均不可用时兜底，跳过弹框直接写哨兵+更新 DB。\n" +
      "_use_genui=true：genui widget 回调后使用，跳过弹框直接以传入的 status/reason 更新。\n" +
      "已终态（TONGYI/BOHUI）不可再更新，BOHUI 后需 create_hitl 新建 round。",
    inputSchema: z.object({
      planName: z.string().describe("Plan 名称"),
      type: z.enum(["PLAN", "PLAN_REVIEW", "COLLAB_CONTRACT"]).describe("审批类型"),
      status: z.enum(["SUBMITTED", "TONGYI", "BOHUI"]).optional().describe("降级模式(_fallback)或 genui 模式(_use_genui)必填：目标状态"),
      reason: z.string().optional().describe("驳回原因（降级模式手动传，genui 模式从 widget 回调获取）"),
      _fallback: z.boolean().optional().default(false).describe("降级模式：跳过 inputRequired，按原始代码行为直接写哨兵+更新 DB"),
      _use_genui: z.boolean().optional().default(false).describe("genui 模式：genui widget 回调后使用，跳过弹框直接更新（status/reason 需传最终值）"),
    }),
  }, async (args: Record<string, unknown>, ctx: Record<string, unknown>) => {
    try {
      const _raw = args as Record<string, string | boolean | undefined>
      const planName = String(_raw.planName ?? "")
      const type = String(_raw.type ?? "")
      const status = typeof _raw.status === "string" ? _raw.status : undefined
      const reason = typeof _raw.reason === "string" ? _raw.reason : undefined
      const _fallback = _raw._fallback === true
      const _use_genui = _raw._use_genui === true

      // ── 交互式确认（非降级模式且非 genui 模式） ──
      let effectiveStatus = status as string | undefined

      if (!_fallback && !_use_genui) {
        // 环境裁决：genui 模式下不发起注定失败的 elicitation，引导 LLM 走 widget 流程
        if (_interaction.mode === "genui") {
          const gPath = findHitlFile(planName as string)
          const gDims = gPath ? parseHitlDimensions(gPath) : []
          const gDesc = gDims.map((d, i) => `${i + 1}. ${d.name}: ${d.content}`).join("\n")
          return textResponse(
            _genuiGuide("拍板后以 _use_genui=true + status(TONGYI/BOHUI) 重新调用 update_hitl（驳回时附 reason）") +
            (gDesc ? `\n\n待审批维度（来自 ${gPath}）：\n${gDesc}` : "")
          )
        }
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
      const s = effectiveStatus as HitlRow["status"]
      const qType = type as HitlRow["type"]
      const rows = await db.hitl.findMany({
        where: { planName, type: qType },
        orderBy: { round: "desc" },
        take: 1,
      })
      if (!rows.length) return errorResponse(`未找到 HITL 记录: planName=${planName}, type=${type}`)
      const r = rows[0]
      const prevStatus = r.status
      if (prevStatus === "TONGYI" || prevStatus === "BOHUI") {
        return errorResponse(`HITL 已终态（${prevStatus}），不可再更新。BOHUI 后请用 create_hitl 新建 round。`)
      }
      // 更新
      const data: Partial<HitlRow> = { status: s }
      if (s === "TONGYI") data.approvedAt = new Date()
      if (s === "BOHUI") {
        data.rejectedAt = new Date()
        if (reason) data.rejectReason = String(reason)
      }
      await db.hitl.update({ where: { id: r.id }, data })
      // ── BOHUI 清算：Plan 文件不存在 → 预置 PlanRecord 无存续理由，连同本 plan 全部 HitlRecord 删除（孤儿即时归零）。
      //    已写出文件的驳回 Plan 保留记录（历史价值）。 ──
      let orphanCleaned = ""
      if (s === "BOHUI") {
        const planRow = await db.plan.findFirst({ where: { planName } })
        if (planRow && !existsSync(planRow.planPath)) {
          await db.hitl.deleteMany({ where: { planName } })
          await db.plan.delete({ where: { id: planRow.id } })
          orphanCleaned = `预置数据已清算（Plan 文件不存在: ${planRow.planPath}）`
        }
      }
      // 写哨兵文件（双命名：原始 planName + pre-tool-use hook §C 剥后缀推导名，保持闸门一致）
      const markerDir = join(PROJECT_ROOT, MAGIC_DIR, "hitl")
      mkdirSync(markerDir, { recursive: true })
      const hookBase = String(planName)
        .replace(/\.hitl$/, "")
        .replace(/-(plan|add-route|review)-v\d+$/, "")
        .replace(/-review-(implementation|runtime)$/, "")
      const markerPrefix = s === "TONGYI" ? ".tongyi-" : ".bohui-"
      const markerNames = [...new Set([String(planName), hookBase])]
      const markerContent = [
        `status: ${s}`,
        `time: ${new Date().toISOString()}`,
        reason ? `reason: ${reason}` : null,
      ].filter(Boolean).join("\n") + "\n"
      for (const n of markerNames) writeFileSync(join(markerDir, markerPrefix + n), markerContent, "utf-8")
      const marker = markerNames.map(n => join(markerDir, markerPrefix + n)).join(", ")
      // P3 #6：回写 .hitl.md 提案文件状态（DRAFT → TONGYI/BOHUI），保证双通道校验一致
      const proposalPath = findHitlFile(String(planName))
      if (proposalPath) {
        let proposal = readFileSync(proposalPath, "utf-8")
        proposal = proposal.replace(/(状态:\s*)[A-Z_]+/, `$1${s}`)
        writeFileSync(proposalPath, proposal, "utf-8")
      }
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
        if (orphanCleaned) lines.push(`cleanup:  ${orphanCleaned}`)
        lines.push(``, `💡 驳回后请用 create_hitl 新建 round ${r.round + 1} 重新发起审批。`)
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
      type: z.enum(["PLAN", "PLAN_REVIEW", "COLLAB_CONTRACT"]).describe("审批类型（默认 PLAN）").default("PLAN"),
    }),
  }, async (args: Record<string, unknown>) => {
    try {
      const { planName, type } = args as { planName: string; type?: string }
      const qType = (type || "PLAN") as HitlRow["type"]
      const rows = await db.hitl.findMany({
        where: { planName, type: qType },
        orderBy: { round: "desc" },
        take: 1,
      })
      if (!rows.length) {
        return textResponse(
          `📋 HITL: 未发起\n` +
          `\nplanName: ${planName}` +
          `\ntype:     ${type || "PLAN"}` +
          `\n\n操作: create_hitl({ planName: "${planName}", type: "${type || "PLAN"}" })`
        )
      }
      const r = rows[0]
      const status = r.status
      const icons: Record<string, string> = { DRAFT: "⏳", SUBMITTED: "📤", TONGYI: "✅", BOHUI: "❌" }
      const icon = icons[status] || "❓"
      const lines = [
        `📋 HITL: ${icon} ${status}`,
        ``,
        `planName:   ${planName}`,
        `type:       ${r.type}`,
        `round:      ${r.round}`,
        r.createdAt ? `createdAt:  ${r.createdAt.toISOString()}` : null,
        r.approvedAt ? `approvedAt: ${r.approvedAt.toISOString()}` : null,
        r.rejectedAt ? `rejectedAt: ${r.rejectedAt.toISOString()}` : null,
        r.rejectReason ? `reason:     ${r.rejectReason}` : null,
      ].filter(Boolean)
      if (status === "BOHUI") {
        lines.push(``, `💡 驳回后可 create_hitl 新建 round ${r.round + 1}。`)
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
