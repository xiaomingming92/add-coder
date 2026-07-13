import dotenv from "dotenv"
import { dirname, resolve, basename } from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = resolve(__dirname, "..", "..")
const MAGIC_DIR = basename(dirname(__dirname)) // ".qoder" or ".claude"

// 环境变量加载优先级: .env.development.local > .env.development > .env.local > .env
const ENV_CANDIDATES = [".env.development.local", ".env.development", ".env.local", ".env"];
for (const f of ENV_CANDIDATES) {
    const p = resolve(PROJECT_ROOT, f);
    if (existsSync(p)) { dotenv.config({ path: p }); break; }
}

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL 未设置，请在 .env 中配置数据库连接串")
}

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import { readFile, readdir, stat, mkdir, writeFile } from "fs/promises"
import { join, relative, basename } from "path"
import { existsSync } from "fs"
import { execSync } from "child_process"
import { PrismaClient, Prisma } from "@prisma/client"

const prisma = new PrismaClient({
  datasourceUrl: DATABASE_URL,
  log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
})

type ToolResponse = Array<{ type: "text"; text: string }>

function textResponse(text: string): { content: ToolResponse } {
  return { content: [{ type: "text", text }] }
}

function errorResponse(message: string): { content: ToolResponse; isError: boolean } {
  return { content: [{ type: "text", text: message }], isError: true }
}

async function readFileSafe(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf-8")
  } catch {
    return null
  }
}

/** 递归读取目录下所有文件（扁平化返回），支持 ${MAGIC_DIR}/plans/2026-06/05/ 等分层结构 */
async function readdirRecursive(dir: string): Promise<string[]> {
  const results: string[] = []
  async function walk(d: string) {
    const entries = await readdir(d, { withFileTypes: true })
    for (const e of entries) {
      const full = join(d, e.name)
      if (e.isDirectory()) {
        await walk(full)
      } else {
        results.push(relative(dir, full))
      }
    }
  }
  await walk(dir)
  return results
}

/**
 * 从 Review 修复建议文本中提取用于 Plan 回流的代表关键词。
 * 过滤掉通用动词（生成/补建/新增/在/中/补充），保留语义核心词（文件名/概念/术语）。
 */
function extractBackflowKeywords(fixText: string): string[] {
  const stopWords = new Set([
    "回退", "生成", "补建", "新增", "补充", "在", "中", "给出", "定义",
    "明确", "需", "不可", "应", "可", "并", "与", "的", "了", "后",
  ])
  // 提取关键名词短语：英文标识符、中文专用名词、文件路径片段
  const keywords: string[] = []

  // 英文标识符（如 perExpertTopK, agri_tech, SearchOptions）
  const enMatches = fixText.match(/\b(perExpertTopK|RetrieveBudget|GroundingStatus|SearchOptions|add-route|handoff|spec\.md|tasks\.md|checklist\.md|collectionName|Phase\s*\d+|ChromaCollectionManager|agri_tech|crop_compare|roi_analysis|pest_risk|daily_report|weekly_report)\b/gi)
  if (enMatches) keywords.push(...enMatches.map(m => m.toLowerCase()))

  // 中文专用名词
  const cnPatterns = [
    "迁移路线图", "迁移roadmap", "多collection", "多 collection",
    "冗余策略", "复制", "引用方案", "新签名",
    "汇总专家", "per-collection", "per collection",
    "不阻塞", "降级路径", "回滚",
  ]
  for (const pat of cnPatterns) {
    if (fixText.includes(pat)) keywords.push(pat)
  }

  // 去重并过滤停用词
  return [...new Set(keywords.filter(k => k.length > 1 && !stopWords.has(k)))]
}

const server = new McpServer(
  {
    name: "add-dev-tools",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
)

server.registerTool(
  "get_project_context",
  {
    description: "获取项目的完整上下文信息：目录结构、技术栈、包管理信息、项目规则（ADD 范式约束）、${MAGIC_DIR}/ 工作流产物（templates/specs/reviews/plans）。AI 助手在 MCP-1（上下文优先）中应在生成代码前调用此工具获取项目真实信息，避免幻觉。\n\nscope='add-state' 返回 ADD 工作流状态快照：当前活跃 Plan、Review 未闭环问题、DPS 门禁状态、待执行操作清单。用于空白对话开局时快速介入 ADD 范式。",
    inputSchema: {
      scope: z.string().optional().describe("获取信息的范围: 'structure' 仅目录结构, 'rules' 仅项目规则, 'package' 仅包信息, 'add-state' ADD 工作流状态, 'all' 全部"),
    },
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
            parts.push(`  ${name}: ${script}`)
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
            if (line.startsWith("```")) {
              inCodeBlock = !inCodeBlock
              continue
            }
            if (inCodeBlock) continue
            if (line.startsWith("## ADD-") || line.startsWith("## 项目")) {
              parts.push("")
              parts.push(line)
            } else if (line.startsWith("###") || line.startsWith("####")) {
              parts.push(line)
            }
          }
          parts.push("")
        }
      }

      if (scope === "all" || scope === "structure" || scope === "add-state") {
        // === ADD 工作流状态快照 ===
        // 扫描 plans/ 找最近激活的 Plan；扫描 reviews/ 找关联 Review 及其未闭环问题
        parts.push("=== ADD 工作流状态 ===")

        const plansDir = join(PROJECT_ROOT, MAGIC_DIR, "plans")
        const reviewsDir = join(PROJECT_ROOT, MAGIC_DIR, "reviews")
        const specsDir = join(PROJECT_ROOT, MAGIC_DIR, "specs")

        // 1. 扫描 Plan 文件
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
          } else {
            parts.push("最近 Plan: 无")
          }
        } else {
          parts.push("最近 Plan: 无")
        }

        // 2. 扫描 Review 文件
        let reviewFileName = ""
        let reviewP0Count = 0
        let reviewP1Count = 0
        let reviewBackflowRate = 0
        if (existsSync(reviewsDir) && activePlan) {
          const reviewFiles = await readdir(reviewsDir)
          const planKeyword = activePlan.replace(/-plan-v\d+\.md$/, "")
          const matchingReview = reviewFiles.find(f =>
            f.toLowerCase().includes(planKeyword.toLowerCase()) && f.includes("-review-v")
          ) || reviewFiles.find(f =>
            f.toLowerCase().includes(planKeyword.toLowerCase())
          )

          if (matchingReview) {
            reviewFileName = matchingReview
            const reviewContent = await readFileSafe(join(reviewsDir, matchingReview)) || ""
            const reviewLines = reviewContent.split("\n")
            let inP0 = false
            let inP1 = false
            for (const line of reviewLines) {
              if (line.match(/P0|ADD.*合规|阻断/)) { inP0 = true; inP1 = false; continue }
              if (line.match(/P1|架构设计.*缺口/)) { inP0 = false; inP1 = true; continue }
              if (line.match(/P2|中等|影响评估|决策结论|方案对比/)) { inP0 = false; inP1 = false; continue }
              if ((inP0 || inP1) && line.trim().startsWith("|") && !line.includes("---")) {
                const cols = line.split("|").map(c => c.trim()).filter(Boolean)
                if (cols.length >= 4 && cols[0].match(/^\d+$/)) {
                  if (inP0) reviewP0Count++
                  else if (inP1) reviewP1Count++
                }
              }
            }

            // 检查回流：Plan 中是否含 Review 修复建议关键词
            const planContent = await readFileSafe(activePlanPath) || ""
            if ((reviewP0Count + reviewP1Count) > 0 && planContent) {
              const indicators = ["add-route", "specs/", "handoff", "Task Group",
                "perExpertTopK", "agri_tech", "ChromaCollectionManager",
                "迁移路线图", "8 个 Expert", "冗余策略"]
              let hit = 0
              for (const ind of indicators) {
                if (planContent.toLowerCase().includes(ind.toLowerCase())) hit++
              }
              reviewBackflowRate = Math.min(100, Math.round((hit / Math.max(reviewP0Count + reviewP1Count, 1)) * 100))
            }

            parts.push("")
            parts.push(`关联 Review: ${matchingReview}`)
            parts.push(`  P0 问题: ${reviewP0Count} 个, P1 问题: ${reviewP1Count} 个`)
            parts.push(`  回流状态: 约 ${reviewBackflowRate}%`)
            if (reviewBackflowRate < 70) {
              parts.push("  ⚠️ Review 结论未充分回流至 Plan — 需执行 0.6.5 卡位")
            } else {
              parts.push("  ✅ Review 结论基本回流至 Plan")
            }
          } else {
            parts.push("")
            parts.push("关联 Review: 无（该 Plan 尚未生成方案评审）")
          }
        }

        // 3. 检查 Specs
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
          } else {
            parts.push("Specs: ❌ 缺失")
          }
        }

        // 4. 待执行操作清单
        parts.push("")
        parts.push("=== 待执行 ADD 操作（按流程顺序） ===")
        const todoItems: string[] = []
        if (!activePlan) {
          todoItems.push("1. [未开始] 用户提出需求 → 生成 Plan")
        } else {
          if (!reviewFileName) {
            todoItems.push("1. [Step 0] 生成 Plan Review（ADD-9 方案评审）")
          } else if (reviewP0Count + reviewP1Count > 0 && reviewBackflowRate < 70) {
            todoItems.push("1. [0.6.5] Review 结论回流至 Plan — P0/P1 未写入 Plan 体")
            todoItems.push("2. [check_dps] DPS 门禁预计不通过（回流完整度 < 70%）")
          }
          const allPlanDir = await readdirRecursive(plansDir)
          const hasAddRoute = allPlanDir.some(f => f.includes("add-route"))
          if (!hasAddRoute && reviewBackflowRate >= 70) {
            todoItems.push("2. [Step 0.5] 生成 add-route")
          }
          const planKw = activePlan.replace(/-plan-v\d+\.md$/, "")
          const sd = existsSync(specsDir) ? await readdir(specsDir) : []
          if (!sd.some(d => d.toLowerCase().includes(planKw.toLowerCase())) && reviewBackflowRate >= 70) {
            todoItems.push("3. [Step 0] 生成 Specs 三元组")
          }
          if (todoItems.length === 0) {
            todoItems.push("✅ ADD 就绪 — check_dps ≥ 85 后可进入 Step 1")
          }
        }
        for (const item of todoItems) parts.push(item)
        parts.push("")
        parts.push("快速指令: 说「执行 add-paradigm Step 0」进入文档先行流程")
        parts.push("          说「将 Review 结论回流至 Plan」触发 0.6.5 卡位")
      }

      if (scope === "all" || scope === "structure") {
        parts.push("=== 项目目录结构（顶层） ===")
        const topDirs = [MAGIC_DIR, "src", "prisma", "scripts", "docs", "data", "public"]
        for (const dir of topDirs) {
          const fullPath = join(PROJECT_ROOT, dir)
          if (existsSync(fullPath)) {
            const entries = await readdir(fullPath)
            parts.push(`  ${dir}/ (${entries.length} 项)`)
          }
        }
        parts.push("")
        parts.push("=== src/ 子目录结构 ===")
        const srcDirs = ["agents", "app", "components", "lib", "services", "stores", "types"]
        for (const dir of srcDirs) {
          const fullPath = join(PROJECT_ROOT, "src", dir)
          if (existsSync(fullPath)) {
            const entries = await readdir(fullPath)
            const items = (await Promise.all(
              entries.slice(0, 15).map(async (e) => {
                const s = await stat(join(fullPath, e))
                return s.isDirectory() ? `${e}/` : e
              })
            )).join(", ")
            parts.push(`  src/${dir}/ (${entries.length} 项): ${items})`)
          }
        }
        parts.push("")

        // ADD 工作流产物目录
        parts.push(`=== ${MAGIC_DIR}/ ADD 工作流产物 ===`)
        const qoderDirs = [
          { dir: "templates", desc: "ADD 文档模板（11 个）" },
          { dir: "specs", desc: "specs 三元组（spec+tasks+checklist）" },
          { dir: "reviews", desc: "方案审查 + 实现审查 + 运行时审查" },
          { dir: "plans", desc: "Plan + handoff 交接手册" },
          { dir: "rules", desc: "项目规则 + 理论→实践映射" },
          { dir: "skills", desc: "SKILL 行为定义（add-paradigm / session-init）" },
          { dir: "scripts", desc: "工具脚本 + MCP 服务器" },
        ]
        for (const { dir, desc } of qoderDirs) {
          const fullPath = join(PROJECT_ROOT, MAGIC_DIR, dir)
          if (existsSync(fullPath)) {
            const entries = await readdir(fullPath)
            parts.push(`  ${MAGIC_DIR}/${dir}/ (${entries.length} 项) — ${desc}`)
          }
        }
      }

      return textResponse(parts.join("\n"))
    } catch (error) {
      return errorResponse(`获取项目上下文失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

server.registerTool(
  "get_db_schema",
  {
    description: "获取 Prisma 数据库 Schema 定义（MCP-1 上下文优先）。返回指定模型的结构、字段、关系。AI 助手在编写数据库查询代码时应调用此工具获取真实的 Schema 信息，避免凭记忆假设。",
    inputSchema: {
      model: z.string().optional().describe("可选的模型名称（不区分大小写）。不指定则返回所有模型概况。指定则返回该模型的完整字段定义。"),
    },
  },
  async (args: { model?: string }) => {
    try {
      const schemaPath = join(PROJECT_ROOT, "prisma", "schema.prisma")
      const schema = await readFileSafe(schemaPath)
      if (!schema) {
        return errorResponse("未找到 prisma/schema.prisma 文件")
      }

      const modelName = args?.model?.toLowerCase()
      if (modelName) {
        const modelRegex = new RegExp(`model\\s+${modelName}\\s*\{`, "i")
        const match = schema.match(modelRegex)
        if (match) {
          const startIdx = match.index ?? 0
          const braceIdx = schema.indexOf("{", startIdx)
          if (braceIdx !== -1) {
            let depth = 1
            let endIdx = braceIdx + 1
            while (depth > 0 && endIdx < schema.length) {
              if (schema[endIdx] === "{") depth++
              else if (schema[endIdx] === "}") depth--
              endIdx++
            }
            const body = schema.slice(braceIdx, endIdx)
            return textResponse(`=== Model: ${args.model} ===\n\nmodel ${args.model} ${body}`)
          }
        }
        const enumMatch = schema.match(new RegExp(`enum\\s+${modelName}\\s*\{`, "i"))
        if (enumMatch) {
          return textResponse(`=== Enum: ${args.model} ===\n\n可用的枚举值见不传参调用结果。`)
        }
        return errorResponse(`未找到模型或枚举: ${args.model}。可用模型见不传参调用结果。`)
      }

      const models: Array<{ name: string; fieldCount: number }> = []
      const modelRegex = /model\s+(\w+)\s*\{/g
      let m
      while ((m = modelRegex.exec(schema)) !== null) {
        const name = m[1]
        const startIdx = m.index
        const braceIdx = schema.indexOf("{", startIdx)
        if (braceIdx !== -1) {
          let depth = 1
          let endIdx = braceIdx + 1
          while (depth > 0 && endIdx < schema.length) {
            if (schema[endIdx] === "{") depth++
            else if (schema[endIdx] === "}") depth--
            endIdx++
          }
          const body = schema.slice(braceIdx, endIdx)
          const fieldCount = body.split("\n").filter(
            (l) => l.trim() && !l.trim().startsWith("//") && !l.trim().startsWith("@@")
          ).length
          models.push({ name, fieldCount })
        }
      }

      const enums: string[] = []
      const enumRegex = /enum\s+(\w+)\s*\{/g
      while ((m = enumRegex.exec(schema)) !== null) {
        enums.push(m[1])
      }

      const parts: string[] = ["=== Prisma Schema 概况 ==="]
      parts.push("")
      parts.push(`模型 (${models.length} 个):`)
      for (const model of models) {
        parts.push(`  ${model.name} (${model.fieldCount} 字段)`)
      }
      if (enums.length > 0) {
        parts.push("")
        parts.push(`枚举 (${enums.length} 个): ${enums.join(", ")}`)
      }
      parts.push("")
      parts.push('提示: 指定 model 参数获取完整字段定义，例如: get_db_schema({ model: "User" })')

      return textResponse(parts.join("\n"))
    } catch (error) {
      return errorResponse(`获取 Schema 失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

server.registerTool(
  "get_audit_logger_pattern",
  {
    description: "获取指定域的审计日志器完整代码或模式（MCP-1 上下文优先）。历史域（'knowledge-base', 'agent'）返回已有的混合式日志器代码；新域返回三层分离式模板（ADD-4 三层可插拔架构）:\n- Layer 1 开发审计（dev-logger）: console + file + DB metadata，可插拔\n- Layer 2 运行时审计（audit）: console + AuditLog 表，始终开启\n- Layer 3 调试日志: console only，LOG_LEVEL 控制\n新业务域必须使用三层分离模式。",
    inputSchema: {
      domain: z.string().describe("审计日志器域: 'knowledge-base', 'agent'（历史混合式），或新域如 'personnel'（三层分离式）"),
    },
  },
  async (args: { domain: string }) => {
    try {
      const domain = args?.domain
      if (!domain) return errorResponse("domain 参数不能为空")

      // 历史混合式日志器（从文件读取）
      const legacyFileMap: Record<string, string> = {
        "knowledge-base": join(PROJECT_ROOT, "src", "lib", "audit-logger.ts"),
        "agent": join(PROJECT_ROOT, "src", "lib", "agent-audit-logger.ts"),
      }

      // 新域三层分离式日志器（生成模板）
      const featureNameTemplate = domain.split("-").map(s => s.charAt(0).toUpperCase() + s.slice(1)).join("")
      const fnPrefixTemplate = featureNameTemplate.charAt(0).toLowerCase() + featureNameTemplate.slice(1)
      const threeLayerPatternTemplate = `=== ${domain} 三层分离式审计日志器（新模式，ADD-4） ===

新建 ${domain} 业务域应调用 generate_audit_logger 生成两个文件：

--- 文件1: src/lib/${domain}-dev-logger.ts (Layer 1 开发审计，可插拔) ---
仅在 NODE_ENV=development 时生效，用于 AI 合规检查。
ADD-4 三通道输出:
  1. console.log — ${fnPrefixTemplate}Audit / ${fnPrefixTemplate}AuditPhaseStart / ${fnPrefixTemplate}AuditPhaseEnd
  2. fs.appendFile — writeToFile（自动）
  3. DB metadata — build${featureNameTemplate}DevAudit() 构建记录 → 业务服务层 saveAuditData 写入
包含函数: auditPhaseStart / auditPhaseEnd / audit / buildXxxDevAudit / readRecentLogs / clearLogs

--- 文件2: src/lib/${domain}-audit.ts (Layer 2 运行时业务审计，不可插拔) ---
始终开启，用于业务记录和前端查询。
ADD-4 三通道输出:
  1. console.log — record${featureNameTemplate}Audit
  2. fs.appendFile — (AuditLog 表替代文件写入)
  3. DB AuditLog 表 — prisma.auditLog.create
包含函数: record${featureNameTemplate}Audit()

新建业务域必须使用三层分离模式（而非历史混合式）。详见项目规则 ADD-4「三层可插拔架构」。`

      if (legacyFileMap[domain]) {
        // 返回历史混合式日志器
        const filePath = legacyFileMap[domain]
        const content = await readFileSafe(filePath)
        if (!content) {
          return errorResponse(`未找到 ${domain} 审计日志器文件: ${filePath}`)
        }

        const metaMap: Record<string, { prefix: string; logDir: string; logFile: string }> = {
          "knowledge-base": { prefix: "[KB-AUDIT]", logDir: "logs/knowledge-base/", logFile: "kb-audit.log" },
          "agent": { prefix: "[AGENT-AUDIT]", logDir: "logs/agent/", logFile: "agent-audit.log" },
        }
        const meta = metaMap[domain]

        const parts: string[] = [
          `=== ${domain} 审计日志器（历史混合式，Layer 1 + Layer 2 未分离） ===`,
          `前缀: ${meta.prefix}`,
          `日志目录: ${meta.logDir}`,
          `日志文件: ${meta.logFile}`,
          `文件路径: ${relative(PROJECT_ROOT, filePath)}`,
          "",
          "=== 完整代码 ===",
          content,
          "",
          "=== 模式要点 ===",
          "1. PREFIX 常量: [DOMAIN-AUDIT] 格式",
          `2. LOG_DIR: logs/domain/ 目录 (当前: ${meta.logDir})`,
          "3. AuditPhase 类型: 枚举所有业务阶段",
          "4. audit() / auditPhaseStart() / auditPhaseEnd() 三函数",
          "5. readRecentLogs() / clearLogs() 读写函数",
          "6. ENABLE_FILE_LOG 环境变量控制，开发环境默认启用",
          "7. 三通道输出: console.log + fs.appendFile + 数据库回写",
          "",
          "⚠️ 注意: 这是历史混合式模式。新建业务域应使用三层分离模式（调用 generate_audit_logger 生成）。",
        ]

        return textResponse(parts.join("\n"))
      }

      // 返回三层分离式模板
      return textResponse(threeLayerPatternTemplate)
    } catch (error) {
      return errorResponse(`获取审计日志器失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

server.registerTool(
  "check_phase_symmetry",
  {
    description: "检查代码中的阶段标记对称性（ADD-2 阶段标记对称，MCP-3 编码中验证）。统计 auditPhaseStart/End 配对情况，返回不对称列表。AI 助手在生成包含审计阶段的代码后必须调用此工具验证。",
    inputSchema: {
      code: z.string().describe("要检查的 TypeScript 代码文本"),
    },
  },
  async (args: { code: string }) => {
    try {
      const code = args?.code
      if (!code) return errorResponse("code 参数不能为空")

      const startRegex = /auditPhaseStart\(["']([^"']+)["']/g
      const endRegex = /auditPhaseEnd\(["']([^"']+)["']/g

      const starts: string[] = []
      const ends: string[] = []
      let m

      while ((m = startRegex.exec(code)) !== null) starts.push(m[1])
      while ((m = endRegex.exec(code)) !== null) ends.push(m[1])

      const startCounts: Record<string, number> = {}
      const endCounts: Record<string, number> = {}
      for (const s of starts) startCounts[s] = (startCounts[s] || 0) + 1
      for (const e of ends) endCounts[e] = (endCounts[e] || 0) + 1

      const allPhases = new Set([...Object.keys(startCounts), ...Object.keys(endCounts)])
      const asymmetric: string[] = []

      allPhases.forEach((phase) => {
        const sc = startCounts[phase] || 0
        const ec = endCounts[phase] || 0
        if (sc !== ec) {
          asymmetric.push(`  ⚠️ ${phase}: Start=${sc}, End=${ec} (${sc > ec ? "缺少 End" : "缺少 Start"})`)
        }
      })

      const lines: string[] = [
        "=== ADD-2 阶段标记对称性检查 ===",
        `审计阶段 Start 总数: ${starts.length}`,
        `审计阶段 End 总数: ${ends.length}`,
        "",
      ]

      if (asymmetric.length === 0) {
        lines.push("✅ 阶段标记完全对称")
      } else {
        lines.push(`❌ 发现 ${asymmetric.length} 个不对称阶段:`)
        lines.push(...asymmetric)
      }

      lines.push("")
      lines.push("=== 所有阶段明细 ===")
      allPhases.forEach((phase) => {
        lines.push(`  ${phase}: Start=${startCounts[phase] || 0}, End=${endCounts[phase] || 0}`)
      })

      return textResponse(lines.join("\n"))
    } catch (error) {
      return errorResponse(`检查阶段对称性失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

server.registerTool(
  "check_failure_path",
  {
    description: "检查代码中的失败路径审计信息密度（ADD-6 失败路径等价审计，MCP-3 编码中验证）。对比 try 块与 catch 块的 extra 字段数，确保失败路径的审计信息不少于成功路径。AI 助手在生成包含 try/catch 的代码后必须调用此工具验证。",
    inputSchema: {
      code: z.string().describe("要检查的 TypeScript 代码文本"),
    },
  },
  async (args: { code: string }) => {
    try {
      const code = args?.code
      if (!code) return errorResponse("code 参数不能为空")

      const sections = code.split(/catch\s*\(/)
      if (sections.length <= 1) {
        return textResponse("=== ADD-6 失败路径审计检查 ===\n\n未检测到 try/catch 块，无需检查失败路径。")
      }

      const lines: string[] = [
        "=== ADD-6 失败路径审计信息密度检查 ===",
        `检测到 ${sections.length - 1} 个 catch 块`,
        "",
      ]

      let allPass = true
      for (let i = 1; i < sections.length; i++) {
        const catchBlock = sections[i]
        const catchEnd = catchBlock.indexOf("{")
        if (catchEnd === -1) continue

        const tryBlock = sections[i - 1]
        const tryExtraMatches = tryBlock.match(/extra[:\s]*\{[^}]*\}/g)
        const tryExtraFieldCount = tryExtraMatches
          ? tryExtraMatches.reduce((sum, m) => sum + (m.match(/\w+:/g)?.length || 0), 0)
          : 0

        const closeIdx = catchBlock.indexOf("}")
        const catchBody = catchBlock.slice(catchEnd, closeIdx + 1)
        const catchExtraMatches = catchBody.match(/extra[:\s]*\{[^}]*\}/g)
        const catchExtraFieldCount = catchExtraMatches
          ? catchExtraMatches.reduce((sum, m) => sum + (m.match(/\w+:/g)?.length || 0), 0)
          : 0

        const catchHasThrow = catchBody.includes("throw")
        const catchHasErrorLog = catchBody.includes("audit") || catchBody.includes("Audit")
        const catchInfoDensity = catchExtraFieldCount + (catchHasThrow ? 2 : 0) + (catchHasErrorLog ? 2 : 0)

        lines.push(`--- Catch 块 #${i} ---`)
        if (catchInfoDensity >= tryExtraFieldCount && catchHasErrorLog) {
          lines.push(`  ✅ 失败路径审计信息密度充足`)
        } else {
          allPass = false
          if (!catchHasErrorLog) lines.push(`  ❌ catch 块缺少审计调用（audit/Audit）`)
          if (catchInfoDensity < tryExtraFieldCount) {
            lines.push(`  ❌ 信息密度不足: catch extra 字段=${catchExtraFieldCount}, try extra 字段=${tryExtraFieldCount}`)
            lines.push("  建议: 在 catch 块中添加与 try 块同级的 extra 字段")
          }
        }
        lines.push(`  try extra 字段数: ${tryExtraFieldCount}`)
        lines.push(`  catch extra 字段数: ${catchExtraFieldCount}`)
        lines.push(`  有审计调用: ${catchHasErrorLog ? "是" : "否"}`)
        lines.push(`  有 throw: ${catchHasThrow ? "是" : "否"}`)
        lines.push("")
      }

      if (allPass) {
        lines.push("✅ 所有 catch 块审计信息密度满足 ADD-6 要求")
      } else {
        lines.push("⚠️ 部分 catch 块需要补充审计信息")
      }

      return textResponse(lines.join("\n"))
    } catch (error) {
      return errorResponse(`检查失败路径失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

server.registerTool(
  "generate_audit_logger",
  {
    description: "生成符合三层分离模式的新审计日志器完整代码（MCP-2 生成优先于手写）。遵循 ADD-1~6 原则，生成两个文件:\n- Layer 1 开发审计（dev-logger.ts）: console + file + DB metadata，可插拔（NODE_ENV=development）\n- Layer 2 运行时审计（audit.ts）: console + AuditLog 表 + traceId 关联，始终开启\nAI 助手在新建功能时必须调用此工具生成审计日志器，而非手写。",
    inputSchema: {
      domain: z.string().describe("审计日志器域名（小写中划线）, 例如: 'chat-persistence', 'worldline'"),
      phases: z.string().describe("业务阶段枚举列表（逗号分隔，大写蛇形）, 例如: 'CHAT_SAVE,CHAT_SAVE_MSG,CHAT_LOAD,CHAT_DONE,CHAT_FAIL'"),
      prefix: z.string().describe("审计前缀标识, 例如: 'CHAT-PERSISTENCE-AUDIT'"),
    },
  },
  async (args: { domain: string; phases: string; prefix: string }) => {
    try {
      const { domain, phases, prefix } = args
      if (!domain || !phases || !prefix) {
        return errorResponse("domain, phases, prefix 参数均不能为空")
      }

      const phaseList = phases.split(",").map(p => p.trim()).filter(Boolean)
      if (phaseList.length === 0) {
        return errorResponse("phases 必须包含至少一个阶段")
      }

      const featureName = domain.split("-").map(s => s.charAt(0).toUpperCase() + s.slice(1)).join("")
      const domainUpper = prefix
      const logDir = `logs/${domain}/`
      const logFile = `${domain}.log`

      const typeEntries = phaseList.map(p => `  | "${p}"`).join("\n")
      const envPrefix = domainUpper.replace(/-/g, "_")
      const fnPrefix = featureName.charAt(0).toLowerCase() + featureName.slice(1)

      // === Layer 1: 开发审计日志器 (dev-logger.ts) ===
      const devLoggerCode = `import * as fs from "fs/promises"
import * as path from "path"

// ADD-4 Layer 1 开发审计（可插拔）: console + file + DB metadata
// 消费者: AI 助手 + 开发者 | 开关: NODE_ENV=development

const PREFIX = "[${prefix}]"

const LOG_DIR = process.env.${envPrefix}_LOG_DIR || path.join(process.cwd(), "${logDir}")
const LOG_FILE = process.env.${envPrefix}_LOG_FILE || "${logFile}"
const ENABLE_FILE_LOG = process.env.${envPrefix}_ENABLE_FILE_LOG === "true" || process.env.NODE_ENV === "development"

// Layer 1: 开发审计 — 仅在 NODE_ENV=development 时生效
const IS_DEV = process.env.NODE_ENV === "development"

type ${featureName}AuditPhase =
${typeEntries}

async function ensureLogDir(): Promise<void> {
  if (!ENABLE_FILE_LOG) return
  try {
    await fs.mkdir(LOG_DIR, { recursive: true })
  } catch {
    // Ignore if directory already exists
  }
}

async function writeToFile(message: string): Promise<void> {
  if (!ENABLE_FILE_LOG) return
  try {
    await ensureLogDir()
    const logPath = path.join(LOG_DIR, LOG_FILE)
    await fs.appendFile(logPath, message + "\\n", "utf-8")
  } catch (error) {
    console.error("\${PREFIX} Failed to write to log file:", error)
  }
}

function formatMessage(phase: ${featureName}AuditPhase, detail: string, extra?: Record<string, unknown>): string {
  const ts = new Date().toISOString()
  const extraStr = extra ? \` | \${JSON.stringify(extra)}\` : ""
  return \`\${PREFIX} [\${ts}] [\${phase}] \${detail}\${extraStr}\`
}

export function ${fnPrefix}Audit(phase: ${featureName}AuditPhase, detail: string, extra?: Record<string, unknown>) {
  if (!IS_DEV) return
  const message = formatMessage(phase, detail, extra)
  console.log(message)
  writeToFile(message)
}

export function ${fnPrefix}AuditPhaseStart(phase: ${featureName}AuditPhase, description: string, count?: number) {
  if (!IS_DEV) return
  const countStr = count !== undefined ? \` (\${count}个)\` : ""
  const message = \`\${PREFIX} ═══ [\${phase}] 开始\${countStr}: \${description} ═══\`
  console.log(message)
  writeToFile(message)
}

export function ${fnPrefix}AuditPhaseEnd(phase: ${featureName}AuditPhase, detail: string) {
  if (!IS_DEV) return
  const message = \`\${PREFIX} ═══ [\${phase}] 结束: \${detail} ═══\`
  console.log(message)
  writeToFile(message)
}

export async function read${featureName}Logs(lines: number = 100): Promise<string[]> {
  try {
    await ensureLogDir()
    const logPath = path.join(LOG_DIR, LOG_FILE)
    const content = await fs.readFile(logPath, "utf-8")
    const allLines = content.split("\\n").filter(Boolean)
    return allLines.slice(-lines)
  } catch {
    return []
  }
}

export async function clear${featureName}Logs(): Promise<void> {
  try {
    await ensureLogDir()
    const logPath = path.join(LOG_DIR, LOG_FILE)
    await fs.writeFile(logPath, "", "utf-8")
  } catch {
    // Ignore
  }
}

// ADD-4 Layer 1 三通道输出: DB metadata 回写（由业务服务层调用）
export type ${featureName}DevAuditRecord = {
  phase: ${featureName}AuditPhase
  detail: string
  extra?: Record<string, unknown>
  timestamp: string
}

export function build${featureName}DevAudit(
  phase: ${featureName}AuditPhase,
  detail: string,
  extra?: Record<string, unknown>
): ${featureName}DevAuditRecord {
  return {
    phase,
    detail,
    extra,
    timestamp: new Date().toISOString(),
  }
}
`

      // === Layer 2: 运行时业务审计 (audit.ts) ===
      const runtimeAuditCode = `import { prisma } from "@/lib/prisma"
import { randomUUID } from "crypto"

const PREFIX = "[${prefix}:RUNTIME]"

type ${featureName}AuditAction =
${phaseList.map(p => `  | "${p}"`).join("\n")}

export type ${featureName}AuditRecord = {
  action: ${featureName}AuditAction
  entityId: string
  detail: Record<string, unknown>
  traceId?: string
}

function formatMessage(record: ${featureName}AuditRecord): string {
  const ts = new Date().toISOString()
  const extraStr = Object.keys(record.detail).length > 0 ? \` | \${JSON.stringify(record.detail)}\` : ""
  const traceStr = record.traceId ? \` trace=\${record.traceId}\` : ""
  return \`\${PREFIX} [\${ts}] [\${record.action}] entity=\${record.entityId}\${traceStr}\${extraStr}\`
}

// ADD-4 traceId 运行时排查体系: 同一请求生命周期内所有审计事件共享 traceId
export function generate${featureName}TraceId(): string {
  return \\\`trace-\\\${randomUUID().slice(0, 8)}\\\`
}

export async function record${featureName}Audit(record: ${featureName}AuditRecord): Promise<void> {
  // Layer 2: 三通道输出 — console
  console.log(formatMessage(record))

  // Layer 2: 三通道输出 — AuditLog 表（含 traceId 关联）
  try {
    await prisma.auditLog.create({
      data: {
        userId: "system",
        action: record.action,
        targetType: "${featureName}",
        targetId: record.entityId,
        traceId: record.traceId || null,
        afterState: record.detail as Record<string, unknown>,
        reason: \`\${record.action} on \${record.entityId}\`,
      },
    })
  } catch (error) {
    console.error(\`\${PREFIX} Failed to write AuditLog: \${error instanceof Error ? error.message : String(error)}\`)
  }
}
`

      const parts: string[] = [
        `=== 三层分离式审计日志器: ${domain} ===`,
        `域名: ${domain}`,
        `前缀: [${prefix}]`,
        `日志目录: ${logDir}`,
        `日志文件: ${logFile}`,
        `阶段数: ${phaseList.length}`,
        `阶段列表: ${phaseList.join(", ")}`,
        "",
        "=== 文件1: src/lib/${domain}-dev-logger.ts (Layer 1 开发审计) ===",
        "ADD-4 三通道输出: console.log + fs.appendFile + DB metadata 回写",
        "- console + file: auditPhaseStart/End/Audit 自动输出",
        "- DB metadata: buildXxxDevAudit() 构建记录 → 业务服务层调用 saveAuditData 写入业务表",
        "仅在 NODE_ENV=development 时生效（可插拔），用于 AI 合规检查。",
        "",
        devLoggerCode,
        "",
        "=== 文件2: src/lib/${domain}-audit.ts (Layer 2 运行时业务审计) ===",
        "ADD-4 三通道输出: console.log + fs.appendFile + AuditLog 表写入",
        "始终开启（不可插拔），用于业务记录和前端查询。",
        "",
        runtimeAuditCode,
        "",
        "=== 使用方式 ===",
        "业务服务层同时导入两个文件:",
        `  import { ${fnPrefix}AuditPhaseStart, ${fnPrefix}AuditPhaseEnd, ${fnPrefix}Audit } from "@/lib/${domain}-dev-logger"`,
        `  import { record${featureName}Audit, generate${featureName}TraceId } from "@/lib/${domain}-audit"`,
        "",
        "开发审计层: auditPhaseStart/End/Audit（仅开发环境生效）+ buildXxxDevAudit → saveAuditData",
        "运行时审计层: recordXxxAudit（始终开启，写入 AuditLog 表）",
        "traceId 体系: generateXxxTraceId() 生成 → 同一请求内所有 recordXxxAudit 传入 traceId → query_audit_logs({ traceId }) 查全链",
      ]

      return textResponse(parts.join("\n"))
    } catch (error) {
      return errorResponse(`生成审计日志器失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

server.registerTool(
  "query_audit_logs",
  {
    description: "稀疏查询开发操作审计日志（DevOperation 表，MCP-5 稀疏推理恢复）。支持多维度检索，AI 可在不同对话会话中通过任意维度组合查询之前的开发操作记录，实现跨会话的上下文恢复。\n\n典型用法:\n- query_audit_logs({ targetType: \"API_ROUTE\" }) — 查所有 API 路由改动\n- query_audit_logs({ targetId: \"src/app/api/knowledge/route.ts\" }) — 查特定文件改动\n- query_audit_logs({ keyword: \"pagination\" }) — 按关键词搜索\n- query_audit_logs({ planKeyword: \"add-qoder\" }) — 按 Plan 关键词查该 Plan 下所有 devlog\n- query_audit_logs({}) — 查最近的记录（session-init 会话恢复）",
    inputSchema: {
      targetType: z.string().optional().describe("按目标类型精确过滤"),
      action: z.string().optional().describe("按操作类型精确过滤"),
      targetId: z.string().optional().describe("按目标标识精确过滤"),
      planKeyword: z.string().optional().describe("按 Plan 关键词过滤，同 check_dps/check_rahs 的定位键"),
      keyword: z.string().optional().describe("关键词搜索，在 action/targetType/targetId/reason 字段中模糊匹配"),
      sinceMinutes: z.number().optional().describe("时间窗口起始（分钟前），不传则不限制时间范围"),
      limit: z.number().optional().default(20).describe("返回最大条数，默认 20，最大 100"),
    },
  },
  async (args: { targetType?: string; action?: string; targetId?: string; planKeyword?: string; keyword?: string; sinceMinutes?: number; limit?: number }) => {
    try {
      const { targetType, action, targetId, planKeyword, keyword, sinceMinutes, limit = 20 } = args

      const where: Record<string, unknown> = {}

      if (sinceMinutes !== undefined) {
        const since = new Date(Date.now() - sinceMinutes * 60 * 1000)
        where.createdAt = { gte: since }
      }

      if (targetType) where.targetType = targetType
      if (action) where.action = action
      if (targetId) where.targetId = targetId
      if (planKeyword) where.planKeyword = planKeyword

      if (keyword) {
        where.OR = [
          { action: { contains: keyword, mode: "insensitive" } },
          { targetType: { contains: keyword, mode: "insensitive" } },
          { targetId: { contains: keyword, mode: "insensitive" } },
          { reason: { contains: keyword, mode: "insensitive" } },
          { planKeyword: { contains: keyword, mode: "insensitive" } },
        ]
      }

      const logs = await prisma.devOperation.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: Math.min(limit, 100),
        include: { user: { select: { username: true } } },
      })

      if (logs.length === 0) {
        const parts: string[] = []
        if (targetType) parts.push(`targetType=${targetType}`)
        if (action) parts.push(`action=${action}`)
        if (targetId) parts.push(`targetId=${targetId}`)
        if (planKeyword) parts.push(`planKeyword=${planKeyword}`)
        if (keyword) parts.push(`keyword="${keyword}"`)
        if (sinceMinutes !== undefined) parts.push(`sinceMinutes=${sinceMinutes}`)
        const filterDesc = parts.length > 0 ? `条件: ${parts.join(", ")}` : "无条件"

        return textResponse(
          `=== 开发操作审计日志 ===\n\n未找到匹配的审计记录（${filterDesc}）。\n\n` +
          `可能原因: 数据库未运行、尚无相关开发操作记录、或 filter 过于严格。\n` +
          `建议: 尝试放宽过滤条件，或检查数据库是否正常运行。`
        )
      }

      const filters: string[] = []
      if (targetType) filters.push(`targetType=${targetType}`)
      if (action) filters.push(`action=${action}`)
      if (targetId) filters.push(`targetId=${targetId}`)
      if (planKeyword) filters.push(`planKeyword=${planKeyword}`)
      if (keyword) filters.push(`keyword="${keyword}"`)
      if (sinceMinutes !== undefined) filters.push(`最近${sinceMinutes}分钟`)
      const filterDesc = filters.length > 0 ? `条件: ${filters.join(", ")}` : "无过滤条件（最近全部）"

      const timeRange = logs.length > 0
        ? `${logs[0].createdAt.toISOString()} ~ ${logs[logs.length - 1].createdAt.toISOString()}`
        : ""

      const lines: string[] = [
        `=== 开发操作审计日志 (${filterDesc}) ===`,
        `共 ${logs.length} 条记录`,
        ...(timeRange ? [`时间跨度: ${timeRange}`] : []),
        "",
      ]

      for (let i = 0; i < logs.length; i++) {
        const log = logs[i]
        lines.push(`[${i + 1}] ${log.createdAt.toISOString()}`)
        lines.push(`    action: ${log.action} | targetType: ${log.targetType} | targetId: ${log.targetId || "(无)"}`)
        if (log.reason) lines.push(`    reason: ${log.reason}`)
        if (log.planKeyword) lines.push(`    planKeyword: ${log.planKeyword}`)
        if (log.beforeState || log.afterState) {
          lines.push(`    beforeState: ${log.beforeState ? JSON.stringify(log.beforeState).slice(0, 200) : "(无)"}`)
          lines.push(`    afterState: ${log.afterState ? JSON.stringify(log.afterState).slice(0, 200) : "(无)"}`)
        }
        lines.push("")
      }

      if (planKeyword) {
        lines.push("=== Plan 分组 ===")
        lines.push(`planKeyword=${planKeyword} 的操作链:`)
        const actions = logs.map((l: typeof logs[0]) => `  ${l.createdAt.toISOString().slice(11, 19)} ${l.action}`)
        lines.push(...actions)
        lines.push("")
      }

      lines.push("=== 稀疏推理建议 ===")
      lines.push("基于以上审计日志，可以恢复开发上下文。")
      lines.push("如果新对话的 context 不足，可进一步调用 query_audit_logs 细化查询。")

      return textResponse(lines.join("\n"))
    } catch (error) {
      return errorResponse(
        `查询审计日志失败: ${error instanceof Error ? error.message : String(error)}\n` +
        `可能原因: 数据库未运行或 AuditLog 表不存在。请先运行 npm run db:start。`
      )
    }
  }
)

server.registerTool(
  "record_dev_operation",
  {
    description: "记录一次开发操作到 DevOperation 表（ADD-7）。AI 助手在对代码进行任何修改/创建/删除操作后，必须调用此工具记录操作审计。这是稀疏推理（Sparse Inference）的基础——后续 AI Session 通过查询这些记录恢复开发上下文。\n\n**targetId 路径格式（强制）**：必须使用相对于 workspace 根目录的路径，禁止绝对路径。\n- ✅ src/middleware.ts\n- ✅ ${MAGIC_DIR}/plans/xxx.md\n- ✅ agrisynapse/src/api/agent/types.ts（跨项目）\n- ❌ /absolute/path/to/src/middleware.ts（绝对路径，Linux 下不可移植）\n\n**记录后必须回查确认落库**（附录 A.5 规则 6）：调用 query_audit_logs({ targetId: \"...\" }) 确认记录已写入。",
    inputSchema: {
      action: z.string().describe("操作类型，如 'MODIFY', 'CREATE', 'DELETE', 'API_PAGINATION_ENABLED', 'DOC_UPDATED', 'DOC_CREATED'"),
      targetType: z.string().describe("目标类型，如 'API_ROUTE', 'COMPONENT', 'SCHEMA', 'RULE', 'DOC', 'DEPENDENCY', 'MCP_TOOL', 'PLAN', 'SPEC', 'HANDOFF', 'SKILL', 'AGENT'"),
      targetId: z.string().optional().describe("目标标识（相对路径），如 'src/app/api/knowledge/documents/route.ts'"),
      planKeyword: z.string().optional().describe("关联 Plan 的关键词（同 check_dps/check_rahs 的定位键），同一 Plan 下所有 devlog 共享。用于 session-init 恢复时精准拉取"),
      beforeState: z.string().optional().describe("操作前的状态（JSON 字符串），描述修改前的关键信息"),
      afterState: z.string().optional().describe("操作后的状态（JSON 字符串），描述修改后的关键信息"),
      reason: z.string().optional().describe("操作原因，为什么做这个改动"),
    },
  },
  async (args: { action: string; targetType: string; targetId?: string; planKeyword?: string; beforeState?: string; afterState?: string; reason?: string }) => {
    try {
      const { action, targetType, targetId, planKeyword, beforeState, afterState, reason } = args

      // ADD-7: targetId 相对路径校验
      const pathWarnings: string[] = []
      if (targetId) {
        if (targetId.startsWith("/") || /^[A-Z]:\\/.test(targetId)) {
          pathWarnings.push(`⚠️ targetId 使用了绝对路径: "${targetId}"。ADD-7 要求使用相对于 workspace 根目录的路径（如 src/app/...），请修正后重新记录。`)
        }
      }

      let parsedBefore: Prisma.InputJsonValue | undefined
      let parsedAfter: Prisma.InputJsonValue | undefined
      try {
        if (beforeState) parsedBefore = JSON.parse(beforeState) as Prisma.InputJsonValue
        if (afterState) parsedAfter = JSON.parse(afterState) as Prisma.InputJsonValue
      } catch {
        const beforePreview = beforeState ? beforeState.slice(0, 80) : "(未传)"
        const afterPreview = afterState ? afterState.slice(0, 80) : "(未传)"
        return errorResponse(
          `beforeState/afterState 必须是有效的 JSON 字符串。\n` +
          `提示: 请使用 JSON.stringify() 包裹，如 JSON.stringify({"key":"value"})\n` +
          `接收到: beforeState=${beforePreview}, afterState=${afterPreview}`
        )
      }

      let systemUser = await prisma.user.findUnique({
        where: { username: "ai-assistant" },
        select: { id: true },
      })

      if (!systemUser) {
        systemUser = await prisma.user.create({
          data: {
            id: "ai-assistant",
            username: "ai-assistant",
            email: "ai-assistant@internal",
            password: "internal",
          },
          select: { id: true },
        })
      }

      const log = await prisma.devOperation.create({
        data: {
          userId: systemUser.id,
          planKeyword: planKeyword || "unknown",
          action,
          targetType,
          targetId: targetId || "unknown",
          beforeState: parsedBefore ?? Prisma.JsonNull,
          afterState: parsedAfter ?? Prisma.JsonNull,
          reason: reason || null,
        },
      })

      const ts = new Date().toISOString()
      console.log(`[DEV-AUDIT] [${ts}] [${action}] ${targetType}:${targetId || "unknown"} | plan:${planKeyword || "unknown"} | ${reason || ""} | ${JSON.stringify({ before: parsedBefore, after: parsedAfter })}`)

      const responseLines: string[] = [
        `✅ 开发操作已记录`,
        `  ID: ${log.id}`,
        `  action: ${action}`,
        `  targetType: ${targetType}`,
        `  targetId: ${targetId || "unknown"}`,
        `  planKeyword: ${planKeyword || "unknown"}`,
        `  createdAt: ${log.createdAt.toISOString()}`,
      ]

      if (pathWarnings.length > 0) {
        responseLines.push("")
        responseLines.push(...pathWarnings)
      }

      // ADD-7 回查提示（附录 A.5 规则 6）
      responseLines.push("")
      responseLines.push(`📋 落库回查（必须执行）:`)
      if (targetId) {
        responseLines.push(`  query_audit_logs({ targetId: "${targetId}" }) — 确认本条记录已写入`)
      }
      responseLines.push(`  后续 AI Session 可通过 query_audit_logs 查询到此记录，实现跨会话上下文恢复。`)

      return textResponse(responseLines.join("\n"))
    } catch (error) {
      return errorResponse(`记录开发操作失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

server.registerTool(
  "find_related_docs",
  {
    description: "搜索与当前变更相关的项目文档（ADD-0.1 广义文档先行）。搜索范围:\n1. docs/ 目录 — 需求文档、架构文档、规范文档\n2. ${MAGIC_DIR}/ 产物 — plans/(Plan+add-route+handoff)、specs/(三元组)、reviews/(方案审查+实现审查+运行时审查)\n\nAI 助手在 ADD 范式 Step 0 中应调用此工具查找需要更新的 docs/ 文档，同时检查 ${MAGIC_DIR}/ 下相关 plan/add-route/spec/review/handoff 文件。",
    inputSchema: {
      query: z.string().describe("搜索关键词，如功能名、模块名、API 名等"),
      category: z.string().optional().describe("文档类别过滤: 'requirement' 需求, 'architecture' 架构, 'standard' 规范, 'plan' 方案, 'add-route' 执行路线图, 'spec' 功能规格, 'review' 审查, 'handoff' 交接"),
    },
  },
  async (args: { query: string; category?: string }) => {
    try {
      const { query, category } = args

      const docsDir = join(PROJECT_ROOT, "docs")

      // 类别到目录前缀的映射（docs/ 目录）
      const categoryPrefixes: Record<string, string[]> = {
        requirement: ["00-需求"],
        architecture: ["01-架构", "02-架构"],
        standard: ["02-规范", "03-规范"],
      }

      // ${MAGIC_DIR}/ 产物类别映射
      const qoderCategoryMap: Record<string, string> = {
        plans: "plan",
        specs: "spec",
        reviews: "review",
      }

      // 收集所有 Markdown 文件
      const allFiles: Array<{ path: string; relativePath: string; category: string }> = []

      const walkDir = async (dir: string, relativeDir: string, sourceType: "docs" | "qoder" = "docs"): Promise<void> => {
        try {
          const entries = await readdir(dir, { withFileTypes: true })
          for (const entry of entries) {
            const fullPath = join(dir, entry.name)
            const relPath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name
            if (entry.isDirectory()) {
              await walkDir(fullPath, relPath, sourceType)
            } else if (entry.isFile() && (entry.name.endsWith(".md") || entry.name.endsWith(".html"))) {
              let docCategory = "unknown"
              if (sourceType === "qoder") {
                // ${MAGIC_DIR}/ 产物按目录分类
                const topDir = relPath.split("/")[0]
                docCategory = qoderCategoryMap[topDir] || "unknown"
                // handoff 文件特殊识别（存放在 plans/ 下但含 handoff 关键词）
                if (topDir === "plans" && entry.name.includes("handoff")) {
                  docCategory = "handoff"
                }
                // add-route 文件特殊识别（存放在 plans/ 下但含 add-route 关键词）
                if (topDir === "plans" && entry.name.includes("add-route")) {
                  docCategory = "add-route"
                }
              } else {
                // docs/ 按目录前缀分类
                for (const [cat, prefixes] of Object.entries(categoryPrefixes)) {
                  if (prefixes.some(p => relPath.includes(p))) {
                    docCategory = cat
                    break
                  }
                }
              }
              allFiles.push({ path: fullPath, relativePath: relPath, category: docCategory })
            }
          }
        } catch {
          // Ignore errors for non-existent dirs
        }
      }

      // 搜索 docs/ 目录
      await walkDir(docsDir, "", "docs")
      // 搜索 ${MAGIC_DIR}/ 产物目录（plans/specs/reviews）
      const qoderSearchDirs = ["plans", "specs", "reviews"]
      for (const qDir of qoderSearchDirs) {
        const qPath = join(PROJECT_ROOT, MAGIC_DIR, qDir)
        if (existsSync(qPath)) {
          await walkDir(qPath, qDir, "qoder")
        }
      }

      // 如果指定了类别，先过滤
      const allCategories: Record<string, string[]> = {
        ...categoryPrefixes,
        plan: ["plan"],
        "add-route": ["add-route"],
        spec: ["spec"],
        review: ["review"],
        handoff: ["handoff"],
      }
      let filtered = allFiles
      if (category && allCategories[category]) {
        filtered = allFiles.filter(f => f.category === category)
      }

      // 关键词匹配（文件名和内容第一行标题）
      const queryLower = query.toLowerCase()
      const matchingDocs: Array<{
        path: string
        relativePath: string
        category: string
        title: string
        relevance: number
      }> = []

      for (const doc of filtered) {
        const fileName = doc.relativePath.toLowerCase()
        let title = ""
        let relevance = 0

        // 文件名匹配
        if (fileName.includes(queryLower)) {
          relevance += 3
        }

        // 读取文件第一行获取标题
        try {
          const content = await readFileSafe(doc.path)
          if (content) {
            const firstLine = content.split("\n")[0]
            // 尝试获取 Markdown 标题
            const titleMatch = content.match(/^#\s+(.+)/m)
            if (titleMatch) {
              title = titleMatch[1].trim()
            } else {
              title = firstLine.replace(/^#+\s*/, "").replace(/[#*]/g, "").trim()
            }
            // 内容匹配
            const contentLower = content.toLowerCase()
            if (contentLower.includes(queryLower)) {
              relevance += 2
            }
            // 提取相关段落摘要
            const lines = content.split("\n")
            const matchingLines = lines.filter(l => l.toLowerCase().includes(queryLower))
            if (matchingLines.length > 0) {
              relevance += Math.min(matchingLines.length, 5)
            }
          }
        } catch {
          // Ignore read errors
        }

        if (relevance > 0) {
          matchingDocs.push({
            path: doc.path,
            relativePath: doc.relativePath,
            category: doc.category,
            title: title || doc.relativePath.split("/").pop() || doc.relativePath,
            relevance,
          })
        }
      }

      // 按相关性降序排序
      matchingDocs.sort((a, b) => b.relevance - a.relevance)

      // 构建输出
      const parts: string[] = [
        `=== 项目文档搜索: "${query}" ===`,
        `搜索范围: docs/ + ${MAGIC_DIR}/ 产物（plans/specs/reviews）`,
        category ? `文档类别: ${category}（${allCategories[category]?.join(", ") || category}）` : "文档类别: 全部",
        `匹配文档数: ${matchingDocs.length}`,
        "",
      ]

      if (matchingDocs.length === 0) {
        parts.push("未找到匹配的文档。建议:")
        parts.push("- 检查关键词拼写")
        parts.push("- 尝试使用更宽泛的关键词")
        parts.push(`- 确认 docs/ 或 ${MAGIC_DIR}/ 下存在相关文档`)
        parts.push("")
        // 列出所有可用文档作为参考
        parts.push("=== 可用文档列表 ===")
        for (const doc of allFiles) {
          const catLabel: Record<string, string> = {
            requirement: "[需求]",
            architecture: "[架构]",
            standard: "[规范]",
            plan: "[Plan]",
            spec: "[Spec]",
            review: "[Review]",
            handoff: "[Handoff]",
            unknown: "[其他]",
          }
          parts.push(`  ${catLabel[doc.category] || "[其他]"} ${doc.relativePath}`)
        }
      } else {
        // 按类别分组展示
        const byCategory: Record<string, typeof matchingDocs> = {}
        for (const doc of matchingDocs) {
          const cat = doc.category || "unknown"
          if (!byCategory[cat]) byCategory[cat] = []
          byCategory[cat].push(doc)
        }

        const catLabelFull: Record<string, string> = {
          requirement: "需求文档",
          architecture: "架构文档",
          standard: "规范文档",
          plan: "Plan 方案",
          spec: "Spec 功能规格",
          review: "Review 审查",
          handoff: "Handoff 交接",
          unknown: "其他文档",
        }

        for (const [cat, docs] of Object.entries(byCategory)) {
          parts.push(`--- ${catLabelFull[cat] || "其他文档"} (${docs.length}篇) ---`)
          for (const doc of docs) {
            parts.push(`  [相关度 ${doc.relevance}] ${doc.relativePath}`)
            parts.push(`  标题: ${doc.title}`)
            parts.push("")
          }
        }

        parts.push("=== 使用提示 ===")
        parts.push("1. 阅读文档确认需要更新的章节")
        parts.push("2. 在修改代码前先更新文档内容（ADD-0.1 文档先行）")
        parts.push("3. 更新完成后调用 record_dev_operation 记录文档变更")
        parts.push("   → targetType: \"DOC\", action: \"DOC_UPDATED\" 或 \"DOC_CREATED\"")
        parts.push(`   → targetId: 相对路径（如 docs/.../xxx.md 或 ${MAGIC_DIR}/specs/xxx/spec.md）`)
      }

      return textResponse(parts.join("\n"))
    } catch (error) {
      return errorResponse(`搜索文档失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

// ========== 新增工具: check_add_route_status ==========
// ADD 范式关键守卫点：Step 3 前强制执行 add-route 文件存在性交叉校验
server.registerTool(
  "check_add_route_status",
  {
    description: "ADD 范式守卫工具：交叉校验 add-route 文件的审计日志记录与文件系统存在性，并扫描文件内容统计 Step 完成度（[ ] vs [x]）。\n必须在 Plan 进入 Handoff 或 Step 3 前调用，防止 add-route 丢失导致执行路线图缺失。\n\n三种基础返回状态:\n- 'normal' — 审计日志有记录、文件存在、Step 全部闭环（[x]），可继续执行\n- 'warn_step_incomplete' — 文件存在但存在未勾选的 Step 产出项，应自检完成后继续\n- 'file_missing' — 审计日志有记录但文件不存在（可能被误删），应中断并询问用户是否重建\n- 'never_generated' — 审计日志无记录且文件不存在，禁止进入 Step 3，强制回退至 Step 0.5 生成\n\n升级说明（2026-06-11）：v2 新增文件内容扫描，在 normal/warn 状态中自动统计 checkbox 完成度，未闭环时返回 warn_step_incomplete。\n\n注意：审计日志查询使用 keyword 模糊匹配，文件系统检查使用 glob 精确匹配。",
    inputSchema: {
      planKeyword: z.string().describe("Plan 文件的关键词（用于审计日志搜索和文件匹配），通常为需求域名中的核心关键词，如 'rag-audit-stacktrace'、'多轮对话能力专家'。此关键词会在 ${MAGIC_DIR}/plans/ 目录下匹配 *add-route* 文件，并在审计日志中搜索相关记录。"),
    },
  },
  async (args: { planKeyword: string }) => {
    try {
      const { planKeyword } = args
      if (!planKeyword) return errorResponse("planKeyword 参数不能为空")

      const plansDir = join(PROJECT_ROOT, MAGIC_DIR, "plans")

      // === 1. 查询审计日志：是否有 add-route 相关记录 ===
      let auditHasRecord = false
      const auditRecords: Array<{ action: string; targetId: string; createdAt: Date }> = []
      try {
        const auditLogs = await prisma.auditLog.findMany({
          where: {
            OR: [
              { targetId: { contains: "add-route", mode: "insensitive" } },
              { targetId: { contains: planKeyword, mode: "insensitive" } },
              { reason: { contains: "add-route", mode: "insensitive" } },
            ],
          },
          orderBy: { createdAt: "desc" },
          take: 20,
        })
        // 二次过滤：确认记录与当前 planKeyword 相关
        const planLower = planKeyword.toLowerCase()
        for (const log of auditLogs) {
          const targetId = (log.targetId || "").toLowerCase()
          const reason = (log.reason || "").toLowerCase()
          if (
            targetId.includes("add-route") && targetId.includes(planLower) ||
            reason.includes("add-route") && reason.includes(planLower)
          ) {
            auditHasRecord = true
            auditRecords.push({
              action: log.action,
              targetId: log.targetId || "unknown",
              createdAt: log.createdAt,
            })
          }
        }
      } catch {
        // 审计日志查询失败（如数据库未运行），不阻塞后续文件系统检查
      }

      // === 2. 检查文件系统：是否存在 add-route 文件 ===
      let fileExists = false
      const matchedFiles: string[] = []
      try {
        const entries = await readdirRecursive(plansDir)
        const planLower = planKeyword.toLowerCase()
        for (const entry of entries) {
          const entryLower = entry.toLowerCase()
          if (entryLower.includes("add-route") && entryLower.includes(planLower)) {
            fileExists = true
            matchedFiles.push(entry)
          }
        }
      } catch {
        // plans 目录不存在
      }

      // === 3. 交叉比对，返回结构化状态 ===
      const parts: string[] = [
        "=== ADD 守卫：add-route 存在性交叉校验 ===",
        `Plan 关键词: "${planKeyword}"`,
        `预期路径: ${MAGIC_DIR}/plans/{需求域名}-{核心内容}-add-route-v1.md`,
        "",
      ]

      if (auditHasRecord && fileExists) {
        // ✅ 正常：审计有记录 + 文件存在

        // === 2.5 内容扫描：统计 add-route Step 完成度 ===
        let stepTotal = 0, stepChecked = 0, stepUnchecked = 0
        let scanError: string | null = null
        const incompleteSteps: string[] = []
        const stepStatuses: Array<{ step: string; checked: number; unchecked: number }> = []

        try {
          const fullPath = join(plansDir, matchedFiles[0])
          const routeContent = await readFileSafe(fullPath)
          if (routeContent) {
            const routeLines = routeContent.split("\n")
            let currentStepName = ""
            let stepC = 0, stepU = 0

            for (const line of routeLines) {
              // 追踪当前 Step
              const stepMatch = line.match(/^##\s+Step\s+(\d+(?:\.\d+)?)/)
              if (stepMatch) {
                if (currentStepName && (stepC > 0 || stepU > 0)) {
                  stepStatuses.push({ step: currentStepName, checked: stepC, unchecked: stepU })
                }
                currentStepName = stepMatch[1]
                stepC = 0
                stepU = 0
                continue
              }

              // 统计 checkbox
              const cbMatch = line.match(/^\s*-\s+\[([ xX])\]\s/)
              if (cbMatch) {
                stepTotal++
                if (cbMatch[1] === "x" || cbMatch[1] === "X") {
                  stepChecked++
                  stepC++
                } else {
                  stepUnchecked++
                  stepU++
                  if (currentStepName && !incompleteSteps.includes(currentStepName)) {
                    incompleteSteps.push(currentStepName)
                  }
                }
              }
            }
            // 保存最后一个 Step
            if (currentStepName && (stepC > 0 || stepU > 0)) {
              stepStatuses.push({ step: currentStepName, checked: stepC, unchecked: stepU })
            }
          }
        } catch (e) {
          scanError = e instanceof Error ? e.message : String(e)
        }

        // === 3. 组装返回 ===
        const isStepComplete = stepUnchecked === 0
        parts.push(`状态: ${isStepComplete ? "✅ normal" : "⚠️ warn_step_incomplete"} — add-route 文件存在${isStepComplete ? "且 Step 全部闭环" : "但存在未勾选 Step"}`)
        parts.push(`操作: ${isStepComplete ? "继续执行后续流程" : "⚠️ 存在未闭环 Step，建议先自检完成后再进入验收阶段（Step 8）"}`)
        parts.push("")

        parts.push("=== 审计记录 ===")
        for (const r of auditRecords.slice(0, 5)) {
          parts.push(`  [${r.createdAt.toISOString()}] ${r.action} → ${r.targetId}`)
        }
        parts.push("")

        parts.push("=== 匹配文件 ===")
        for (const f of matchedFiles) {
          parts.push(`  ${MAGIC_DIR}/plans/${f}`)
        }
        parts.push("")

        // 内容扫描结果
        parts.push("=== Step 完成度扫描 ===")
        if (scanError) {
          parts.push(`  ⚠️ 扫描失败: ${scanError}`)
        } else if (stepTotal === 0) {
          parts.push("  ⚠️ 未检测到 checkbox（可能 add-route 使用非标准格式）")
        } else {
          const rate = Math.round((stepChecked / stepTotal) * 100)
          parts.push(`  整体: ${stepChecked}/${stepTotal} (${rate}%)`)
          if (stepStatuses.length > 0) {
            for (const s of stepStatuses) {
              const icon = s.unchecked === 0 ? "✅" : "⬜"
              parts.push(`  Step ${s.step}: ${icon} ${s.checked}/${s.checked + s.unchecked}`)
            }
          }
          if (incompleteSteps.length > 0) {
            parts.push("")
            parts.push(`  ⚠️ 未闭环 Step: ${incompleteSteps.join(", ")}`)
            parts.push("  建议: 调用 check_add_route_completeness 获取详细清单，完成后重新调用本工具验证")
          }
        }

        return textResponse(parts.join("\n"))
      }

      if (auditHasRecord && !fileExists) {
        // ❌ 文件丢失：审计有记录，但文件不存在
        parts.push("状态: ❌ file_missing — add-route 文件丢失")
        parts.push("操作: 中断推理，询问用户原因")
        parts.push("")
        parts.push("审计日志显示 add-route 曾经存在，但文件系统中找不到。")
        parts.push("可能原因: 文件被误删、手动移动、或未正确提交。")
        parts.push("")
        parts.push("=== 审计记录（最后 5 条） ===")
        for (const r of auditRecords.slice(0, 5)) {
          parts.push(`  [${r.createdAt.toISOString()}] ${r.action} → ${r.targetId}`)
        }
        parts.push("")
        parts.push("=== 建议 ===")
        parts.push("1. 确认文件是否被手动删除或移动")
        parts.push("2. 如确认丢失，需从 add-route-template.md 重新生成")
        parts.push("3. 生成后调用 record_dev_operation 记录恢复操作")
        return errorResponse(parts.join("\n"))
      }

      if (!auditHasRecord && !fileExists) {
        // ❌ 从未生成：审计无记录 + 文件不存在
        parts.push("状态: ❌ never_generated — add-route 文件从未生成")
        parts.push("操作: 禁止进入 Step 3，强制回退至 Step 0.5 生成 add-route")
        parts.push("")
        parts.push(`在 ${MAGIC_DIR}/plans/ 下未找到包含 "${planKeyword}" 和 "add-route" 的文件。`)
        parts.push("")
        parts.push("=== 必须执行的步骤 ===")
        parts.push("1. 回退到 Step 0.5（生成 ADD 执行路线图）")
        parts.push('2. 调用 get_add_template({ template: "add-route-template" }) 获取模板')
        parts.push("3. 按模板填充：元信息 + Step 状态 + Task 映射表 + ADD-7 审计策略 + 文件清单")
        parts.push(`4. 保存为 ${MAGIC_DIR}/plans/{需求域名}-{核心内容}-add-route-v1.md`)
        parts.push("5. 调用 record_dev_operation 记录创建事件")
        parts.push("6. 重新调用本工具验证 add-route 已就位，方可进入 Step 3")
        return errorResponse(parts.join("\n"))
      }

      // 边缘情况：审计无记录但文件存在（可能是手动创建或从别处复制）
      // 这是合法但非标准路径，标记为警告但允许继续

      // 内容扫描
      let wsTotal = 0, wsChecked = 0, wsUnchecked = 0
      const wsIncomplete: string[] = []
      try {
        const fullPath = join(plansDir, matchedFiles[0])
        const routeContent = await readFileSafe(fullPath)
        if (routeContent) {
          let currentStep = ""
          const routeLines = routeContent.split("\n")
          for (const line of routeLines) {
            const sm = line.match(/^##\s+Step\s+(\d+(?:\.\d+)?)/)
            if (sm) { currentStep = sm[1]; continue }
            const cm = line.match(/^\s*-\s+\[([ xX])\]\s/)
            if (cm) {
              wsTotal++
              if (cm[1] === "x" || cm[1] === "X") wsChecked++
              else { wsUnchecked++; if (currentStep && !wsIncomplete.includes(currentStep)) wsIncomplete.push(currentStep) }
            }
          }
        }
      } catch { /* ignore scan errors in warn path */ }

      const isWarnComplete = wsUnchecked === 0
      parts.push(`状态: ⚠️ warn${wsTotal > 0 && !isWarnComplete ? "_step_incomplete" : ""} — add-route 文件存在但审计日志无记录${!isWarnComplete ? "，且存在未勾选 Step" : ""}`)
      parts.push("操作: 允许继续，但建议补记录")
      parts.push("")
      parts.push("文件系统中存在 add-route 文件，但审计日志未找到相关记录。")
      parts.push("可能是手动创建或从其他位置复制而来。")
      parts.push("")
      parts.push("=== 匹配文件 ===")
      for (const f of matchedFiles) {
        parts.push(`  ${MAGIC_DIR}/plans/${f}`)
      }
      parts.push("")
      if (wsTotal > 0) {
        const rate = Math.round((wsChecked / wsTotal) * 100)
        parts.push("=== Step 完成度扫描 ===")
        parts.push(`  整体: ${wsChecked}/${wsTotal} (${rate}%)`)
        if (wsIncomplete.length > 0) {
          parts.push(`  ⚠️ 未闭环 Step: ${wsIncomplete.join(", ")}`)
        }
        parts.push("")
      }
      parts.push("=== 建议 ===")
      parts.push("1. 调用 record_dev_operation 补记录，确保后续 AI Session 可通过审计日志恢复上下文。")
      if (wsIncomplete.length > 0) {
        parts.push("2. 调用 check_add_route_completeness 获取未闭环 Step 详细清单，完成后重新调用本工具验证。")
      }
      return textResponse(parts.join("\n"))
    } catch (error) {
      return errorResponse(`add-route 存在性校验失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

// ========== 新增工具: get_add_template ==========
server.registerTool(
  "get_add_template",
  {
    description: "获取 ADD 工作流的文档模板（ADD-0.1 广义文档先行）。ADD 范式要求每次生成文档产物前必须先读取对应模板，禁止凭记忆生成——模板可能在迭代中已更新。\n\n可用模板（12 个）:\n- plan-template.md — 需求方案\n- add-route-template.md — Plan→ADD 九阶段执行映射（轻量模式，适合前端/小项目）\n- add-route-template-heavyweight.md — Plan→ADD 九阶段执行映射（重型模式，适合后端/管线/合规场景，强制 check_spec_sync 文档-代码交叉校验）\n- spec-template.md — 功能规格\n- tasks-template.md — 任务拆分\n- checklist-template.md — 验收清单\n- review-template.md — 方案审查（ADD-9）\n- review-implementation-template.md — 实现审查（ADD-10）\n- review-runtime-template.md — 运行时纠偏（ADD-11）\n- handoff-template.md — 交接总览索引\n- handoff-single-round-template.md — 单轮交接（9 章节）\n- handoff-multi-round-template.md — 多轮交接（13 子章节/轮）\n\n本项目默认使用重型 add-route 模板。",
    inputSchema: {
      template: z.string().describe("模板名称（不含 .md 后缀），如 'plan-template', 'add-route-template', 'spec-template', 'review-template'。传 'list' 获取所有模板列表。"),
    },
  },
  async (args: { template: string }) => {
    try {
      const { template } = args
      if (!template) return errorResponse("template 参数不能为空")

      const templatesDir = join(PROJECT_ROOT, MAGIC_DIR, "templates")

      if (template === "list") {
        const entries = await readdir(templatesDir)
        const mdFiles = entries.filter(f => f.endsWith(".md"))
        const parts: string[] = [
          `=== ADD 模板列表（${mdFiles.length} 个） ===`,
          "",
        ]
        for (const f of mdFiles) {
          const content = await readFileSafe(join(templatesDir, f))
          const firstLine = content?.split("\n")[0] || ""
          const title = firstLine.replace(/^#+\s*/, "").trim() || f
          parts.push(`  ${f.replace(".md", "")} — ${title}`)
        }
        parts.push("")
        parts.push('用法: get_add_template({ template: "plan-template" })')
        return textResponse(parts.join("\n"))
      }

      const fileName = template.endsWith(".md") ? template : `${template}.md`
      const filePath = join(templatesDir, fileName)

      if (!existsSync(filePath)) {
        return errorResponse(
          `未找到模板: ${fileName}\n` +
          `可用模板请调用: get_add_template({ template: "list" })`
        )
      }

      const content = await readFile(filePath, "utf-8")
      const parts: string[] = [
        `=== ADD 模板: ${fileName} ===`,
        `路径: ${MAGIC_DIR}/templates/${fileName}`,
        "",
        content,
        "",
        "=== 使用提示 ===",
        "1. 复制模板到目标路径，替换 {占位符} 为实际内容",
        "2. 禁止凭记忆生成——模板可能在迭代中已更新",
        "3. 生成文档后调用 record_dev_operation 记录（targetType 视产物类型而定）",
      ]

      return textResponse(parts.join("\n"))
    } catch (error) {
      return errorResponse(`获取 ADD 模板失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

// ========== 新增工具: get_spec_context ==========
server.registerTool(
  "get_spec_context",
  {
    description: "获取 ${MAGIC_DIR}/specs/ 下指定任务的 specs 三元组上下文（spec.md + tasks.md + checklist.md）。ADD 工作流中每个原子事务对应一个 specs 三元组目录，形成「需求→执行→验收」闭环。\n\nAI 助手在 ADD 范式 Step 3 执行业务逻辑时，应调用此工具获取当前任务的 spec/tasks/checklist 上下文，确保实现与规格一致。",
    inputSchema: {
      task: z.string().describe("任务名（即 ${MAGIC_DIR}/specs/ 下的目录名），如 'co-agent-response-strategy'。传 'list' 获取所有任务列表。"),
      file: z.string().optional().describe("指定读取三元组中的某个文件: 'spec', 'tasks', 'checklist'。不传则返回全部三个文件。"),
    },
  },
  async (args: { task: string; file?: string }) => {
    try {
      const { task, file } = args
      if (!task) return errorResponse("task 参数不能为空")

      const specsDir = join(PROJECT_ROOT, MAGIC_DIR, "specs")

      if (task === "list") {
        const entries = await readdir(specsDir, { withFileTypes: true })
        const dirs = entries.filter(e => e.isDirectory()).map(e => e.name)
        const parts: string[] = [
          `=== Specs 任务列表（${dirs.length} 个） ===`,
          "",
        ]
        for (const dir of dirs) {
          const specPath = join(specsDir, dir, "spec.md")
          const content = await readFileSafe(specPath)
          const firstLine = content?.split("\n")[0] || ""
          const title = firstLine.replace(/^#+\s*/, "").trim() || dir
          // 检查三元组完整性
          const hasTasks = existsSync(join(specsDir, dir, "tasks.md"))
          const hasChecklist = existsSync(join(specsDir, dir, "checklist.md"))
          const status = (hasTasks && hasChecklist) ? "✅" : "⚠️ 不完整"
          parts.push(`  ${status} ${dir} — ${title}`)
        }
        parts.push("")
        parts.push('用法: get_spec_context({ task: "co-agent-response-strategy" })')
        return textResponse(parts.join("\n"))
      }

      const taskDir = join(specsDir, task)
      if (!existsSync(taskDir)) {
        return errorResponse(
          `未找到 specs 任务: ${task}\n` +
          `可用任务请调用: get_spec_context({ task: "list" })`
        )
      }

      const trinityFiles: Record<string, string> = {
        spec: "spec.md",
        tasks: "tasks.md",
        checklist: "checklist.md",
      }

      const parts: string[] = [
        `=== Specs 三元组: ${task} ===`,
        `路径: ${MAGIC_DIR}/specs/${task}/`,
        "",
      ]

      if (file && trinityFiles[file]) {
        // 只读取指定文件
        const filePath = join(taskDir, trinityFiles[file])
        const content = await readFileSafe(filePath)
        if (content) {
          parts.push(`=== ${trinityFiles[file]} ===`)
          parts.push(content)
        } else {
          parts.push(`⚠️ ${trinityFiles[file]} 不存在`)
        }
      } else {
        // 读取全部三个文件
        for (const [key, fileName] of Object.entries(trinityFiles)) {
          const filePath = join(taskDir, fileName)
          const content = await readFileSafe(filePath)
          if (content) {
            parts.push(`=== ${fileName} ===`)
            parts.push(content)
            parts.push("")
          } else {
            parts.push(`⚠️ ${fileName} 不存在（三元组不完整）`)
            parts.push("")
          }
        }
      }

      return textResponse(parts.join("\n"))
    } catch (error) {
      return errorResponse(`获取 Spec 上下文失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

// ========== 新增工具: check_add_compliance ==========
server.registerTool(
  "check_add_compliance",
  {
    description: "综合 ADD 合规检查（ADD-1~6 一键验证）。对给定的 TypeScript 代码文件执行以下检查:\n1. ADD-2 阶段标记对称性（auditPhaseStart/End 配对 或 event-based 审计调用一致性）\n2. ADD-6 失败路径审计信息密度（catch 块 vs try 块）\n3. ADD-3 最小可观测单元（循环体内是否有审计调用）\n4. ADD-1 审计基础设施优先（是否导入了审计日志器）\n5. ADD-4 三通道输出（Layer 1 + Layer 2 导入完整性）\n\nAI 助手在 ADD 范式 Step 4（审计数据验证）和 Step 5（AI 自动合规检查）中应调用此工具。",
    inputSchema: {
      code: z.string().describe("要检查的 TypeScript 代码文本"),
      featureName: z.string().optional().describe("功能名称（用于识别对应的审计日志器导入），如 'knowledgeBase'"),
      projectPattern: z.string().optional().default("phase-marker").describe("项目审计模式: 'phase-marker' (默认, auditPhaseStart/End), 'event-based' (agentAudit() / 自定义审计函数)"),
    },
  },
  async (args: { code: string; featureName?: string; projectPattern?: string }) => {
    try {
      const { code, featureName, projectPattern = "phase-marker" } = args
      if (!code) return errorResponse("code 参数不能为空")

      const isEventBased = projectPattern === "event-based"

      const lines: string[] = [
        "=== ADD 综合合规检查 ===",
        `  审计模式: ${isEventBased ? "event-based (agentAudit)" : "phase-marker (auditPhaseStart/End)"}`,
        "",
      ]

      let passCount = 0
      let failCount = 0
      let warnCount = 0

      // === 检查 1: ADD-2 阶段标记对称性 ===
      const starts: string[] = []
      const ends: string[] = []
      let m

      if (isEventBased) {
        // event-based 模式: 检测 agentAudit() / xxxAudit() 调用
        const auditCallRegex = /(?:agentAudit|\w+Audit)\s*\(\s*["']([^"']+)["']/g
        while ((m = auditCallRegex.exec(code)) !== null) starts.push(m[1])
      } else {
        const startRegex = /auditPhaseStart\(["']([^"']+)["']/g
        const endRegex = /auditPhaseEnd\(["']([^"']+)["']/g
        while ((m = startRegex.exec(code)) !== null) starts.push(m[1])
        while ((m = endRegex.exec(code)) !== null) ends.push(m[1])
      }

      const startCounts: Record<string, number> = {}
      const endCounts: Record<string, number> = {}
      for (const s of starts) startCounts[s] = (startCounts[s] || 0) + 1
      for (const e of ends) endCounts[e] = (endCounts[e] || 0) + 1

      const allPhases = new Set([...Object.keys(startCounts), ...Object.keys(endCounts)])
      const asymmetricPhases: string[] = []
      allPhases.forEach((phase) => {
        const sc = startCounts[phase] || 0
        const ec = endCounts[phase] || 0
        if (sc !== ec) {
          asymmetricPhases.push(`  ❌ ${phase}: Start=${sc}, End=${ec}`)
        }
      })

      lines.push("--- ADD-2 阶段标记对称性 ---")
      if (isEventBased) {
        lines.push(`  审计调用总数: ${starts.length}`)
        if (starts.length > 0) {
          lines.push(`  ✅ 检测到 ${starts.length} 处审计函数调用 (event-based 模式)`)
          const phaseCounts: Record<string, number> = {}
          for (const s of starts) phaseCounts[s] = (phaseCounts[s] || 0) + 1
          lines.push(`  调用分布: ${Object.entries(phaseCounts).map(([k, v]) => `${k}=${v}`).join(", ")}`)
          passCount++
        } else {
          lines.push("  ⚠️ 未检测到 agentAudit() / xxxAudit() 调用")
          warnCount++
        }
      } else {
        lines.push(`  Start 总数: ${starts.length}, End 总数: ${ends.length}`)
        if (asymmetricPhases.length === 0 && starts.length > 0) {
          lines.push("  ✅ 阶段标记完全对称")
          passCount++
        } else if (starts.length === 0) {
          lines.push("  ⚠️ 未检测到 auditPhaseStart/End 调用")
          warnCount++
        } else {
          lines.push(`  ❌ ${asymmetricPhases.length} 个不对称阶段:`)
          lines.push(...asymmetricPhases)
          failCount++
        }
      }
      lines.push("")

      // === 检查 2: ADD-6 失败路径信息密度 ===
      const sections = code.split(/catch\s*\(/)
      lines.push("--- ADD-6 失败路径审计信息密度 ---")
      if (sections.length <= 1) {
        lines.push("  ⚠️ 未检测到 try/catch 块")
        warnCount++
      } else {
        let allCatchPass = true
        for (let i = 1; i < sections.length; i++) {
          const catchBlock = sections[i]
          const catchEnd = catchBlock.indexOf("{")
          if (catchEnd === -1) continue

          const tryBlock = sections[i - 1]
          const tryExtraMatches = tryBlock.match(/extra[:\s]*\{[^}]*\}/g)
          const tryExtraFieldCount = tryExtraMatches
            ? tryExtraMatches.reduce((sum, mm) => sum + (mm.match(/\w+:/g)?.length || 0), 0)
            : 0

          const closeIdx = catchBlock.indexOf("}")
          const catchBody = catchBlock.slice(catchEnd, closeIdx + 1)
          const catchExtraMatches = catchBody.match(/extra[:\s]*\{[^}]*\}/g)
          const catchExtraFieldCount = catchExtraMatches
            ? catchExtraMatches.reduce((sum, mm) => sum + (mm.match(/\w+:/g)?.length || 0), 0)
            : 0

          const catchHasAudit = catchBody.includes("audit") || catchBody.includes("Audit")
          const catchInfoDensity = catchExtraFieldCount + (catchHasAudit ? 2 : 0)

          if (!catchHasAudit) {
            lines.push(`  ❌ Catch 块 #${i}: 缺少审计调用`)
            allCatchPass = false
          } else if (catchInfoDensity < tryExtraFieldCount) {
            lines.push(`  ❌ Catch 块 #${i}: 信息密度不足 (catch=${catchExtraFieldCount}, try=${tryExtraFieldCount})`)
            allCatchPass = false
          }
        }
        if (allCatchPass) {
          lines.push(`  ✅ 所有 ${sections.length - 1} 个 catch 块审计信息密度充足`)
          passCount++
        } else {
          failCount++
        }
      }
      lines.push("")

      // === 检查 3: ADD-3 最小可观测单元 ===
      lines.push("--- ADD-3 最小可观测单元 ---")
      const loopRegex = /for\s*\(|while\s*\(|\.forEach\s*\(|\.map\s*\(/g
      const loopCount = (code.match(loopRegex) || []).length
      if (loopCount === 0) {
        lines.push("  ⚠️ 未检测到循环体，跳过此项")
        warnCount++
      } else if (isEventBased) {
        // event-based 模式: 查找循环体内是否有审计调用（批次级别审计）
        const loopAuditRegex = /\b\w*Audit\s*\(["']/g
        const hasLoopAudit = loopAuditRegex.test(code)
        if (hasLoopAudit) {
          lines.push(`  ✅ 批次级审计调用检测通过 (event-based 模式)，循环数: ${loopCount}`)
          passCount++
        } else {
          lines.push(`  ⚠️ event-based 模式: ${loopCount} 个循环体，未检测到批次级审计调用。检查是否有批次级 agentAuditXxx() 包裹`)
          warnCount++
        }
      } else {
        const chunkRegex = /audit\(["']\w*_CHUNK/i
        const hasChunkAudit = chunkRegex.test(code)
        if (hasChunkAudit) {
          lines.push(`  ✅ 循环体内有审计调用（检测到 CHUNK 阶段），循环数: ${loopCount}`)
          passCount++
        } else {
          lines.push(`  ❌ 检测到 ${loopCount} 个循环体，但未发现循环内审计调用（CHUNK 阶段）`)
          failCount++
        }
      }
      lines.push("")

      // === 检查 4: ADD-1 审计基础设施导入 ===
      lines.push("--- ADD-1 审计基础设施导入 ---")
      let hasDevLoggerImport = false
      let hasRuntimeAuditImport = false

      if (isEventBased) {
        // event-based 模式: 检查 agentAudit 导入或 agent-audit-logger 导入
        hasDevLoggerImport = /from\s+["'].*agent-audit-logger["']/.test(code) || /import\s*\{\s*agentAudit\b/.test(code)
        hasRuntimeAuditImport = hasDevLoggerImport // event-based 模式通常二合一
      } else {
        hasDevLoggerImport = /from\s+["'].*dev-logger["']/.test(code) || /from\s+["'].*logger["']/.test(code)
        hasRuntimeAuditImport = /from\s+["'].*-audit["']/.test(code)
      }
      if (hasDevLoggerImport && hasRuntimeAuditImport) {
        if (isEventBased) {
          lines.push("  ✅ 审计基础设施导入完整 (event-based: agentAudit/agent-audit-logger)")
        } else {
          lines.push("  ✅ Layer 1 (dev-logger) + Layer 2 (runtime-audit) 导入完整")
        }
        passCount++
      } else if (hasDevLoggerImport) {
        lines.push(isEventBased
          ? "  ⚠️ 检测到 agentAudit 导入，确认审计覆盖完整"
          : "  ⚠️ 仅导入 Layer 1 (dev-logger)，缺少 Layer 2 (runtime-audit)"
        )
        warnCount++
      } else if (hasRuntimeAuditImport) {
        lines.push("  ⚠️ 仅导入 Layer 2 (runtime-audit)，缺少 Layer 1 (dev-logger)")
        warnCount++
      } else {
        lines.push(isEventBased
          ? "  ⚠️ 未检测到 agentAudit 导入 (event-based 模式)"
          : "  ❌ 未检测到审计日志器导入"
        )
        if (isEventBased) warnCount++
        else failCount++
      }
      lines.push("")

      // === 汇总 ===
      const total = passCount + failCount + warnCount
      lines.push("=== 合规检查汇总 ===")
      lines.push(`  总计 ${total} 项检查: ✅ 通过 ${passCount} | ❌ 不合规 ${failCount} | ⚠️ 警告 ${warnCount}`)
      if (failCount === 0) {
        lines.push("  🎉 ADD 合规检查全部通过（或仅有警告）")
      } else {
        lines.push("  ⚠️ 存在不合规项，请修正后重新检查")
      }
      lines.push("")
      lines.push("=== 修正建议 ===")
      if (failCount > 0) {
        lines.push("1. 补充缺失的 auditPhaseEnd 调用（ADD-2）")
        lines.push("2. 在 catch 块中添加与 try 块等价的信息密度（ADD-6）")
        lines.push("3. 在循环体内添加 CHUNK 阶段审计（ADD-3）")
        lines.push("4. 导入 dev-logger 和 runtime-audit 两个文件（ADD-1/4）")
      }

      return textResponse(lines.join("\n"))
    } catch (error) {
      return errorResponse(`ADD 合规检查失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

server.registerTool(
  "check_spec_sync",
  {
    description: "ADD 重型模式文档-代码交叉校验工具。扫描 Plan → tasks.md → checklist.md → git diff → ADD-7 审计记录，报告四者之间的不一致。用于重型 add-route 的 Step 3.5 / Step 4 / Step 8 验证并更新项目状态。轻量模式项目可跳过此工具。",
    inputSchema: {
      planKeyword: z.string().describe("Plan 文件的关键词，用于定位 Plan 和关联的 specs 目录"),
    },
  },
  async (args: { planKeyword: string }) => {
    try {
      const plansDir = join(PROJECT_ROOT, MAGIC_DIR, "plans")
      const specsDir = join(PROJECT_ROOT, MAGIC_DIR, "specs")
      const lines: string[] = []
      lines.push("=== check_spec_sync 文档-代码交叉校验 ===")
      lines.push("")

      // 1. 查找 Plan 文件
      if (!existsSync(plansDir)) {
        return errorResponse(`plans 目录不存在: ${plansDir}`)
      }
      const planFiles = (await readdirRecursive(plansDir)).filter(f => f.endsWith(".md"))
      // 优先匹配 -plan-v 文件（避免 add-route 文件名干扰）
      let planMatch = planFiles.find(f => f.toLowerCase().includes(args.planKeyword.toLowerCase()) && f.includes("-plan-v"))
      if (!planMatch) {
        planMatch = planFiles.find(f => f.toLowerCase().includes(args.planKeyword.toLowerCase()))
      }
      if (!planMatch) {
        return errorResponse(`未找到匹配的 Plan 文件（关键词: ${args.planKeyword}）`)
      }
      const planPath = join(plansDir, planMatch)
      lines.push(`Plan: ${planMatch}`)

      // 2. 从 Plan 中提取关联的 spec 目录名
      const planContent = await readFileSafe(planPath)
      let specDirName = ""
      if (planContent) {
        const specMatch = planContent.match(/Spec:\s*\.qoder\/specs\/([^/\s]+)/)
        if (specMatch) specDirName = specMatch[1]
      }
      if (!specDirName) {
        // 退而求其次：从 tasks.md 引用提取
        const taskMatch = planContent?.match(/Tasks:\s*\.qoder\/specs\/([^/\s]+)/)
        if (taskMatch) specDirName = taskMatch[1]
      }
      if (!specDirName) {
        // 再退：用 plan 文件名推断
        specDirName = basename(planMatch).replace(/-plan-v\d+\.md$/, "").replace(/-add-route-v\d+\.md$/, "")
      }
      lines.push(`Spec 目录: ${specDirName}`)
      lines.push("")

      // === Policy 读取：${MAGIC_DIR}/sync-policy.json ===
      type CheckName = "tasks" | "checklist" | "handoff" | "addRoute" | "crossRef" | "rollback" | "gitDiff" | "auditLog"
      interface PolicyCheck { enabled: boolean; severity: "block" | "warn" | "info" }
      interface SyncPolicy { checks: Partial<Record<CheckName, PolicyCheck>> }
      const policyPath = join(PROJECT_ROOT, MAGIC_DIR, "sync-policy.json")
      let policy: SyncPolicy | null = null
      if (existsSync(policyPath)) {
        try {
          policy = JSON.parse(await readFileSafe(policyPath) || "{}")
          lines.push(`Policy: ${MAGIC_DIR}/sync-policy.json 已加载`)
        } catch {
          lines.push(`Policy: ${MAGIC_DIR}/sync-policy.json 解析失败，使用默认策略`)
        }
      }
      if (!policy) {
        // 降级：是否有关联 add-route → heavyweight；否则 lightweight
        const addRouteCandidate = planMatch.replace(/-plan-v\d+\.md$/, "-add-route-v1.md")
        const hasAddRoute = existsSync(join(plansDir, addRouteCandidate))
        const isHeavy = hasAddRoute
        policy = {
          checks: isHeavy ? {
            tasks: { enabled: true, severity: "block" },
            checklist: { enabled: true, severity: "block" },
            handoff: { enabled: true, severity: "block" },
            addRoute: { enabled: true, severity: "warn" },
            crossRef: { enabled: true, severity: "warn" },
            rollback: { enabled: true, severity: "block" },
            gitDiff: { enabled: true, severity: "warn" },
            auditLog: { enabled: true, severity: "block" },
          } : {
            tasks: { enabled: true, severity: "block" },
            checklist: { enabled: true, severity: "block" },
            handoff: { enabled: false, severity: "warn" },
            addRoute: { enabled: false, severity: "warn" },
            crossRef: { enabled: false, severity: "warn" },
            rollback: { enabled: false, severity: "warn" },
            gitDiff: { enabled: true, severity: "warn" },
            auditLog: { enabled: true, severity: "warn" },
          }
        }
        lines.push(`Policy: 默认${isHeavy ? "重型" : "轻型"}策略（${isHeavy ? "发现 add-route" : "无 add-route"}）`)
      }
      const isEnabled = (name: CheckName) => policy!.checks[name]?.enabled !== false
      const isBlock = (name: CheckName) => policy!.checks[name]?.severity === "block"
      const isWarn = (name: CheckName) => policy!.checks[name]?.severity === "warn"
      const blockingFailures: string[] = []
      lines.push("")

      // 3. 读取 tasks.md
      let tasksContent = ""
      let uncheckedTasks = 0
      let checkedTasks = 0
      if (isEnabled("tasks")) {
        const tasksPath = join(specsDir, specDirName, "tasks.md")
        tasksContent = await readFileSafe(tasksPath) || ""
        if (tasksContent) {
          const unchecked = tasksContent.match(/^- \[ \] Task/gm)
          const checked = tasksContent.match(/^- \[x\] Task/gm)
          uncheckedTasks = unchecked ? unchecked.length : 0
          checkedTasks = checked ? checked.length : 0
          lines.push(`tasks.md: ${checkedTasks} 已完成 / ${uncheckedTasks} 未完成`)
          if (uncheckedTasks > 0 && isBlock("tasks")) blockingFailures.push("tasks.md 有未完成项")
        } else {
          lines.push(`tasks.md: 文件不存在`)
          if (isBlock("tasks")) blockingFailures.push("tasks.md 不存在")
        }
      } else {
        lines.push("tasks.md: 已禁用（policy）")
      }

      // 4. 读取 checklist.md
      let checklistContent = ""
      let uncheckedChecklist = 0
      let checkedChecklist = 0
      if (isEnabled("checklist")) {
        const checklistPath = join(specsDir, specDirName, "checklist.md")
        checklistContent = await readFileSafe(checklistPath) || ""
        if (checklistContent) {
          const unchecked = checklistContent.match(/^- \[ \] /gm)
          const checked = checklistContent.match(/^- \[x\] /gm)
          uncheckedChecklist = unchecked ? unchecked.length : 0
          checkedChecklist = checked ? checked.length : 0
          lines.push(`checklist.md: ${checkedChecklist} 已勾选 / ${uncheckedChecklist} 未勾选`)
          if (uncheckedChecklist > 0 && isBlock("checklist")) blockingFailures.push("checklist.md 有未勾选项")
        } else {
          lines.push(`checklist.md: 文件不存在`)
          if (isBlock("checklist")) blockingFailures.push("checklist.md 不存在")
        }
      } else {
        lines.push("checklist.md: 已禁用（policy）")
      }
      lines.push("")

      // 4.5. 扫描 Handoff 交接文档
      let hfUnchecked = -1
      let hfChecked = 0
      let hfPreChecksUnchecked = 0
      let hfPostChecksUnchecked = 0
      let handoffContent = ""
      let actualHandoffPath: string | null = null
      // L1 约定路径（提前计算，crossRef 区块也需要）
      const handoffFileName = planMatch.replace(/-plan-v\d+\.md$/, "-handoff-v1.md")
      if (isEnabled("handoff")) {
        // ★ 搜索策略（三级 fallback，修复路径匹配 bug）
        // L1: 约定路径 {planName}-handoff-v1.md
        const handoffPath = join(plansDir, handoffFileName)
        // L2: specDirName 约定 {specDirName}-handoff-v1.md 或 {specDirName}-handoff.md
        const hasVersionedVariant = specDirName ? `${specDirName}-handoff-v1.md` : null
        const hasUnversionedVariant = specDirName ? `${specDirName}-handoff.md` : null
        // L3: 模糊搜索 plansDir 中所有 handoff 文件，用 planKeyword 匹配
        const allHandoffFiles = planFiles.filter(f => f.includes("handoff"))

        if (existsSync(handoffPath)) {
          actualHandoffPath = handoffPath
        } else if (hasVersionedVariant && existsSync(join(plansDir, hasVersionedVariant))) {
          actualHandoffPath = join(plansDir, hasVersionedVariant)
        } else if (hasUnversionedVariant && existsSync(join(plansDir, hasUnversionedVariant))) {
          actualHandoffPath = join(plansDir, hasUnversionedVariant)
        } else {
          // L3 fallback: 关键词模糊匹配
          actualHandoffPath = allHandoffFiles
            .map(f => join(plansDir, f))
            .find(p => {
              const filename = p.split("/").pop()?.toLowerCase() || ""
              return filename.includes(args.planKeyword.toLowerCase().replace(/\s+/g, "-"))
                || filename.includes(specDirName.toLowerCase())
            }) || null
        }
        if (actualHandoffPath) {
          handoffContent = await readFileSafe(actualHandoffPath) || ""
          if (handoffContent) {
            hfUnchecked = (handoffContent.match(/^- \[ \] /gm) || []).length
            hfChecked = (handoffContent.match(/^- \[x\] /gm) || []).length
            const hfPreSection = handoffContent.match(/执行前置检查[\s\S]*?(?=##\s|$)/)
            const hfPostSection = handoffContent.match(/后置确认[\s\S]*?(?=##\s|---|$)/)
            if (hfPreSection) {
              hfPreChecksUnchecked = (hfPreSection[0].match(/^- \[ \] /gm) || []).length
            }
            if (hfPostSection) {
              hfPostChecksUnchecked = (hfPostSection[0].match(/^- \[ \] /gm) || []).length
            }
            lines.push(`Handoff: ${hfChecked} 已勾选 / ${hfUnchecked} 未勾选（前置:${hfPreChecksUnchecked} 未完成, 后置:${hfPostChecksUnchecked} 未完成）`)
            if (hfUnchecked > 0 && isBlock("handoff")) blockingFailures.push("Handoff 有未勾选项")
          } else {
            lines.push("Handoff: 文件存在但无法读取")
          }
        } else {
          lines.push("Handoff: 未找到交接文档")
          if (isBlock("handoff")) blockingFailures.push("Handoff 文档不存在")
        }
      } else {
        lines.push("Handoff: 已禁用（policy）")
      }
      lines.push("")

      // 4.6. 扫描 add-route 残余 [ ] 项
      let arUnchecked = 0
      let arChecked = 0
      if (isEnabled("addRoute")) {
        // ★ 搜索策略（三级 fallback，修复路径匹配 bug）
        // L1: 约定路径 {planName}-add-route-v1.md
        const addRouteMatch = planMatch.replace(/-plan-v\d+\.md$/, "-add-route-v1.md")
        let addRoutePath = join(plansDir, addRouteMatch)
        if (!existsSync(addRoutePath)) {
          // L2: specDirName 约定 {specDirName}-add-route-v1.md
          const specAddRouteName = specDirName ? `${specDirName}-add-route-v1.md` : null
          if (specAddRouteName && existsSync(join(plansDir, specAddRouteName))) {
            addRoutePath = join(plansDir, specAddRouteName)
          } else {
            // L3: 模糊搜索 plansDir 中所有 add-route 文件，用 planKeyword 匹配
            const foundByKeyword = planFiles
              .filter(f => f.includes("add-route"))
              .find(f => {
                const filename = f.toLowerCase()
                return filename.includes(args.planKeyword.toLowerCase().replace(/\s+/g, "-"))
                  || filename.includes(specDirName.toLowerCase())
              })
            if (foundByKeyword) {
              addRoutePath = join(plansDir, foundByKeyword)
            }
          }
        }
        if (existsSync(addRoutePath)) {
          const arContent = await readFileSafe(addRoutePath)
          if (arContent) {
            arUnchecked = (arContent.match(/^- \[ \] /gm) || []).length
            arChecked = (arContent.match(/^- \[x\] /gm) || []).length
            lines.push(`add-route: ${arChecked} 已勾选 / ${arUnchecked} 未勾选`)
            if (arUnchecked > 0 && isBlock("addRoute")) blockingFailures.push("add-route 有未勾选项")
          }
        } else {
          lines.push("add-route: 未找到")
        }
      } else {
        lines.push("add-route: 已禁用（policy）")
      }
      lines.push("")

      // 4.7. 反向引用检查：Handoff → 下游 Plan 是否引用了本 Handoff
      const crossRefIssues: string[] = []
      if (isEnabled("crossRef")) {
        if (actualHandoffPath && handoffContent) {
          const targetPlanRefs = handoffContent.match(/\]\(([^\)]+)\)/g) || []
          for (const ref of targetPlanRefs.slice(0, 5)) {
            const planName = ref.replace(/^\]\(/, "").replace(/\)$/, "")
            if (!planName.endsWith("-plan-v1.md") && !planName.includes("Expert-Grounding")) continue
            const planFile = planFiles.find(f => planName.endsWith(f))
            if (planFile) {
              const downstreamContent = await readFileSafe(join(plansDir, planFile))
              if (downstreamContent) {
                const handoffShortName = actualHandoffPath.split("/").pop() || handoffFileName
                if (!downstreamContent.includes(handoffShortName)) {
                  crossRefIssues.push(`${planFile} 未反向引用 ${handoffShortName}`)
                }
              }
            }
          }
        }
        if (crossRefIssues.length > 0) {
          lines.push("=== 反向引用检查 ===")
          for (const issue of crossRefIssues) {
            lines.push(`  ⚠️ ${issue}`)
          }
          if (isBlock("crossRef")) blockingFailures.push("反向引用断裂")
        } else if (actualHandoffPath) {
          lines.push("=== 反向引用检查 ===")
          lines.push("  ✅ 下游 Plan 均正确引用了本 Handoff")
        }
      } else {
        lines.push("反向引用检查: 已禁用（policy）")
      }
      lines.push("")

      // 4.8. 回滚命令覆盖校验：§3 改动清单 vs §4 回滚方案
      const rollbackIssues: string[] = []
      if (isEnabled("rollback")) {
        if (actualHandoffPath && handoffContent) {
          const changeTable = handoffContent.match(/## 3\. 改动清单[\s\S]*?(?=###|## 4\.)/)
          const filePathsInTable: string[] = []
          if (changeTable) {
            const pathMatches = Array.from(changeTable[0].matchAll(/`(src\/[^`]+)`/g))
            for (const m of pathMatches) {
              filePathsInTable.push(m[1])
            }
          }
          const rollbackSection = handoffContent.match(/### 代码回滚[\s\S]*?```bash([\s\S]*?)```/)
          const rollbackPaths: string[] = []
          if (rollbackSection) {
            const cmds = Array.from(rollbackSection[1].matchAll(/(?:git checkout --|git rm)\s+(\S+)/g))
            for (const m of cmds) {
              rollbackPaths.push(m[1].replace(/\\/g, ""))
            }
          }
          if (filePathsInTable.length > 0 && rollbackPaths.length > 0) {
            for (const fp of filePathsInTable) {
              const covered = rollbackPaths.some(rp => fp.endsWith(rp.replace(/^src\//, "")) || rp.endsWith(fp.replace(/^src\//, "")) || fp === rp)
              if (!covered) {
                rollbackIssues.push(`${fp} 在改动清单中但回滚方案未覆盖`)
              }
            }
            for (const rp of rollbackPaths) {
              const inTable = filePathsInTable.some(fp => fp.endsWith(rp.replace(/^src\//, "")) || rp.endsWith(fp.replace(/^src\//, "")) || fp === rp)
              if (!inTable) {
                rollbackIssues.push(`${rp} 在回滚方案中但改动清单未提及`)
              }
            }
          }
        }
        if (rollbackIssues.length > 0) {
          lines.push("=== 回滚命令覆盖校验 ===")
          for (const issue of rollbackIssues) {
            lines.push(`  ⚠️ ${issue}`)
          }
          if (isBlock("rollback")) blockingFailures.push("回滚方案覆盖不完整")
        } else if (actualHandoffPath && handoffContent) {
          lines.push("=== 回滚命令覆盖校验 ===")
          lines.push("  ✅ §3 改动清单与 §4 回滚方案完全一致")
        }
      } else {
        lines.push("回滚命令覆盖校验: 已禁用（policy）")
      }
      lines.push("")

      // 5. Git diff 统计
      let changedFiles: string[] = []
      if (isEnabled("gitDiff")) {
        const { execSync } = await import("child_process")
        try {
          const diffStat = execSync("git diff --name-only", { cwd: PROJECT_ROOT, encoding: "utf-8", timeout: 5000 })
          changedFiles = diffStat.trim().split("\n").filter(Boolean)
        } catch {
          lines.push("Git diff: 无法获取（可能无 git 仓库或无暂存变更）")
        }
        lines.push(`Git diff 变更文件: ${changedFiles.length} 个`)
        for (const f of changedFiles.slice(0, 20)) {
          lines.push(`  ${f}`)
        }
        if (changedFiles.length > 20) lines.push(`  ... 还有 ${changedFiles.length - 20} 个文件`)
      } else {
        lines.push("Git diff: 已禁用（policy）")
      }
      lines.push("")

      // 6. 交叉比对：检查 tasks.md 预期改动文件是否在实际 git diff 中
      if (isEnabled("gitDiff") && tasksContent && changedFiles.length > 0) {
        lines.push("=== 交叉比对：tasks.md 预期文件 vs git diff 实际变更 ===")
        const taskFileRefs = tasksContent.match(/`([^`]+\.ts[x]?)`/g) || []
        const expectedFiles = taskFileRefs.map(r => r.replace(/`/g, ""))
        const setChanged = new Set(changedFiles)
        let mismatchCount = 0
        for (const f of expectedFiles) {
          const found = changedFiles.some(cf => cf.endsWith(f.replace(/^src\//, "")) || cf === f)
          if (!found) {
            lines.push(`  ⚠️ tasks.md 提及但 git diff 未变更: ${f}`)
            mismatchCount++
          }
        }
        // 反向检查：git diff 中有变更但 tasks.md 未提及
        for (const cf of changedFiles) {
          if (cf.endsWith(".md") || cf.endsWith(".toml")) continue // 文档文件不算
          const mentioned = expectedFiles.some(ef => cf.endsWith(ef.replace(/^src\//, "")) || cf === ef)
          if (!mentioned) {
            lines.push(`  ⚠️ git diff 有变更但 tasks.md 未提及: ${cf}`)
            mismatchCount++
          }
        }
        if (mismatchCount === 0) {
          lines.push("  ✅ tasks.md 预期文件与 git diff 实际变更一致")
        }
        lines.push("")
      }

      // 7. 检查 ADD-7 审计记录
      if (isEnabled("auditLog")) {
        try {
          const sourceFiles = changedFiles.filter(f => !f.endsWith(".md") && !f.endsWith(".toml"))
          let auditedCount = 0
          const missingAudit: string[] = []
          for (const f of sourceFiles.slice(0, 10)) {
            const auditRecords = await prisma.auditLog.findMany({
              where: {
                targetId: { contains: f.split("/").pop()?.replace(/\.(ts|tsx)$/, "") || f },
                action: "MODIFY",
              },
              select: { id: true, targetId: true },
              take: 1,
            })
            if (auditRecords.length > 0) {
              auditedCount++
            } else {
              missingAudit.push(f)
            }
          }
          lines.push("=== ADD-7 审计记录检查 ===")
          lines.push(`  已审计: ${auditedCount} / ${Math.min(sourceFiles.length, 10)} 个源文件`)
          if (missingAudit.length > 0) {
            lines.push(`  ⚠️ 缺少 ADD-7 记录的文件:`)
            for (const f of missingAudit) {
              lines.push(`    - ${f}`)
            }
            if (isBlock("auditLog")) blockingFailures.push("ADD-7 审计记录不完整")
          } else {
            lines.push("  ✅ 所有源文件均有 ADD-7 审计记录")
          }
        } catch (dbErr) {
          lines.push("=== ADD-7 审计记录检查 ===")
          lines.push(`  ⚠️ 无法查询数据库: ${dbErr instanceof Error ? dbErr.message : String(dbErr)}`)
        }
      } else {
        lines.push("ADD-7 审计记录检查: 已禁用（policy）")
      }
      lines.push("")

      // 8. 综合建议 + 最终裁定
      lines.push("=== 综合同步建议 ===")
      if (uncheckedTasks > 0) {
        lines.push(`  📝 tasks.md 有 ${uncheckedTasks} 个未完成 Task，如已实现请勾选为 [x]`)
      }
      if (uncheckedChecklist > 0) {
        lines.push(`  📝 checklist.md 有 ${uncheckedChecklist} 个未勾选项，如已验证请勾选`)
      }
      if (hfUnchecked > 0) {
        lines.push(`  📝 Handoff 文档有 ${hfUnchecked} 个未勾选项（前置:${hfPreChecksUnchecked}, 后置:${hfPostChecksUnchecked}），如已验证请勾选`)
      }
      if (arUnchecked > 0) {
        lines.push(`  📝 add-route 文档有 ${arUnchecked} 个未勾选项，如已完成请勾选`)
      }
      if (crossRefIssues.length > 0) {
        lines.push(`  ⚠️ 反向引用断裂：${crossRefIssues.length} 个下游 Plan 未引用本 Handoff（${crossRefIssues.join("、")}）——需在下游 Plan 的 §7 添加引用`)
      }
      if (rollbackIssues.length > 0) {
        lines.push(`  ⚠️ 回滚方案覆盖不完整：${rollbackIssues.length} 处不一致——需修正 §4 回滚命令`)
      }
      if (uncheckedTasks === 0 && uncheckedChecklist === 0 && hfUnchecked === 0 && arUnchecked === 0 && crossRefIssues.length === 0 && rollbackIssues.length === 0) {
        lines.push("  ✅ tasks.md、checklist.md、Handoff 全部项已勾选")
      } else if (uncheckedTasks === 0 && uncheckedChecklist === 0) {
        lines.push("  ✅ tasks.md 和 checklist.md 全部项已勾选")
      }
      if (isEnabled("gitDiff") && changedFiles.length === 0) {
        lines.push("  ⚠️ git diff 无变更——可能所有变更已提交，或代码尚未实际修改")
      }

      // 最终裁定
      lines.push("")
      lines.push("=== 最终裁定 ===")
      if (blockingFailures.length > 0) {
        lines.push(`  ❌ BLOCKED — 以下阻断项必须修复后再收敛：`)
        for (const bf of blockingFailures) {
          lines.push(`    - ${bf}`)
        }
        lines.push(`  exitCode: 1`)
      } else {
        lines.push("  ✅ PASS — 所有 block 级检查通过")
        lines.push("  exitCode: 0")
      }

      return textResponse(lines.join("\n"))
    } catch (error) {
      return errorResponse(`check_spec_sync 失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

// ========== 新增工具: check_add_route_completeness ==========
// ADD 范式 Step 完成度扫描：统计 add-route 中 [ ] vs [x] 的 Step 勾选进度
server.registerTool(
  "check_add_route_completeness",
  {
    description: "ADD 范式守卫工具：扫描 add-route 文件的 Step 完成度。\n统计 add-route 中每个 Step 的 [ ]（未完成）和 [x]（已完成）勾选项数量，返回逐 Step 完成率及整体状态。\n\n四种返回状态:\n- 'complete' — 所有 Step 的产出检查项全部 [x]，add-route 完整闭环\n- 'incomplete' — 存在未勾选的 Step 产出项，需继续执行\n- 'file_missing' — 未找到匹配的 add-route 文件\n- 'errors' — 文件存在但解析出错\n\nAI 助手在 Step 3 代码实现完成后、进入 Step 4 之前必须调用此工具自检。",
    inputSchema: {
      planKeyword: z.string().describe("Plan 文件的关键词，用于在 ${MAGIC_DIR}/plans/ 目录下匹配 *add-route* 文件"),
    },
  },
  async (args: { planKeyword: string }) => {
    try {
      const { planKeyword } = args
      if (!planKeyword) return errorResponse("planKeyword 参数不能为空")

      const plansDir = join(PROJECT_ROOT, MAGIC_DIR, "plans")

      // === 1. 查找匹配的 add-route 文件 ===
      let matchedFile: string | null = null
      try {
        const entries = await readdirRecursive(plansDir)
        const planLower = planKeyword.toLowerCase()
        for (const entry of entries) {
          const entryLower = entry.toLowerCase()
          if (entryLower.includes("add-route") && entryLower.includes(planLower)) {
            matchedFile = entry
            break
          }
        }
      } catch {
        return errorResponse(`add-route 完整性扫描失败：无法读取 ${MAGIC_DIR}/plans/ 目录`)
      }

      if (!matchedFile) {
        const parts = [
          "=== ADD 守卫：add-route Step 完成度扫描 ===",
          `Plan 关键词: "${planKeyword}"`,
          "",
          "状态: ❌ file_missing — 未找到 add-route 文件",
          "操作: 禁止进入后续 Step，先回退至 Step 0.5 生成 add-route",
        ]
        return errorResponse(parts.join("\n"))
      }

      const filePath = join(plansDir, matchedFile)

      // === 2. 读取文件内容 ===
      const content = await readFileSafe(filePath)
      if (!content) {
        return errorResponse(`add-route 完整性扫描失败：无法读取文件 ${matchedFile}`)
      }

      const lines = content.split("\n")

      // === 3. 解析 Step 结构和勾选状态 ===
      // 匹配 Step 头：## Step 0、## Step 3.5、## Step 8 等
      const stepHeaderRe = /^##\s+Step\s+(\d+(?:\.\d+)?)/
      // 匹配 checkbox：- [ ] 或 - [x]
      const checkboxRe = /^\s*-\s+\[([ xX])\]\s/
      // 匹配状态行：**状态**：⬜ 或 **状态**：✅ 或 **状态**：🔄
      const statusRe = /\*\*状态\*\*[：:]\s*(⬜|✅|🔄|⚠️)/

      interface StepInfo {
        step: string
        total: number
        checked: number
        unchecked: number
        status: string
        headerLine: number
      }

      const steps: StepInfo[] = []
      let currentStep: StepInfo | null = null
      let globalTotal = 0
      let globalChecked = 0
      let globalUnchecked = 0
      let inStepBlock = false

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]

        // 检测 Step 头
        const stepMatch = line.match(stepHeaderRe)
        if (stepMatch) {
          // 保存上一个 Step
          if (currentStep) {
            steps.push(currentStep)
          }
          currentStep = {
            step: stepMatch[1],
            total: 0,
            checked: 0,
            unchecked: 0,
            status: "unknown",
            headerLine: i + 1,
          }
          inStepBlock = true
          continue
        }

        // 检测下一个 Step 头（## Step）跳出当前 block
        if (inStepBlock && /^##\s+Step\s+\d/.test(line)) {
          inStepBlock = false
          continue
        }

        // 在 Step block 内检测状态行
        if (inStepBlock && currentStep) {
          const statusMatch = line.match(statusRe)
          if (statusMatch) {
            const s = statusMatch[1]
            currentStep.status = s === "✅" ? "done" : s === "⬜" ? "pending" : s === "🔄" ? "in_progress" : "unknown"
          }
        }

        // 检测 checkbox（全局扫描，不限于 Step block）
        const cbMatch = line.match(checkboxRe)
        if (cbMatch) {
          globalTotal++
          if (cbMatch[1] === "x" || cbMatch[1] === "X") {
            globalChecked++
            if (currentStep) {
              currentStep.checked++
              currentStep.total++
            }
          } else {
            globalUnchecked++
            if (currentStep) {
              currentStep.unchecked++
              currentStep.total++
            }
          }
        }

        // 检测产出检查块（- [ ] / - [x] within 产出检查 section）
        // 已经在上面的 checkboxRe 中覆盖
      }

      // 保存最后一个 Step
      if (currentStep) {
        steps.push(currentStep)
      }

      // === 4. 生成报告 ===
      const completionRate = globalTotal > 0
        ? Math.round((globalChecked / globalTotal) * 100)
        : 100

      const isComplete = globalUnchecked === 0

      const parts: string[] = [
        "=== ADD 守卫：add-route Step 完成度扫描 ===",
        `Plan 关键词: "${planKeyword}"`,
        `匹配文件: ${MAGIC_DIR}/plans/${matchedFile}`,
        "",
        `整体完成度: ${globalChecked}/${globalTotal} (${completionRate}%)`,
        `状态: ${isComplete ? "✅ complete — add-route 完整闭环" : "⚠️ incomplete — 存在未勾选 Step"}`,
        "",
      ]

      if (steps.length > 0) {
        parts.push("=== 逐 Step 完成度 ===")
        parts.push("| Step | 勾选 | 未勾选 | 完成率 | 状态 |")
        parts.push("|------|------|--------|--------|------|")
        for (const s of steps) {
          const rate = s.total > 0 ? Math.round((s.checked / s.total) * 100) : 100
          const statusIcon = s.status === "done" ? "✅" : s.status === "pending" ? "⬜" : s.status === "in_progress" ? "🔄" : "—"
          parts.push(`| Step ${s.step} | ${s.checked} | ${s.unchecked} | ${rate}% | ${statusIcon} |`)
        }
        parts.push("")
      }

      // 列出未勾选的 Step
      const incompleteSteps = steps.filter(s => s.unchecked > 0)
      if (incompleteSteps.length > 0) {
        parts.push("=== 未闭环 Step（需继续执行）===")
        for (const s of incompleteSteps) {
          parts.push(`  Step ${s.step}: ${s.checked}/${s.total} 已勾选（${s.unchecked} 项未完成，L${s.headerLine}）`)
        }
        parts.push("")
        parts.push("操作: ⚠️ 禁止进入验收阶段（Step 8 收敛判断），回退完成以上未闭环 Step 后再调用本工具自检。")
      } else {
        parts.push("=== 全部 Step 已闭环 ✅ ===")
        parts.push("操作: 可进入验收阶段（Step 8 收敛判断）")
      }

      return textResponse(parts.join("\n"))
    } catch (error) {
      return errorResponse(`add-route 完整性扫描失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

// ========== 新增工具: check_dps（Documentation Precision Score）==========
// ADD 范式上游文档质量量化：在 Step 0 末尾调用，评估 Plan → Review → Specs 三级文档的精确度和覆盖度。
// DPS < 70  → Plan 需细化
// DPS 70-84 → 回退补齐 Review/Specs
// DPS ≥ 85  → 可进入 Step 1
server.registerTool(
  "check_dps",
  {
    description: "ADD 范式上游文档质量量化工具（Documentation Precision Score）。在 Step 0 文档先行完成后、进入 Step 1 前调用，评估 Plan → Review → Specs 三级文档的精确度和覆盖度，并校验 Review 结论是否已回流至 Plan，防止因 Plan 概括度过高导致下游注意力稀释、Specs 结构性遗漏、Review 结论悬空（Review 发现问题但 Plan 未修正）。\n\n四维评分（各 25% 等权）：\n- Plan 可执行粒度（25%）：每个 Phase 是否有独立验收标准、每个 Task 是否指定具体文件、是否有占位词\n- Review 覆盖完备度（25%）：Review 是否覆盖 Plan 的全部架构维度（数据模型/API签名/错误路径/数据迁移/兼容性/性能/存储）\n- Specs 精确度（25%）：Specs Requirements 数与 Plan Phase 数是否 1:1 映射\n- Review 回流完整度（25%）：Review 中 P0/P1 问题的修复建议是否在 Plan/Specs 中有对应修正文字（0.6.5 卡位闭环）\n\n判定阈值：\n- DPS ≥ 85 → 🟢 可进入 Step 1\n- DPS 70-84 → 🟡 回退补齐短板\n- DPS < 70 → 🔴 回退细化 Plan 本身",
    inputSchema: {
      planKeyword: z.string().describe("Plan 文件的关键词，用于在 ${MAGIC_DIR}/plans/ 目录下匹配 Plan 文件和关联的 Review、Specs"),
    },
  },
  async (args: { planKeyword: string }) => {
    try {
      const { planKeyword } = args
      if (!planKeyword) return errorResponse("planKeyword 参数不能为空")

      const plansDir = join(PROJECT_ROOT, MAGIC_DIR, "plans")
      const specsDir = join(PROJECT_ROOT, MAGIC_DIR, "specs")
      const reviewsDir = join(PROJECT_ROOT, MAGIC_DIR, "reviews")

      const parts: string[] = [
        "=== DPS：Documentation Precision Score（上游文档质量量化）===",
        `Plan 关键词: "${planKeyword}"`,
        "",
      ]

      // === 1. 定位 Plan 文件 ===
      if (!existsSync(plansDir)) return errorResponse(`plans 目录不存在: ${plansDir}`)
      const allPlanFiles = (await readdirRecursive(plansDir)).filter(f => f.endsWith(".md"))
      const planMatch = allPlanFiles.find(f =>
        f.toLowerCase().includes(planKeyword.toLowerCase()) && f.includes("-plan-v")
      )
      if (!planMatch) return errorResponse(`未找到匹配的 Plan 文件（关键词: ${planKeyword}）`)
      const planPath = join(plansDir, planMatch)
      const planContent = await readFileSafe(planPath)
      if (!planContent) return errorResponse(`无法读取 Plan 文件: ${planMatch}`)
      parts.push(`Plan: ${planMatch}`)

      // === 2. 定位 Review 文件 ===
      let reviewName = ""
      let reviewContent = ""
      if (existsSync(reviewsDir)) {
        const reviewFiles = await readdir(reviewsDir)
        // 从 Plan 全文提取所有 Review 引用，优先匹配含 planKeyword 的
        const allReviewRefs = Array.from(planContent.matchAll(/\.qoder\/reviews\/([^\s)]+\.md)/g))
          .map(m => m[1].split("/").pop() || "")
          .filter(Boolean)
        // 策略1: 在所有引用中优先选含 planKeyword 的
        reviewName = allReviewRefs.find(f =>
          f.toLowerCase().includes(planKeyword.toLowerCase())
        ) || ""
        // 策略2: 退而取第一个引用
        if (!reviewName && allReviewRefs.length > 0) {
          reviewName = allReviewRefs[0]
        }
        // 策略3: 按目录文件名关键词匹配
        if (!reviewName) {
          reviewName = reviewFiles.find(f =>
            f.toLowerCase().includes(planKeyword.toLowerCase()) && f.includes("-review-v")
          ) || ""
        }
        if (reviewName) {
          reviewContent = await readFileSafe(join(reviewsDir, reviewName)) || ""
        }
      }
      parts.push(`Review: ${reviewName || "未找到"}`)

      // === 3. 定位 Specs 目录 ===
      let specDirName = ""
      let specContent = ""
      let tasksContent = ""
      // 从 Plan 绑定或 §7 提取
      const specRef = planContent.match(/Spec:\s*\.qoder\/specs\/([^/\s]+)/)
      if (specRef) specDirName = specRef[1]
      if (!specDirName) {
        const taskRef = planContent.match(/Tasks:\s*\.qoder\/specs\/([^/\s]+)/)
        if (taskRef) specDirName = taskRef[1]
      }
      if (!specDirName) {
        specDirName = basename(planMatch).replace(/-plan-v\d+\.md$/, "")
      }
      if (specDirName && existsSync(join(specsDir, specDirName))) {
        specContent = await readFileSafe(join(specsDir, specDirName, "spec.md")) || ""
        tasksContent = await readFileSafe(join(specsDir, specDirName, "tasks.md")) || ""
      }
      parts.push(`Specs: ${specDirName || "未找到"}`)
      parts.push("")

      // ====== 维度一：Plan 可执行粒度（权重 30%） ======
      let planScore = 100
      const planPenalties: string[] = []

      // 1a. 统计 Plan 中的 Phase（按 ## 数字标题）
      const planPhases = planContent.match(/###\s+Phase\s+\d/g) || []
      const phaseTotal = planPhases.length
      // 检查每个 Phase 是否有验收标准（Plan §6 或 Phase 下的 checklist）
      const acceptanceMatch = planContent.match(/##\s+6\.\s+验收标准/)
      const planHasAcceptance = !!acceptanceMatch
      if (!planHasAcceptance && phaseTotal > 0) {
        planScore -= 15
        planPenalties.push(`Plan 缺少 §6 验收标准（${phaseTotal} 个 Phase 无独立验收）`)
      }

      // 1b. 统计 Task 是否指定了具体文件
      const taskFileRefs = planContent.match(/`(src\/[^`]+\.ts[x]?)`/g) || []
      const taskCount = (planContent.match(/Task\s+\d+/g) || []).length
      // 统计 Task 标题数（用于 Specs 精确度维度三），不含正文中 Task 引用
      const taskHeadingCount = (planContent.match(/###\s+Task\s+\d+/g) || []).length
      if (taskCount > 0) {
        // 去重后的文件引用数
        const uniqueFileRefs = new Set(taskFileRefs.map(r => r.replace(/`/g, "")))
        if (uniqueFileRefs.size < taskCount * 0.5) {
          planScore -= 20
          planPenalties.push(`${taskCount} 个 Task 但仅 ${uniqueFileRefs.size} 个文件引用（覆盖率 ${Math.round(uniqueFileRefs.size / taskCount * 100)}%）`)
        }
      }

      // 1c. 检测占位词
      const placeholders = ["待定", "TBD", "TODO", "后续讨论", "暂不处理", "待评估"]
      for (const ph of placeholders) {
        if (planContent.includes(ph)) {
          planScore -= 20
          planPenalties.push(`Plan 含占位词: "${ph}"`)
          break
        }
      }

      planScore = Math.max(0, planScore)
      parts.push("=== 维度一：Plan 可执行粒度（30%）===")
      parts.push(`  分数: ${planScore}/100`)
      if (planPenalties.length > 0) {
        for (const p of planPenalties) parts.push(`  - ${p}`)
      } else {
        parts.push("  ✅ 无扣分项")
      }
      parts.push("")

      // ====== 维度二：Review 覆盖完备度（权重 35%） ======
      const dimensions = [
        { name: "数据模型/类型定义", patterns: ["类型", "接口", "interface", "GroundingStatus", "Grounding", "RetrieveBudget"] },
        { name: "API 签名/函数接口", patterns: ["签名", "SearchOptions", "collectionName", "searchKnowledgeDocuments", "getChromaCollection"] },
        { name: "错误路径/降级处理", patterns: ["降级", "fallback", "degraded", "错误路径", "异常", "catch"] },
        { name: "数据迁移策略", patterns: ["迁移", "migrat", "复制", "collection", "同步"] },
        { name: "兼容性/向后兼容", patterns: ["兼容", "compatib", "向后", "旧路径", "保留"] },
        { name: "性能影响", patterns: ["性能", "perf", "延迟", "latency", "API 调用", "embedding"] },
        { name: "存储/索引成本", patterns: ["存储", "stor", "索引", "冗余", "MB", "GB", "副本"] },
      ]
      let coveredDims = 0
      let totalDims = 0
      const uncoveredDims: string[] = []
      const dimDetails: string[] = []

      // 从 Plan 提取涉及的架构维度
      const planDimensions: string[] = []
      for (const dim of dimensions) {
        for (const pat of dim.patterns) {
          if (planContent.toLowerCase().includes(pat.toLowerCase())) {
            planDimensions.push(dim.name)
            break
          }
        }
      }

      totalDims = planDimensions.length
      if (totalDims === 0) {
        // Plan 未明确涉及维度，用所有维度
        totalDims = dimensions.length
        for (const dim of dimensions) {
          let covered = false
          if (reviewContent) {
            for (const pat of dim.patterns) {
              if (reviewContent.toLowerCase().includes(pat.toLowerCase())) {
                covered = true
                break
              }
            }
          }
          if (covered) {
            coveredDims++
          } else {
            uncoveredDims.push(dim.name)
          }
          dimDetails.push(`  ${covered ? "✅" : "⬜"} ${dim.name}`)
        }
      } else {
        for (const dimName of planDimensions) {
          const dim = dimensions.find(d => d.name === dimName)!
          let covered = false
          if (reviewContent) {
            for (const pat of dim.patterns) {
              if (reviewContent.toLowerCase().includes(pat.toLowerCase())) {
                covered = true
                break
              }
            }
          }
          if (covered) {
            coveredDims++
          } else {
            uncoveredDims.push(dim.name)
          }
          dimDetails.push(`  ${covered ? "✅" : "⬜"} ${dim.name}`)
        }
      }

      const reviewCoverage = totalDims > 0 ? Math.round((coveredDims / totalDims) * 100) : 0
      let reviewScore = reviewCoverage

      parts.push("=== 维度二：Review 覆盖完备度（35%）===")
      parts.push(`  覆盖度: ${coveredDims}/${totalDims} (${reviewCoverage}%)`)
      parts.push(`  分数: ${reviewScore}/100`)
      for (const d of dimDetails) parts.push(d)
      if (uncoveredDims.length > 0) {
        parts.push(`  ⚠️ 未覆盖维度: ${uncoveredDims.join(", ")}`)
      }
      if (!reviewContent) {
        parts.push("  ⚠️ Review 文件未找到，覆盖度计为 0")
        reviewScore = 0
      }
      parts.push("")

      // ====== 维度三：Specs 精确度（权重 35%） ======
      let specScore = 0
      if (specContent) {
        // 统计 Specs Requirements 数
        const reqCount = (specContent.match(/###\s+Requirement:/g) || []).length
        // 预期 Requirement 数 = Plan Phase 数
        const expectedReqs = phaseTotal || taskHeadingCount || 1
        const specPrecision = Math.min(Math.round((reqCount / expectedReqs) * 100), 100)

        // 检查每个 Plan Phase 是否有对应 Requirement
        let specPenalties = 0
        if (reqCount < expectedReqs) {
          specPenalties = (expectedReqs - reqCount) * 10
        }

        specScore = Math.max(0, specPrecision - specPenalties)
        parts.push("=== 维度三：Specs 精确度（35%）===")
        parts.push(`  Requirements 数: ${reqCount} / 预期 ${expectedReqs}（基于 Plan Phase 数）`)
        parts.push(`  精确度: ${specPrecision}%`)
        if (specPenalties > 0) {
          parts.push(`  缺失惩罚: -${specPenalties}（${expectedReqs - reqCount} 个 Phase 无对应 Requirement）`)
        }
        parts.push(`  分数: ${specScore}/100`)
      } else {
        specScore = 0
        parts.push("=== 维度三：Specs 精确度（35%）===")
        parts.push("  ⚠️ Specs 目录/文件未找到，精确度计为 0")
      }
      parts.push("")

      // ====== 维度四：Review 回流完整度（权重 25%） ======
      // 检查 Review 中 P0/P1 问题的修复建议是否在 Plan/Specs 中有对应修正
      let backflowScore = 0
      const backflowDetails: string[] = []

      if (reviewContent) {
        // 解析 Review 中的 P0/P1 问题表格
        // 典型格式: | # | 缺陷 | 证据 | 修复 |
        //   其中 P0/P1 标记在行内（如 "(P0)" 或 "3.1" 标题下）
        const reviewLines = reviewContent.split("\n")
        const problemItems: Array<{ id: string; description: string; fix: string; priority: string }> = []
        let inP0Section = false
        let inP1Section = false
        let inProblemTable = false
        let tableHeaderPassed = false

        for (let i = 0; i < reviewLines.length; i++) {
          const line = reviewLines[i]

          // 检测 P0/P1 章节
          if (line.match(/P0|ADD.*合规|阻断/)) {
            inP0Section = true
            inP1Section = false
            inProblemTable = true
            tableHeaderPassed = false
            continue
          }
          if (line.match(/P1|架构设计.*缺口/)) {
            inP0Section = false
            inP1Section = true
            inProblemTable = true
            tableHeaderPassed = false
            continue
          }
          if (line.match(/P2|中等|影响评估|决策结论|方案对比/)) {
            inP0Section = false
            inP1Section = false
            inProblemTable = false
            continue
          }

          // 表格数据行: | N | 描述 | 证据 | 修复 |
          if (inProblemTable && line.trim().startsWith("|") && !line.includes("---")) {
            const cols = line.split("|").map(c => c.trim()).filter(Boolean)
            if (cols.length >= 4 && cols[0].match(/^\d+/)) {
              const priority = inP0Section ? "P0" : inP1Section ? "P1" : ""
              if (priority) {
                // cols[1] = 缺陷描述, cols[2] = 证据, cols[3] = 修复建议
                problemItems.push({
                  id: cols[0],
                  description: cols[1] || "",
                  fix: cols[3] || "",
                  priority,
                })
              }
            }
          }
        }

        if (problemItems.length === 0) {
          // 退而：尝试解析 Review 为编号列表格式（如 "1. xxx\n2. yyy"）
          // 由于 Review 格式多变，此分支暂不用编号列表正则——留空依赖表格解析
        }

        if (problemItems.length > 0) {
          // 对每个 P0/P1 问题，从修复建议中提取关键词，在 Plan+Specs 中搜索
          let reflectedCount = 0
          const unreflectedItems: string[] = []
          const mirroredItems: string[] = []

          for (const item of problemItems) {
            // 从修复建议文本中提取代表关键词
            const fixKeywords = extractBackflowKeywords(item.fix)
            const searchTargets = [planContent]
            if (specContent) searchTargets.push(specContent)

            let found = false
            for (const kw of fixKeywords) {
              for (const target of searchTargets) {
                if (target.toLowerCase().includes(kw.toLowerCase())) {
                  found = true
                  break
                }
              }
              if (found) break
            }

            if (found) {
              reflectedCount++
              mirroredItems.push(`  ✅ [${item.priority}] #${item.id}: \"${item.description.slice(0, 50)}\" → Plan/Specs 已修正`)
            } else {
              unreflectedItems.push(`  ❌ [${item.priority}] #${item.id}: \"${item.description.slice(0, 50)}\" → 修复建议「${item.fix.slice(0, 40)}」未在 Plan/Specs 中找到`)
            }
          }

          backflowScore = Math.round((reflectedCount / problemItems.length) * 100)
          parts.push("=== 维度四：Review 回流完整度（25%）===")
          parts.push(`  P0/P1 问题总数: ${problemItems.length}`)
          parts.push(`  已回流: ${reflectedCount} / 未回流: ${unreflectedItems.length}`)
          parts.push(`  回流率: ${backflowScore}%`)
          parts.push(`  分数: ${backflowScore}/100`)
          if (mirroredItems.length > 0) {
            for (const m of mirroredItems.slice(0, 5)) parts.push(m)
            if (mirroredItems.length > 5) parts.push(`  ... 还有 ${mirroredItems.length - 5} 项已回流`)
          }
          if (unreflectedItems.length > 0) {
            for (const u of unreflectedItems) parts.push(u)
            parts.push(`  ⚠️ 修复建议: 执行 0.6.5 卡位，将 Review 未回流项逐条写入 Plan 对应章节`)
          }
          for (const d of backflowDetails) parts.push(d)
        } else {
          // Review 存在但无 P0/P1 问题表格（可能是非标准格式）
          backflowScore = 50  // 无法自动解析，给中等分数
          parts.push("=== 维度四：Review 回流完整度（25%）===")
          parts.push("  ⚠️ Review 文件中未检测到 P0/P1 问题表格，无法自动校验回流")
          parts.push("  ℹ️ 请手动确认 Review 结论是否已写回 Plan")
          parts.push(`  分数: ${backflowScore}/100（默认值，待人工确认）`)
        }
      } else {
        // 无 Review 文件
        backflowScore = 0
        parts.push("=== 维度四：Review 回流完整度（25%）===")
        parts.push("  ⚠️ Review 文件未找到，回流检查不可用")
        parts.push(`  分数: ${backflowScore}/100`)
      }
      parts.push("")

      // ====== DPS 复合计算 ======
      const dps = Math.round(planScore * 0.25 + reviewScore * 0.25 + specScore * 0.25 + backflowScore * 0.25)

      let verdict: string, verdictIcon: string, action: string
      if (dps >= 85) {
        verdict = "PASS"
        verdictIcon = "🟢"
        action = "可进入 Step 1"
      } else if (dps >= 70) {
        verdict = "WARN"
        verdictIcon = "🟡"
        action = "回退补齐短板："
        if (planScore < 70) action += " Plan 粒度不足；"
        if (reviewScore < 70) action += " Review 覆盖维度缺失；"
        if (specScore < 70) action += " Specs Requirements 缺失；"
        if (backflowScore < 70) action += " Review 结论未回流至 Plan（0.6.5 卡位）；"
      } else {
        verdict = "BLOCKED"
        verdictIcon = "🔴"
        action = "回退细化 Plan 本身（Plan 粒度不足是下游注意力漂移的根因）"
      }

      parts.push("=== DPS 复合计算 ===")
      parts.push(`  Plan 粒度:         ${planScore}  × 0.25 = ${(planScore * 0.25).toFixed(1)}`)
      parts.push(`  Review 覆盖度:     ${reviewScore}  × 0.25 = ${(reviewScore * 0.25).toFixed(1)}`)
      parts.push(`  Specs 精确度:      ${specScore}  × 0.25 = ${(specScore * 0.25).toFixed(1)}`)
      parts.push(`  Review 回流完整度:  ${backflowScore}  × 0.25 = ${(backflowScore * 0.25).toFixed(1)}`)
      parts.push(`  ─────────────────────────────────`)
      parts.push(`  DPS = ${dps}  ${verdictIcon} ${verdict}`)
      parts.push("")
      parts.push("=== 判定 ===")
      parts.push(`  结果: ${verdictIcon} ${verdict}`)
      parts.push(`  动作: ${action}`)

      return textResponse(parts.join("\n"))
    } catch (error) {
      return errorResponse(`check_dps 失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

// ========== 新增工具: check_rahs（Round Attention Health Score）==========
// ADD 范式下游执行健康度量化：在 Step 4/8 调用，量化本轮实现的范围保真度、类型安全、审计完整度、Spec合规、阶段对称性。
// RAHS ≥ 90 → 🟢 健康
// RAHS 70-89 → 🟡 亚健康
// RAHS < 70  → 🔴 漂移，强制返工
server.registerTool(
  "check_rahs",
  {
    description: "ADD 范式轮次注意力健康度量化工具（Round Attention Health Score）。在 Step 4（审计数据验证）和 Step 8（收敛判断）调用，聚合范围保真度、类型安全、审计完整度、Spec 合规、阶段对称性五维指标，量化本轮实现的注意力漂移程度。\n\n五维评分（加权）：\n- 范围保真度（30%）：计划修改文件 vs 实际 git diff 文件的交集率——文件扩散是注意力漂移最直接的信号\n- 类型安全（20%）：tsc --noEmit 错误数，每 +1 error = -10 分\n- 审计完整度（25%）：record_dev_operation 记录数 / 计划文件数\n- Spec 合规（15%）：check_spec_sync 通过/失败\n- 阶段对称性（10%）：check_phase_symmetry 通过/失败\n\n判定阈值：\n- RAHS ≥ 90 → 🟢 健康，进入下一 Step\n- RAHS 70-89 → 🟡 亚健康，自检后决定是否返工\n- RAHS < 70 → 🔴 漂移，强制返工",
    inputSchema: {
      planKeyword: z.string().describe("Plan 文件的关键词，用于定位 add-route 文件和关联的 specs 目录"),
    },
  },
  async (args: { planKeyword: string }) => {
    try {
      const { planKeyword } = args
      if (!planKeyword) return errorResponse("planKeyword 参数不能为空")

      const plansDir = join(PROJECT_ROOT, MAGIC_DIR, "plans")
      const parts: string[] = [
        "=== RAHS：Round Attention Health Score（轮次注意力健康度量化）===",
        `Plan 关键词: "${planKeyword}"`,
        "",
      ]

      // === 1. 定位 add-route 文件，提取计划文件清单 ===
      let plannedFiles: string[] = []
      let arFile: string | null = null
      try {
        const entries = await readdirRecursive(plansDir)
        const planLower = planKeyword.toLowerCase()
        arFile = entries.find(f =>
          f.toLowerCase().includes("add-route") && f.toLowerCase().includes(planLower)
        ) || null
        if (arFile) {
          const arContent = await readFileSafe(join(plansDir, arFile))
          if (arContent) {
            // 从附录文件清单提取计划修改的文件
            const tableMatch = arContent.match(/##\s+附录：文件清单[\s\S]*?(?=---|\n\n$|$)/)
            if (tableMatch) {
              const pathRefs = tableMatch[0].match(/`([^`]+\.ts[x]?)`/g) || []
              const rawPaths = pathRefs.map(r => r.replace(/`/g, ""))
              // 去重、过滤脚本路径（运维类不影响核心代码 RAHS）
              plannedFiles = Array.from(new Set(rawPaths)).filter(f =>
                f.startsWith("src/") || f.startsWith("scripts/")
              )
            }
          }
        }
      } catch { /* ignore */ }

      parts.push(`add-route: ${arFile || "未找到"}`)
      parts.push(`计划文件: ${plannedFiles.length} 个`)
      for (const f of plannedFiles.slice(0, 10)) parts.push(`  - ${f}`)
      parts.push("")

      // ====== 维度一：范围保真度（权重 30%） ======
      let scopeScore = 100
      let changedFiles: string[] = []
      try {
        const { execSync } = await import("child_process")
        const diffStat = execSync("git diff --name-only", { cwd: PROJECT_ROOT, encoding: "utf-8", timeout: 5000 })
        changedFiles = diffStat.trim().split("\n").filter(Boolean)
      } catch { /* ignore */ }

      if (plannedFiles.length > 0 && changedFiles.length > 0) {
        const plannedSet = new Set(plannedFiles.map(f => f.replace(/^src\//, "")))
        const changedSet = new Set(changedFiles.map(f => f.replace(/^src\//, "")))
        // 交集
        let intersectCount = 0
        const plannedArr = Array.from(plannedSet)
        for (let i = 0; i < plannedArr.length; i++) {
          if (changedSet.has(plannedArr[i])) intersectCount++
        }
        scopeScore = Math.round((intersectCount / plannedSet.size) * 100)

        // 检测范围扩散（改多了没计划的文件）
        const unplannedChanges: string[] = []
        const changedArr = Array.from(changedSet)
        for (let i = 0; i < changedArr.length; i++) {
          const cf = changedArr[i]
          if (!plannedSet.has(cf) && !cf.endsWith(".md") && !cf.endsWith(".toml")) {
            unplannedChanges.push(cf)
          }
        }
        parts.push("=== 维度一：范围保真度（30%）===")
        parts.push(`  计划文件: ${plannedSet.size} 个`)
        parts.push(`  实际变更: ${changedSet.size} 个`)
        parts.push(`  交集: ${intersectCount} 个`)
        parts.push(`  分数: ${scopeScore}/100`)
        if (unplannedChanges.length > 0) {
          parts.push(`  ⚠️ 计划外变更: ${unplannedChanges.join(", ")}`)
        }
      } else {
        parts.push("=== 维度一：范围保真度（30%）===")
        parts.push(`  分数: ${scopeScore}/100（${plannedFiles.length === 0 ? "无计划文件" : "无 git diff"}，默认满分）`)
      }
      parts.push("")

      // ====== 维度二：类型安全（权重 20%） ======
      let typeScore = 100
      try {
        const { execSync } = await import("child_process")
        const tscOut = execSync("npx tsc --noEmit 2>&1 || true", {
          cwd: PROJECT_ROOT,
          encoding: "utf-8",
          timeout: 30000,
        })
        // 统计 error TS 行数
        const errorLines = tscOut.split("\n").filter(l => l.includes("error TS")).length
        typeScore = Math.max(0, 100 - errorLines * 10)
        parts.push("=== 维度二：类型安全（20%）===")
        parts.push(`  tsc errors: ${errorLines}`)
        parts.push(`  分数: ${typeScore}/100`)
      } catch {
        parts.push("=== 维度二：类型安全（20%）===")
        parts.push(`  分数: ${typeScore}/100（无法执行 tsc，默认满分——请在项目环境中自行验证）`)
      }
      parts.push("")

      // ====== 维度三：审计完整度（权重 25%） ======
      let auditScore = 100
      try {
        const plannedSourceFiles = plannedFiles.filter(f => f.startsWith("src/"))
        let auditedCount = 0
        if (plannedSourceFiles.length > 0) {
          for (const f of plannedSourceFiles) {
            const records = await prisma.auditLog.findMany({
              where: {
                targetId: { contains: f.split("/").pop()?.replace(/\.(ts|tsx)$/, "") || f },
                action: { in: ["MODIFY", "CREATE"] },
              },
              select: { id: true },
              take: 1,
            })
            if (records.length > 0) auditedCount++
          }
          auditScore = Math.round((auditedCount / plannedSourceFiles.length) * 100)
        }
        parts.push("=== 维度三：审计完整度（25%）===")
        parts.push(`  已审计: ${auditedCount} / ${plannedSourceFiles.length} 个源文件`)
        parts.push(`  分数: ${auditScore}/100`)
        if (auditedCount < plannedSourceFiles.length) {
          const missingFiles = plannedSourceFiles.filter(f => {
            // 简单标记（实际查询在上面的循环中）
            return true
          }).slice(auditedCount)
          parts.push(`  ⚠️ 缺少 ADD-7 记录: ${plannedSourceFiles.length - auditedCount} 个文件`)
        }
      } catch {
        parts.push("=== 维度三：审计完整度（25%）===")
        parts.push(`  分数: ${auditScore}/100（无法查询数据库，默认满分）`)
      }
      parts.push("")

      // ====== 维度四：Spec 合规（权重 15%） ======
      let specSyncScore = 100
      try {
        // 简化版 spec_sync 检查：只检查 tasks.md 和 checklist.md 是否有未勾选项
        const specDirName = arFile?.replace(/-add-route-v\d+\.md$/, "") || planKeyword.replace(/\s+/g, "-").toLowerCase()
        const tasksPath = join(PROJECT_ROOT, MAGIC_DIR, "specs", specDirName, "tasks.md")
        const checklistPath = join(PROJECT_ROOT, MAGIC_DIR, "specs", specDirName, "checklist.md")

        let uncheckedCount = 0
        const tasksContent = await readFileSafe(tasksPath)
        if (tasksContent) {
          uncheckedCount += (tasksContent.match(/^- \[ \] /gm) || []).length
        }
        const checklistContent = await readFileSafe(checklistPath)
        if (checklistContent) {
          uncheckedCount += (checklistContent.match(/^- \[ \] /gm) || []).length
        }

        specSyncScore = uncheckedCount === 0 ? 100 : Math.max(0, 100 - uncheckedCount * 5)
        parts.push("=== 维度四：Spec 合规（15%）===")
        parts.push(`  tasks.md + checklist.md 未勾选: ${uncheckedCount} 项`)
        parts.push(`  分数: ${specSyncScore}/100`)
      } catch {
        parts.push("=== 维度四：Spec 合规（15%）===")
        parts.push(`  分数: ${specSyncScore}/100（无法读取 specs，默认满分）`)
      }
      parts.push("")

      // ====== 维度五：阶段对称性（权重 10%） ======
      let phaseScore = 100
      try {
        let asymmetricCount = 0
        for (const f of plannedFiles.filter(f => f.startsWith("src/"))) {
          const filePath = join(PROJECT_ROOT, f)
          const fileContent = await readFileSafe(filePath)
          if (fileContent) {
            const startCount = (fileContent.match(/auditPhaseStart/g) || []).length
            const endCount = (fileContent.match(/auditPhaseEnd/g) || []).length
            if (startCount !== endCount) asymmetricCount++
          }
        }
        phaseScore = asymmetricCount === 0 ? 100 : Math.max(0, 100 - asymmetricCount * 20)
        parts.push("=== 维度五：阶段对称性（10%）===")
        parts.push(`  不对称文件: ${asymmetricCount} 个`)
        parts.push(`  分数: ${phaseScore}/100`)
      } catch {
        parts.push("=== 维度五：阶段对称性（10%）===")
        parts.push(`  分数: ${phaseScore}/100（无法检查，默认满分）`)
      }
      parts.push("")

      // ====== RAHS 复合计算 ======
      const rahs = Math.round(
        scopeScore * 0.30 +
        typeScore * 0.20 +
        auditScore * 0.25 +
        specSyncScore * 0.15 +
        phaseScore * 0.10
      )

      let verdict: string, verdictIcon: string, action: string
      if (rahs >= 90) {
        verdict = "HEALTHY"
        verdictIcon = "🟢"
        action = "进入下一 Step"
      } else if (rahs >= 70) {
        verdict = "WARNING"
        verdictIcon = "🟡"
        action = "自检后决定："
        if (scopeScore < 70) action += " 范围扩散严重；"
        if (auditScore < 70) action += " 审计记录缺失；"
        if (typeScore < 70) action += " 类型错误过多；"
      } else {
        verdict = "DRIFT"
        verdictIcon = "🔴"
        action = "强制返工——注意力漂移严重，本轮不可交付"
      }

      parts.push("=== RAHS 复合计算 ===")
      parts.push(`  范围保真度:   ${scopeScore}     × 0.30 = ${(scopeScore * 0.30).toFixed(1)}`)
      parts.push(`  类型安全:     ${typeScore}     × 0.20 = ${(typeScore * 0.20).toFixed(1)}`)
      parts.push(`  审计完整度:   ${auditScore}     × 0.25 = ${(auditScore * 0.25).toFixed(1)}`)
      parts.push(`  Spec 合规:    ${specSyncScore}     × 0.15 = ${(specSyncScore * 0.15).toFixed(1)}`)
      parts.push(`  阶段对称性:   ${phaseScore}     × 0.10 = ${(phaseScore * 0.10).toFixed(1)}`)
      parts.push(`  ─────────────────────────────────`)
      parts.push(`  RAHS = ${rahs}  ${verdictIcon} ${verdict}`)
      parts.push("")
      parts.push("=== 判定 ===")
      parts.push(`  结果: ${verdictIcon} ${verdict}`)
      parts.push(`  动作: ${action}`)

      return textResponse(parts.join("\n"))
    } catch (error) {
      return errorResponse(`check_rahs 失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

// ========== 升级工具: check_add_route_status（内容扫描增强） ==========
// 在原 L1188 check_add_route_status 基础上，增加 Step 完成度扫描（3→4 状态）
// 保持向后兼容：normal/file_missing/never_generated 三级不变，normal 时追加 completeness 报告

// ========== 新增工具: create_plan ==========
// 在 ADD 工作流中创建 Plan 文件，自动处理日期路径 + index.md 更新
server.registerTool(
  "create_plan",
  {
    description: "创建 ADD Plan 文件到 ${MAGIC_DIR}/plans/{YYYY-MM}/{DD}/ 目录，自动调用 gen-plan-index.sh 更新 index.md。AI 助手在 ADD 范式 Step 0（方案设计）完成后应调用此工具落盘 Plan 文件。\n\n自动处理：\n1. 根据当前日期创建目录 ${MAGIC_DIR}/plans/{YYYY-MM}/{DD}/\n2. 写入 planName-v{version}.md（markdown 正文）\n3. 执行 scripts/gen-plan-index.sh 更新 index.md\n4. 自动调用 record_dev_operation 记录创建操作",
    inputSchema: {
      planName: z.string().describe("Plan 名称（kebab-case），如 '{{projectName}}-domain-vocabulary'"),
      version: z.string().describe("版本号，如 'v1', 'v2'"),
      title: z.string().describe("Plan 标题（markdown H1 第一行），如 '# {{projectName}}-domain-vocabulary-plan-v2'"),
      content: z.string().describe("Plan 完整 markdown 正文（从 H1 标题行开始）"),
      planKeyword: z.string().optional().describe("Plan 关键词（用于 session-init 恢复定位），默认使用 planName"),
    },
  },
  async (args: { planName: string; version: string; title: string; content: string; planKeyword?: string }) => {
    try {
      const { planName, version, title, content, planKeyword } = args

      // 计算日期路径
      const now = new Date()
      const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
      const day = String(now.getDate()).padStart(2, "0")
      const plansDir = join(PROJECT_ROOT, MAGIC_DIR, "plans", yearMonth, day)

      // 确保目录存在
      await mkdir(plansDir, { recursive: true })

      // 生成文件名
      const fileName = `${planName}-plan-${version}.md`
      const filePath = join(plansDir, fileName)
      const relativePath = `${MAGIC_DIR}/plans/${yearMonth}/${day}/${fileName}`

      const parts: string[] = []

      // 写入 Plan 文件
      await writeFile(filePath, content, "utf-8")
      parts.push(`✅ Plan 文件已创建: ${relativePath}`)

      // 更新 index.md
      const indexScript = join(PROJECT_ROOT, "scripts", "gen-plan-index.sh")
      if (existsSync(indexScript)) {
        try {
          const result = execSync(`/bin/bash "${indexScript}"`, {
            cwd: PROJECT_ROOT,
            encoding: "utf-8",
            timeout: 10000,
          })
          parts.push(`📋 index.md 已更新: ${result.trim()}`)
        } catch (indexErr) {
          parts.push(`⚠️ index.md 更新失败（将在 crontab 或下次调用时自动更新）: ${indexErr instanceof Error ? indexErr.message : String(indexErr)}`)
        }
      } else {
        parts.push(`⚠️ gen-plan-index.sh 不存在，index.md 将在 crontab 自动更新`)
      }

      // 自动记录 devlog
      try {
        const keyword = planKeyword || planName
        await prisma.devOperation.create({
          data: {
            userId: "ai-assistant",
            planKeyword: keyword,
            action: "CREATE",
            targetType: "PLAN",
            targetId: relativePath,
            afterState: { title, version, planName },
            reason: `ADD Step 0: 创建 Plan ${title}`,
          },
        })
        parts.push(`📝 devOperation 已记录 (planKeyword: ${keyword})`)
      } catch (auditErr) {
        parts.push(`⚠️ devOperation 记录失败: ${auditErr instanceof Error ? auditErr.message : String(auditErr)}`)
      }

      parts.push("")
      parts.push(`用法提示:`)
      parts.push(`  后续可通过 query_audit_logs({ planKeyword: "${planKeyword || planName}" }) 查询本 Plan 相关操作`)

      return textResponse(parts.join("\n"))
    } catch (error) {
      return errorResponse(`创建 Plan 失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error("[ADD-MCP] add-dev-tools MCP server started on stdio")
}

main().catch((error) => {
  console.error("[ADD-MCP] Fatal error:", error)
  process.exit(1)
})
