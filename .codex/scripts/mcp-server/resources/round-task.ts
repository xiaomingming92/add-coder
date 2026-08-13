import type { McpServer } from "@modelcontextprotocol/server"
import { join } from "path"
import { existsSync } from "fs"
import { readFileSafe, readdirRecursive, PROJECT_ROOT, MAGIC_DIR } from "../shared/fs.js"

export function registerRoundTaskResources(server: McpServer) {
  server.registerResource("round-task", "add-coder://round/{round}/task/{task}",
    { description: "指定轮次的任务完成状态（从 Handoff 文件解析）", mimeType: "application/json" },
  async (uri) => {
    const round = uri.pathname.split("/")[2]
    const task = uri.pathname.split("/")[4]
    const plansDir = join(PROJECT_ROOT, MAGIC_DIR, "plans")
    if (!existsSync(plansDir)) return { contents: [{ text: JSON.stringify({ found: false }), uri: uri.href, mimeType: "application/json" }] }
    const files = await readdirRecursive(plansDir)
    const handoff = files.find(f => f.includes("handoff"))
    if (!handoff) return { contents: [{ text: JSON.stringify({ found: false, reason: "无 Handoff 文件" }), uri: uri.href, mimeType: "application/json" }] }
    const content = await readFileSafe(join(plansDir, handoff)) || ""
    const tasks = content.match(/- \[[ x]\]/g) || []
    const done = tasks.filter(t => t.includes("x")).length
    return { contents: [{ text: JSON.stringify({ found: true, round, task, done, totalTasks: tasks.length }), uri: uri.href, mimeType: "application/json" }] }
  })
}
