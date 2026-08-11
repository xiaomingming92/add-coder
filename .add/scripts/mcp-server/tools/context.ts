import * as z from "zod/v4"
import type { ToolRegistrar } from "./registrar.js"
import { readFile } from "fs/promises"
import { readdir } from "fs/promises"
import { stat } from "fs/promises"
import { existsSync } from "fs"
import { join, relative } from "path"
import { textResponse, errorResponse } from "../shared/response.js"
import { readFileSafe, readdirRecursive } from "../shared/fs.js"
import { PROJECT_ROOT, MAGIC_DIR } from "../shared/fs.js"
import { prisma } from "../shared/prisma.js"
import type { PlanRow } from "../shared/db-types.js"
import { PlanRowSchema, validatedDelegate } from "../shared/db-types.js"

export function registerContextTools(server: ToolRegistrar) {

  // ===== get_project_context (L166-430) =====
  server.registerTool(
    "get_project_context",
    {
      description: `获取项目的完整上下文信息：目录结构、技术栈、包管理信息、项目规则（ADD 范式约束）、${MAGIC_DIR}/ 工作流产物（templates/specs/reviews/plans）。AI 助手在 MCP-1（上下文优先）中应在生成代码前调用此工具获取项目真实信息，避免幻觉。\n\nscope='add-state' 返回 ADD 工作流状态快照：当前活跃 Plan、Review 未闭环问题、DPS 门禁状态、待执行操作清单。用于空白对话开局时快速介入 ADD 范式。`,
      inputSchema: z.object({
        scope: z.string().optional().describe("获取信息的范围: 'structure' 仅目录结构, 'rules' 仅项目规则, 'package' 仅包信息, 'add-state' ADD 工作流状态, 'all' 全部"),
      }),
    },
    async (args: { scope?: string }) => {
      try {
        const scope = args?.scope || "all"
        const parts: string[] = []

        if (scope === "all" || scope === "package") {
          const pkg = await readFileSafe(join(PROJECT_ROOT, "package.json"))
          if (pkg) {
            const parsed = JSON.parse(pkg)
            parts.push("=== 项目信息 ===")
            parts.push(`名称: ${parsed.name}`)
            parts.push(`版本: ${parsed.version}`)
            parts.push(`技术栈: Next.js ${parsed.dependencies?.next || "unknown"} + TypeScript + Prisma + LangGraph`)
            parts.push("")
            parts.push("核心依赖:")
            const keyDeps = [
              "next", "@langchain/langgraph", "@prisma/client", "prisma",
              "zustand", "@tanstack/react-query", "chromadb", "zod",
            ]
            for (const dep of keyDeps) {
              const ver = parsed.dependencies?.[dep] || parsed.devDependencies?.[dep]
              if (ver) parts.push(`  ${dep}: ${ver}`)
            }
            parts.push("")
            parts.push("可用脚本:")
            for (const [name, script] of Object.entries(parsed.scripts || {})) {
              parts.push(`  ${name}: ${String(script)}`)
            }
            parts.push("")
          }
        }

        if (scope === "all" || scope === "rules") {
          const rules = await readFileSafe(join(PROJECT_ROOT, MAGIC_DIR, "rules", "project_rules.md"))
          if (rules) {
            parts.push("=== 项目规则 (ADD 范式强制约束) ===")
            const lines = rules.split("\n")
            let inCodeBlock = false
            for (const line of lines) {
              if (line.startsWith("```")) { inCodeBlock = !inCodeBlock; continue }
              if (inCodeBlock) continue
              if (line.startsWith("## ADD-") || line.startsWith("## 项目")) { parts.push(""); parts.push(line) }
              else if (line.startsWith("###") || line.startsWith("####")) { parts.push(line) }
            }
            parts.push("")
          }
          // 技术栈 profile 追加（D8）：stack.json → profiles/{stack}-profile.md 存在 → 追加全文
          const stackRaw = await readFileSafe(join(PROJECT_ROOT, MAGIC_DIR, "stack.json"))
          if (stackRaw) {
            try {
              const stackDoc = JSON.parse(stackRaw) as { stack?: unknown }
              if (typeof stackDoc.stack === "string" && stackDoc.stack) {
                const profileContent = await readFileSafe(join(PROJECT_ROOT, MAGIC_DIR, "rules", "profiles", `${stackDoc.stack}-profile.md`))
                if (profileContent) {
                  parts.push(`=== 技术栈约束 (${stackDoc.stack}-profile) ===`)
                  parts.push(profileContent)
                  parts.push("")
                } else {
                  parts.push(`⚠️ profile 文件缺失: ${MAGIC_DIR}/rules/profiles/${stackDoc.stack}-profile.md（技术栈约束未生效）`)
                  parts.push("")
                }
              }
            } catch { /* stack.json 损坏 → 中性处理，仅返回 project_rules.md */ }
          }
        }

        if (scope === "all" || scope === "structure" || scope === "add-state") {
          parts.push("=== ADD 工作流状态 ===")
          const plansDir = join(PROJECT_ROOT, MAGIC_DIR, "plans")
          const reviewsDir = join(PROJECT_ROOT, MAGIC_DIR, "reviews")
          const specsDir = join(PROJECT_ROOT, MAGIC_DIR, "specs")

          let activePlan = ""
          let activePlanPath = ""
          if (existsSync(plansDir)) {
            const planFiles = (await readdirRecursive(plansDir))
              .filter(f => f.endsWith(".md") && !f.includes("add-route") && !f.includes("handoff"))
              .sort()
            if (planFiles.length > 0) {
              activePlan = planFiles[planFiles.length - 1]
              activePlanPath = join(plansDir, activePlan)
              parts.push(`最近 Plan: ${activePlan}`)
              const allPlanFiles = await readdirRecursive(plansDir)
              const addRouteFile = allPlanFiles.find(f => f.includes("add-route"))
              const planKeyword = activePlan.replace(/-plan-v\d+\.md$/, "")
              const handoffFiles = allPlanFiles.filter(f => f.includes("handoff"))
              const hasHandoff = handoffFiles.some(f => f.toLowerCase().includes(planKeyword.toLowerCase()))
              parts.push(` add-route: ${addRouteFile ? "✅ " + addRouteFile : "❌ 缺失（需回退 Step 0.5）"}`)
              parts.push(` handoff: ${hasHandoff ? "✅ 已生成" : "❌ 缺失（需回退 Step 0.5）"}`)
            } else { parts.push("最近 Plan: 无") }
          } else { parts.push("最近 Plan: 无") }

          let reviewFileName = ""; let reviewP0Count = 0; let reviewP1Count = 0; let reviewBackflowRate = 0
          if (existsSync(reviewsDir) && activePlan) {
            const reviewFiles = await readdir(reviewsDir)
            const planKeyword = activePlan.replace(/-plan-v\d+\.md$/, "")
            const matchingReview = reviewFiles.find(f => f.toLowerCase().includes(planKeyword.toLowerCase()) && f.includes("-review-v"))
              || reviewFiles.find(f => f.toLowerCase().includes(planKeyword.toLowerCase()))
            if (matchingReview) {
              reviewFileName = matchingReview
              const reviewContent = await readFileSafe(join(reviewsDir, matchingReview)) || ""
              const reviewLines = reviewContent.split("\n")
              let inP0 = false, inP1 = false
              for (const line of reviewLines) {
                if (line.match(/P0|ADD.*合规|阻断/)) { inP0 = true; inP1 = false; continue }
                if (line.match(/P1|架构设计.*缺口/)) { inP0 = false; inP1 = true; continue }
                if (line.match(/P2|中等|影响评估|决策结论|方案对比/)) { inP0 = false; inP1 = false; continue }
                if ((inP0 || inP1) && line.trim().startsWith("|") && !line.includes("---")) {
                  const cols = line.split("|").map(c => c.trim()).filter(Boolean)
                  if (cols.length >= 4 && cols[0].match(/^\d+$/)) {
                    if (inP0) reviewP0Count++; else if (inP1) reviewP1Count++
                  }
                }
              }
              const planContent = await readFileSafe(activePlanPath) || ""
              if ((reviewP0Count + reviewP1Count) > 0 && planContent) {
                const indicators = ["add-route", "specs/", "handoff", "Task Group", "perExpertTopK", "agri_tech", "ChromaCollectionManager", "迁移路线图", "8 个 Expert", "冗余策略"]
                let hit = 0
                for (const ind of indicators) { if (planContent.toLowerCase().includes(ind.toLowerCase())) hit++ }
                reviewBackflowRate = Math.min(100, Math.round((hit / Math.max(reviewP0Count + reviewP1Count, 1)) * 100))
              }
              parts.push(""); parts.push(`关联 Review: ${matchingReview}`)
              parts.push(`  P0 问题: ${reviewP0Count} 个, P1 问题: ${reviewP1Count} 个`)
              parts.push(`  回流状态: 约 ${reviewBackflowRate}%`)
              parts.push(reviewBackflowRate < 70 ? "  ⚠️ Review 结论未充分回流至 Plan — 需执行 0.6.5 卡位" : "  ✅ Review 结论基本回流至 Plan")
            } else { parts.push(""); parts.push("关联 Review: 无（该 Plan 尚未生成方案评审）") }
          }

          if (activePlan) {
            const planKeyword = activePlan.replace(/-plan-v\d+\.md$/, "")
            const specDirs = existsSync(specsDir) ? await readdir(specsDir) : []
            const matchingSpec = specDirs.find(d => d.toLowerCase().includes(planKeyword.toLowerCase()))
            parts.push("")
            if (matchingSpec) {
              const hasSpec = existsSync(join(specsDir, matchingSpec, "spec.md"))
              const hasTasks = existsSync(join(specsDir, matchingSpec, "tasks.md"))
              const hasChecklist = existsSync(join(specsDir, matchingSpec, "checklist.md"))
              parts.push(`Specs: ${matchingSpec}/`)
              parts.push(`  spec.md:      ${hasSpec ? "✅" : "❌"}`)
              parts.push(`  tasks.md:     ${hasTasks ? "✅" : "❌"}`)
              parts.push(`  checklist.md: ${hasChecklist ? "✅" : "❌"}`)
            } else { parts.push("Specs: ❌ 缺失") }
          }

          parts.push(""); parts.push("=== 悬空 Plan 对账（记录在、文件缺失） ===")
          // 孤儿可见性：create_hitl 预置行被中断 / 放弃未清理 → 开局即提示，不静默累积
          try {
            // 无类型边界单点（zod 托管）：动态 client → 运行期校验的泛型委托
            const planDb = validatedDelegate<PlanRow>(prisma.planRecord, PlanRowSchema, "PlanRecord")
            const allPlans = await planDb.findMany({ orderBy: { createdAt: "desc" } })
            const orphans = allPlans.filter(p => !existsSync(p.planPath))
            if (orphans.length > 0) {
              const cutoff = Date.now() - 14 * 86400000
              for (const o of orphans) {
                const stale = o.createdAt.getTime() < cutoff
                parts.push(`${stale ? "🔴" : "·"} ${o.planName} → ${o.planPath}${stale ? "（超 14 天，建议清理）" : ""}`)
              }
            } else { parts.push("✅ 无悬空记录") }
          } catch { parts.push("⚠️ 悬空对账跳过（数据库不可达）") }

          parts.push(""); parts.push("=== 待执行 ADD 操作（按流程顺序） ===")
          const todoItems: string[] = []
          if (!activePlan) { todoItems.push("1. [未开始] 用户提出需求 → 生成 Plan") }
          else {
            if (!reviewFileName) { todoItems.push("1. [Step 0] 生成 Plan Review（ADD-9 方案评审）") }
            else if (reviewP0Count + reviewP1Count > 0 && reviewBackflowRate < 70) {
              todoItems.push("1. [0.6.5] Review 结论回流至 Plan — P0/P1 未写入 Plan 体")
              todoItems.push("2. [check_dps] DPS 门禁预计不通过（回流完整度 < 70%）")
            }
            const allPlanDir = await readdirRecursive(plansDir)
            const hasAddRoute = allPlanDir.some(f => f.includes("add-route"))
            if (!hasAddRoute && reviewBackflowRate >= 70) { todoItems.push("2. [Step 0.5] 生成 add-route") }
            const planKw = activePlan.replace(/-plan-v\d+\.md$/, "")
            const sd = existsSync(specsDir) ? await readdir(specsDir) : []
            if (!sd.some(d => d.toLowerCase().includes(planKw.toLowerCase())) && reviewBackflowRate >= 70) { todoItems.push("3. [Step 0] 生成 Specs 三元组") }
            if (todoItems.length === 0) { todoItems.push("✅ ADD 就绪 — check_dps ≥ {{dpsPass}} 后可进入 Step 1") }
          }
          for (const item of todoItems) parts.push(item)
          parts.push(""); parts.push("快速指令: 说「执行 add-paradigm Step 0」进入文档先行流程")
          parts.push("          说「将 Review 结论回流至 Plan」触发 0.6.5 卡位")
        }

        if (scope === "all" || scope === "structure") {
          parts.push("=== 项目目录结构（顶层） ===")
          const topDirs = [MAGIC_DIR, "src", "prisma", "scripts", "docs", "data", "public"]
          for (const dir of topDirs) {
            const fullPath = join(PROJECT_ROOT, dir)
            if (existsSync(fullPath)) { const entries = await readdir(fullPath); parts.push(`  ${dir}/ (${entries.length} 项)`) }
          }
          parts.push(""); parts.push("=== src/ 子目录结构 ===")
          const srcDirs = ["agents", "app", "components", "lib", "services", "stores", "types"]
          for (const dir of srcDirs) {
            const fullPath = join(PROJECT_ROOT, "src", dir)
            if (existsSync(fullPath)) {
              const entries = await readdir(fullPath)
              const items = (await Promise.all(entries.slice(0, 15).map(async (e) => { const s = await stat(join(fullPath, e)); return s.isDirectory() ? `${e}/` : e }))).join(", ")
              parts.push(`  src/${dir}/ (${entries.length} 项): ${items})`)
            }
          }
          parts.push(""); parts.push(`=== ${MAGIC_DIR}/ ADD 工作流产物 ===`)
          const magicDirs = [
            { dir: "templates", desc: "ADD 文档模板（11 个）" }, { dir: "specs", desc: "specs 三元组（spec+tasks+checklist）" },
            { dir: "reviews", desc: "方案审查 + 实现审查 + 运行时审查" }, { dir: "plans", desc: "Plan + handoff 交接手册" },
            { dir: "rules", desc: "项目规则 + 理论→实践映射" }, { dir: "skills", desc: "SKILL 行为定义（add-paradigm / session-init）" },
            { dir: "scripts", desc: "工具脚本 + MCP 服务器" },
          ]
          for (const { dir, desc } of magicDirs) {
            const fullPath = join(PROJECT_ROOT, MAGIC_DIR, dir)
            if (existsSync(fullPath)) { const entries = await readdir(fullPath); parts.push(`  ${MAGIC_DIR}/${dir}/ (${entries.length} 项) — ${desc}`) }
          }
        }
        return textResponse(parts.join("\n"))
      } catch (error) { return errorResponse(`获取项目上下文失败: ${error instanceof Error ? error.message : String(error)}`) }
    }
  )

  // ===== get_db_schema (L433-522) =====
  server.registerTool(
    "get_db_schema",
    {
      description: "获取 Prisma 数据库 Schema 定义（MCP-1 上下文优先）。返回指定模型的结构、字段、关系。AI 助手在编写数据库查询代码时应调用此工具获取真实的 Schema 信息，避免凭记忆假设。",
      inputSchema: z.object({ model: z.string().optional().describe("可选的模型名称（不区分大小写）。不指定则返回所有模型概况。指定则返回该模型的完整字段定义。") }),
    },
    async (args: { model?: string }) => {
      try {
        const schemaPath = join(PROJECT_ROOT, "prisma", "schema.prisma")
        const schema = await readFileSafe(schemaPath)
        if (!schema) return errorResponse("未找到 prisma/schema.prisma 文件")
        const modelName = args?.model?.toLowerCase()
        if (modelName) {
          const modelRegex = new RegExp(`model\\s+${modelName}\\s*\\{`, "i")
          const match = schema.match(modelRegex)
          if (match) {
            const startIdx = match.index ?? 0; const braceIdx = schema.indexOf("{", startIdx)
            if (braceIdx !== -1) { let depth = 1; let endIdx = braceIdx + 1; while (depth > 0 && endIdx < schema.length) { if (schema[endIdx] === "{") depth++; else if (schema[endIdx] === "}") depth--; endIdx++ }; return textResponse(`=== Model: ${args.model} ===\n\nmodel ${args.model} ${schema.slice(braceIdx, endIdx)}`) }
          }
          const enumMatch = schema.match(new RegExp(`enum\\s+${modelName}\\s*\\{`, "i"))
          if (enumMatch) return textResponse(`=== Enum: ${args.model} ===\n\n可用的枚举值见不传参调用结果。`)
          return errorResponse(`未找到模型或枚举: ${args.model}。可用模型见不传参调用结果。`)
        }
        const models: Array<{ name: string; fieldCount: number }> = []
        const modelRegex = /model\s+(\w+)\s*\{/g; let m
        while ((m = modelRegex.exec(schema)) !== null) {
          const startIdx = m.index; const braceIdx = schema.indexOf("{", startIdx)
          if (braceIdx !== -1) { let depth = 1; let endIdx = braceIdx + 1; while (depth > 0 && endIdx < schema.length) { if (schema[endIdx] === "{") depth++; else if (schema[endIdx] === "}") depth--; endIdx++ }; const body = schema.slice(braceIdx, endIdx); const fieldCount = body.split("\n").filter((l: string) => l.trim() && !l.trim().startsWith("//") && !l.trim().startsWith("@@")).length; models.push({ name: m[1], fieldCount }) }
        }
        const enums: string[] = []; const enumRegex = /enum\s+(\w+)\s*\{/g
        while ((m = enumRegex.exec(schema)) !== null) { enums.push(m[1]) }
        const parts = ["=== Prisma Schema 概况 ===", "", `模型 (${models.length} 个):`]
        for (const model of models) parts.push(`  ${model.name} (${model.fieldCount} 字段)`)
        if (enums.length > 0) { parts.push(""); parts.push(`枚举 (${enums.length} 个): ${enums.join(", ")}`) }
        parts.push("", '提示: 指定 model 参数获取完整字段定义，例如: get_db_schema({ model: "User" })')
        return textResponse(parts.join("\n"))
      } catch (error) { return errorResponse(`获取 Schema 失败: ${error instanceof Error ? error.message : String(error)}`) }
    }
  )

  // ===== get_audit_logger_pattern (L524-612) =====
  server.registerTool(
    "get_audit_logger_pattern",
    {
      description: "获取指定域的审计日志器完整代码或模式（MCP-1 上下文优先）。历史域（'knowledge-base', 'agent'）返回已有的混合式日志器代码；新域返回三层分离式模板（ADD-4 三层可插拔架构）:\n- Layer 1 开发审计（dev-logger）: console + file + DB metadata，可插拔\n- Layer 2 运行时审计（audit）: console + AuditLog 表，始终开启\n- Layer 3 调试日志: console only，LOG_LEVEL 控制\n新业务域必须使用三层分离模式。",
      inputSchema: z.object({ domain: z.string().describe("审计日志器域: 'knowledge-base', 'agent'（历史混合式），或新域如 'personnel'（三层分离式）") }),
    },
    async (args: { domain: string }) => {
      try {
        const domain = args?.domain; if (!domain) return errorResponse("domain 参数不能为空")
        const filePath = (() => { switch(domain) { case "knowledge-base": return join(PROJECT_ROOT, "src", "lib", "audit-logger.ts"); case "agent": return join(PROJECT_ROOT, "src", "lib", "agent-audit-logger.ts"); default: return "" } })()
        if (filePath) {
          const content = await readFileSafe(filePath); if (!content) return errorResponse(`未找到 ${domain} 审计日志器文件: ${filePath}`)
          const meta: Record<string, { prefix: string; logDir: string; logFile: string }> = { "knowledge-base": { prefix: "[KB-AUDIT]", logDir: "logs/knowledge-base/", logFile: "kb-audit.log" }, "agent": { prefix: "[AGENT-AUDIT]", logDir: "logs/agent/", logFile: "agent-audit.log" } }
          const m = meta[domain]
          const parts = [`=== ${domain} 审计日志器（历史混合式，Layer 1 + Layer 2 未分离） ===`, `前缀: ${m.prefix}`, `日志目录: ${m.logDir}`, `日志文件: ${m.logFile}`, `文件路径: ${relative(PROJECT_ROOT, filePath)}`, "", "=== 完整代码 ===", content, "", "=== 模式要点 ===", "1. PREFIX 常量: [DOMAIN-AUDIT] 格式", `2. LOG_DIR: logs/domain/ 目录 (当前: ${m.logDir})`, "3. AuditPhase 类型: 枚举所有业务阶段", "4. audit() / auditPhaseStart() / auditPhaseEnd() 三函数", "5. readRecentLogs() / clearLogs() 读写函数", "6. ENABLE_FILE_LOG 环境变量控制，开发环境默认启用", "7. 三通道输出: console.log + fs.appendFile + 数据库回写", "", "⚠️ 注意: 这是历史混合式模式。新建业务域应使用三层分离模式（调用 generate_audit_logger 生成）。"]
          return textResponse(parts.join("\n"))
        }
        const featureCap = domain.split("-").map((s: string) => s.charAt(0).toUpperCase() + s.slice(1)).join("")
        const fnPrefix = featureCap.charAt(0).toLowerCase() + featureCap.slice(1)
        return textResponse(`=== ${domain} 三层分离式审计日志器（新模式，ADD-4） ===\n\n新建 ${domain} 业务域应调用 generate_audit_logger 生成两个文件：\n\n--- 文件1: src/lib/${domain}-dev-logger.ts (Layer 1 开发审计，可插拔) ---\n仅在 NODE_ENV=development 时生效，用于 AI 合规检查。\nADD-4 三通道输出:\n  1. console.log — ${fnPrefix}Audit / ${fnPrefix}AuditPhaseStart / ${fnPrefix}AuditPhaseEnd\n  2. fs.appendFile — writeToFile（自动）\n  3. DB metadata — build${featureCap}DevAudit() 构建记录 → 业务服务层 saveAuditData 写入\n包含函数: auditPhaseStart / auditPhaseEnd / audit / buildXxxDevAudit / readRecentLogs / clearLogs\n\n--- 文件2: src/lib/${domain}-audit.ts (Layer 2 运行时业务审计，不可插拔) ---\n始终开启，用于业务记录和前端查询。\nADD-4 三通道输出:\n  1. console.log — record${featureCap}Audit\n  2. fs.appendFile — (AuditLog 表替代文件写入)\n  3. DB AuditLog 表 — prisma.auditLog.create\n包含函数: record${featureCap}Audit()\n\n新建业务域必须使用三层分离模式（而非历史混合式）。详见项目规则 ADD-4「三层可插拔架构」。`)
      } catch (error) { return errorResponse(`获取审计日志器失败: ${error instanceof Error ? error.message : String(error)}`) }
    }
  )

  // ===== get_add_template (L1718-1780) =====
  server.registerTool(
    "get_add_template",
    {
      description: "获取 ADD 工作流的文档模板（ADD-0.1 广义文档先行）。ADD 范式要求每次生成文档产物前必须先读取对应模板，禁止凭记忆生成——模板可能在迭代中已更新。\n\n可用模板（12 个）:\n- plan-template.md — 需求方案\n- add-route-template.md — Plan→ADD 九阶段执行映射（轻量模式，适合前端/小项目）\n- add-route-template-heavyweight.md — Plan→ADD 九阶段执行映射（重型模式，适合后端/管线/合规场景，强制 check_spec_sync 文档-代码交叉校验）\n- spec-template.md — 功能规格\n- tasks-template.md — 任务拆分\n- checklist-template.md — 验收清单\n- review-template.md — 方案审查（ADD-9）\n- review-implementation-template.md — 实现审查（ADD-10）\n- review-runtime-template.md — 运行时纠偏（ADD-11）\n- handoff-template.md — 交接总览索引\n- handoff-single-round-template.md — 单轮交接（9 章节）\n- handoff-multi-round-template.md — 多轮交接（13 子章节/轮）\n\n本项目默认使用重型 add-route 模板。",
      inputSchema: z.object({ template: z.string().describe("模板名称（不含 .md 后缀），如 'plan-template', 'add-route-template', 'spec-template', 'review-template'。传 'list' 获取所有模板列表。") }),
    },
    async (args: { template: string }) => {
      try {
        const { template } = args; if (!template) return errorResponse("template 参数不能为空")
        const templatesDir = join(PROJECT_ROOT, MAGIC_DIR, "templates")
        if (template === "list") {
          const entries = await readdir(templatesDir); const mdFiles = entries.filter(f => f.endsWith(".md"))
          const parts = [`=== ADD 模板列表（${mdFiles.length} 个） ===`, ""]
          for (const f of mdFiles) { const content = await readFileSafe(join(templatesDir, f)); const firstLine = content?.split("\n")[0] || ""; const title = firstLine.replace(/^#+\s*/, "").trim() || f; parts.push(`  ${f.replace(".md", "")} — ${title}`) }
          parts.push("", '用法: get_add_template({ template: "plan-template" })'); return textResponse(parts.join("\n"))
        }
        const fileName = template.endsWith(".md") ? template : `${template}.md`
        const filePath = join(templatesDir, fileName)
        if (!existsSync(filePath)) return errorResponse(`未找到模板: ${fileName}\n可用模板请调用: get_add_template({ template: "list" })`)
        const content = await readFile(filePath, "utf-8")
        return textResponse([`=== ADD 模板: ${fileName} ===`, `路径: ${MAGIC_DIR}/templates/${fileName}`, "", content, "", "=== 使用提示 ===", "1. 复制模板到目标路径，替换 {占位符} 为实际内容", "2. 禁止凭记忆生成——模板可能在迭代中已更新", "3. 生成文档后调用 record_dev_operation 记录（targetType 视产物类型而定）"].join("\n"))
      } catch (error) { return errorResponse(`获取 ADD 模板失败: ${error instanceof Error ? error.message : String(error)}`) }
    }
  )

  // ===== get_spec_context (L1782-1873) =====
  server.registerTool(
    "get_spec_context",
    {
      description: `获取 ${MAGIC_DIR}/specs/ 下指定任务的 specs 三元组上下文（spec.md + tasks.md + checklist.md）。ADD 工作流中每个原子事务对应一个 specs 三元组目录，形成「需求→执行→验收」闭环。\n\nAI 助手在 ADD 范式 Step 3 执行业务逻辑时，应调用此工具获取当前任务的 spec/tasks/checklist 上下文，确保实现与规格一致。`,
      inputSchema: z.object({
        task: z.string().describe(`任务名（即 ${MAGIC_DIR}/specs/ 下的目录名），如 'co-agent-response-strategy'。传 'list' 获取所有任务列表。`),
        file: z.string().optional().describe("指定读取三元组中的某个文件: 'spec', 'tasks', 'checklist'。不传则返回全部三个文件。"),
      }),
    },
    async (args: { task: string; file?: string }) => {
      try {
        const { task, file } = args; if (!task) return errorResponse("task 参数不能为空")
        const specsDir = join(PROJECT_ROOT, MAGIC_DIR, "specs")
        if (task === "list") {
          const entries = await readdir(specsDir, { withFileTypes: true }); const dirs = entries.filter(e => e.isDirectory()).map(e => e.name)
          const parts = [`=== Specs 任务列表（${dirs.length} 个） ===`, ""]
          for (const dir of dirs) {
            const specPath = join(specsDir, dir, "spec.md"); const content = await readFileSafe(specPath)
            const firstLine = content?.split("\n")[0] || ""; const title = firstLine.replace(/^#+\s*/, "").trim() || dir
            const hasTasks = existsSync(join(specsDir, dir, "tasks.md")); const hasChecklist = existsSync(join(specsDir, dir, "checklist.md"))
            parts.push(`  ${(hasTasks && hasChecklist) ? "✅" : "⚠️ 不完整"} ${dir} — ${title}`)
          }
          parts.push("", '用法: get_spec_context({ task: "co-agent-response-strategy" })'); return textResponse(parts.join("\n"))
        }
        const taskDir = join(specsDir, task)
        if (!existsSync(taskDir)) return errorResponse(`未找到 specs 任务: ${task}\n可用任务请调用: get_spec_context({ task: "list" })`)
        const trinity: Record<string, string> = { spec: "spec.md", tasks: "tasks.md", checklist: "checklist.md" }
        const parts = [`=== Specs 三元组: ${task} ===`, `路径: ${MAGIC_DIR}/specs/${task}/`, ""]
        if (file && trinity[file]) {
          const fp = join(taskDir, trinity[file]); const content = await readFileSafe(fp)
          if (content) { parts.push(`=== ${trinity[file]} ===`); parts.push(content) } else { parts.push(`⚠️ ${trinity[file]} 不存在`) }
        } else {
          for (const [_key, fn] of Object.entries(trinity)) { const fp = join(taskDir, fn); const content = await readFileSafe(fp); if (content) { parts.push(`=== ${fn} ===`); parts.push(content); parts.push("") } else { parts.push(`⚠️ ${fn} 不存在（三元组不完整）`); parts.push("") } }
        }
        return textResponse(parts.join("\n"))
      } catch (error) { return errorResponse(`获取 Spec 上下文失败: ${error instanceof Error ? error.message : String(error)}`) }
    }
  )

}
