import * as z from "zod/v4"
import type { ToolRegistrar } from "./registrar.js"
import { readdir } from "fs/promises"
import { existsSync } from "fs"
import { join } from "path"
import { textResponse, errorResponse } from "../shared/response.js"
import { readFileSafe } from "../shared/fs.js"
import { PROJECT_ROOT, MAGIC_DIR } from "../shared/fs.js"

export function registerDocsTools(server: ToolRegistrar) {

  server.registerTool("find_related_docs", {
    description: `搜索与当前变更相关的项目文档（ADD-0.1 广义文档先行）。搜索范围:\n1. docs/ 目录 — 需求文档、架构文档、规范文档\n2. ${MAGIC_DIR}/ 产物 — plans/(Plan+add-route+handoff)、specs/(三元组)、reviews/(方案审查+实现审查+运行时审查)\n\nAI 助手在 ADD 范式 Step 0 中应调用此工具查找需要更新的 docs/ 文档。`,
    inputSchema: z.object({
      query: z.string().describe("搜索关键词"),
      category: z.string().optional().describe("文档类别过滤: 'requirement', 'architecture', 'standard', 'plan', 'add-route', 'spec', 'review', 'handoff'"),
    }),
  }, async (args, _ctx) => {
    try {
      const { query, category } = args
      const docsDir = join(PROJECT_ROOT, "docs")
      const catPrefixes: Record<string, string[]> = { requirement: ["00-需求"], architecture: ["01-架构","02-架构"], standard: ["02-规范","03-规范"] }
      const magicCat: Record<string, string> = { plans: "plan", specs: "spec", reviews: "review" }
      const allFiles: Array<{ path: string; relativePath: string; category: string }> = []
      const walk = async (dir: string, rel: string, src: "docs" | "magic" = "docs") => {
        try { for (const e of await readdir(dir, { withFileTypes: true })) { const fp = join(dir, e.name); const rp = rel ? `${rel}/${e.name}` : e.name; if (e.isDirectory()) await walk(fp, rp, src); else if (e.name.endsWith(".md") || e.name.endsWith(".html")) { let c = "unknown"; if (src === "magic") { const td = rp.split("/")[0]; c = magicCat[td] || "unknown"; if (td === "plans" && e.name.includes("handoff")) c = "handoff"; if (td === "plans" && e.name.includes("add-route")) c = "add-route" } else { for (const [cat, pf] of Object.entries(catPrefixes)) if (pf.some(p => rp.includes(p))) { c = cat; break } }; allFiles.push({ path: fp, relativePath: rp, category: c }) } } } catch { /* fallthrough */ }
      }
      await walk(docsDir, "", "docs")
      for (const md of ["plans","specs","reviews"]) { const p = join(PROJECT_ROOT, MAGIC_DIR, md); if (existsSync(p)) await walk(p, md, "magic") }
      let filtered = allFiles
      if (category) { const ac: Record<string, string[]> = { ...catPrefixes, plan: ["plan"], "add-route": ["add-route"], spec: ["spec"], review: ["review"], handoff: ["handoff"] }; if (ac[category]) filtered = allFiles.filter(f => f.category === category) }
      const ql = query.toLowerCase(); const matches: Array<{ path: string; relativePath: string; category: string; title: string; relevance: number }> = []
      for (const d of filtered) { let r = 0; if (d.relativePath.toLowerCase().includes(ql)) r += 3; let t = ""; try { const c = await readFileSafe(d.path); if (c) { const m = c.match(/^#\s+(.+)/m); t = m ? m[1].trim() : c.split("\n")[0].replace(/^#+\s*/,"").replace(/[#*]/g,"").trim(); if (c.toLowerCase().includes(ql)) r += 2 } } catch { /* fallthrough */ }; if (r > 0) matches.push({ ...d, title: t || d.relativePath.split("/").pop()!, relevance: r }) }
      matches.sort((a,b) => b.relevance - a.relevance)
      const p: string[] = [`=== 项目文档搜索: "${query}" ===`, `匹配文档数: ${matches.length}`, ""]
      if (!matches.length) { p.push("未找到匹配的文档。"); p.push("=== 可用文档列表 ==="); for (const d of allFiles) p.push(`  [${d.category}] ${d.relativePath}`) }
      else { for (const d of matches) p.push(`  [相关度 ${d.relevance}] ${d.relativePath}\n  标题: ${d.title}\n`) }
      return textResponse(p.join("\n"))
    } catch (error) { return errorResponse(`搜索文档失败: ${error instanceof Error ? error.message : String(error)}`) }
  })

}
