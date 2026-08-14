import * as z from "zod/v4"
import type { ToolRegistrar } from "./registrar.js"
import { readFile } from "fs/promises"
import { readdir } from "fs/promises"
import { stat } from "fs/promises"
import { existsSync } from "fs"
import { join, relative } from "path"
import { textResponse, errorResponse } from "../shared/response.js"
import { readFileSafe } from "../shared/fs.js"
import { PROJECT_ROOT, MAGIC_DIR } from "../shared/fs.js"
import { prisma } from "../shared/prisma.js"
import type { PlanRow, ReviewRow } from "../shared/db-types.js"
import { PlanRowSchema, ReviewRowSchema, validatedDelegate } from "../shared/db-types.js"
import { getRuntimeContext } from "../shared/env.js"
import { resolvePlanStatus } from "../shared/plan-lifecycle.js"
import { createPrismaPlanStatusStore } from "../shared/plan-status-store.js"
import { assertPathInRuntimeScope } from "../shared/runtime-context.js"
import {
  formatSchemaTopology,
  loadPrismaSchemaTopology,
  type SchemaView,
} from "../shared/schema-topology.js"

export function registerContextTools(server: ToolRegistrar) {
  const runtimeContext = getRuntimeContext()

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
          parts.push(`contextId: ${runtimeContext.contextId}`)
          parts.push("source: database")

          const planDb = validatedDelegate<PlanRow>(prisma.planRecord, PlanRowSchema, "PlanRecord")
          const reviewDb = validatedDelegate<ReviewRow>(prisma.reviewRecord, ReviewRowSchema, "ReviewRecord")
          const resolution = await resolvePlanStatus(
            createPrismaPlanStatusStore(prisma),
            runtimeContext,
            { activeOnly: true },
          )
          let activePlan: PlanRow | null = null
          let reviewRows: ReviewRow[] = []
          if (resolution.availability === "STATUS_UNAVAILABLE") {
            parts.push(`状态: ⛔ STATUS_UNAVAILABLE — ${resolution.reason}`)
            parts.push("裁决: fail closed；未回退 Plan/Handoff/add-route 文件猜测")
          } else if (resolution.planName === null) {
            parts.push("活跃 Plan: 无（DB lifecycle 无 ACTIVE/BLOCKED）")
          } else {
            activePlan = await planDb.findFirst({
              where: {
                projectKey: runtimeContext.projectKey,
                adapterKey: runtimeContext.adapterKey,
                planName: resolution.planName,
              },
            })
            if (!activePlan) throw new Error(`resolver 返回 Plan 后记录消失: ${resolution.planName}`)
            assertPathInRuntimeScope(runtimeContext, activePlan.planPath)
            parts.push(`活跃 Plan: ${activePlan.planName}`)
            parts.push(` lifecycle: ${resolution.lifecycle} | revision: ${resolution.revision}`)
            parts.push(` approval: ${resolution.approvalStatus ?? "—"}`)
            parts.push(` tasks: ${resolution.progress.doneTasks}/${resolution.progress.totalTasks}`)
            parts.push(` Plan: ${activePlan.planPath}`)
            parts.push(` add-route: ${activePlan.addRoutePath && existsSync(activePlan.addRoutePath) ? `✅ ${activePlan.addRoutePath}` : "❌ 缺失"}`)
            parts.push(" handoff: 不参与 active 裁决（仅 Step 8 交接产物）")
            parts.push("")
            parts.push("Specs:")
            parts.push(` spec.md: ${activePlan.specPath && existsSync(activePlan.specPath) ? "✅" : "❌"}`)
            parts.push(` tasks.md: ${activePlan.tasksPath && existsSync(activePlan.tasksPath) ? "✅" : "❌"}`)
            parts.push(` checklist.md: ${activePlan.checklistPath && existsSync(activePlan.checklistPath) ? "✅" : "❌"}`)
            reviewRows = await reviewDb.findMany({
              where: {
                projectKey: runtimeContext.projectKey,
                adapterKey: runtimeContext.adapterKey,
                planName: activePlan.planName,
              },
              orderBy: { updatedAt: "desc" },
            })
            parts.push("")
            if (reviewRows.length === 0) {
              parts.push("关联 Review: 无")
            } else {
              parts.push(`关联 Review: ${reviewRows.length} 条（DB scoped）`)
              for (const review of reviewRows) {
                parts.push(`  ${review.type}: P0=${review.p0Count}, P1=${review.p1Count}, backflow=${review.backflowRate}`)
              }
            }
          }

          parts.push(""); parts.push("=== 悬空 Plan 对账（记录在、文件缺失） ===")
          try {
            const allPlans = await planDb.findMany({
              where: {
                projectKey: runtimeContext.projectKey,
                adapterKey: runtimeContext.adapterKey,
              },
              orderBy: { createdAt: "desc" },
            })
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
          if (resolution.availability === "STATUS_UNAVAILABLE") {
            todoItems.push("1. [阻断] 恢复 DB/MCP resolver；禁止按文件继续")
          } else if (!activePlan) { todoItems.push("1. [未开始] 用户提出需求 → 生成 Plan + HITL") }
          else if (resolution.planName !== null) {
            if (resolution.approvalStatus !== "TONGYI") todoItems.push("1. [HITL] 完成当前 Plan 审批")
            if (reviewRows.length === 0) todoItems.push("2. [Step 0] 生成并追踪 Plan Review")
            if (reviewRows.some(review => review.p0Count + review.p1Count > 0 && review.backflowRate === 0)) {
              todoItems.push("3. [0.6.5] Review P0/P1 回流至 Plan")
            }
            if (!activePlan.addRoutePath || !existsSync(activePlan.addRoutePath)) todoItems.push("4. [Step 0.5] 生成 add-route")
            if (!activePlan.specPath || !activePlan.tasksPath || !activePlan.checklistPath) todoItems.push("5. [Step 0] 补齐 Specs 三元组")
            if (activePlan.doneTasks < activePlan.totalTasks) todoItems.push(`6. [实施] 继续未完成 Task（${activePlan.doneTasks}/${activePlan.totalTasks}）`)
            if (todoItems.length === 0) todoItems.push("✅ DB lifecycle 与文档链已就绪，可进入 Review/closure")
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
      description: "获取 topology-aware Prisma Schema。兼容单库多文件 schema folder 与 ADD_DATABASE_URL 分库；返回扫描文件、数据库边界、模型来源和诊断。",
      inputSchema: z.object({
        model: z.string().optional().describe("可选模型或枚举名称（不区分大小写）"),
        view: z.enum(["business", "add", "all"]).optional().default("all").describe("Schema 视图；分库时 all 仅分组汇总，不表示可跨库 join"),
      }),
    },
    async (args: { model?: string; view?: SchemaView }) => {
      try {
        const topology = await loadPrismaSchemaTopology({
          projectRoot: PROJECT_ROOT,
          splitDatabase: Boolean(process.env.ADD_DATABASE_URL?.trim()),
          view: args?.view ?? "all",
        })
        const requested = args?.model?.trim().toLowerCase()
        if (requested) {
          const declaration = [...topology.models, ...topology.enums]
            .find(item => item.name.toLowerCase() === requested)
          if (!declaration) {
            return errorResponse(`未在 view=${topology.view} 找到模型或枚举: ${args.model}。扫描: ${topology.files.map(file => file.file).join(", ")}`)
          }
          return textResponse([
            `=== ${declaration.kind === "model" ? "Model" : "Enum"}: ${declaration.name} ===`,
            `mode: ${topology.mode}`,
            `view: ${topology.view}`,
            `boundary: ${declaration.boundary}`,
            `source: ${relative(PROJECT_ROOT, declaration.sourcePath)}`,
            "",
            `${declaration.kind} ${declaration.name} ${declaration.body}`,
          ].join("\n"))
        }
        return textResponse([
          formatSchemaTopology(topology, PROJECT_ROOT),
          "",
          '提示: 指定 model/view 获取完整定义，例如 get_db_schema({ model: "PlanRecord", view: "add" })',
        ].join("\n"))
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
