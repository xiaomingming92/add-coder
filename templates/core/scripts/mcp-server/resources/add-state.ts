import type { McpServer } from "@modelcontextprotocol/server"
import { join } from "path"
import { existsSync } from "fs"
import { readdirRecursive, PROJECT_ROOT, MAGIC_DIR } from "../shared/fs.js"

export function registerAddStateResources(server: McpServer) {

  server.registerResource("plan-status", "add-coder://plan/status",
    { description: "当前活跃 ADD Plan 的状态信息", mimeType: "application/json" },
  async () => {
    const plansDir = join(PROJECT_ROOT, MAGIC_DIR, "plans")
    if (!existsSync(plansDir)) return { contents: [{ text: JSON.stringify({ active: false, message: "无 plans 目录" }), uri: "add-coder://plan/status", mimeType: "application/json" }] }
    const files = (await readdirRecursive(plansDir)).filter(f => f.endsWith(".md") && !f.includes("add-route") && !f.includes("handoff"))
    const active = files.length > 0 ? files[files.length - 1].replace(".md", "") : null
    return { contents: [{ text: JSON.stringify({ active, total: files.length }), uri: "add-coder://plan/status", mimeType: "application/json" }] }
  })

  server.registerResource("review-status", "add-coder://review/status",
    { description: "当前活跃 ADD Review 的状态信息", mimeType: "application/json" },
  async () => {
    const reviewsDir = join(PROJECT_ROOT, MAGIC_DIR, "reviews")
    if (!existsSync(reviewsDir)) return { contents: [{ text: JSON.stringify({ active: false }), uri: "add-coder://review/status", mimeType: "application/json" }] }
    const files = (await readdirRecursive(reviewsDir)).filter(f => f.endsWith(".md"))
    return { contents: [{ text: JSON.stringify({ active: files.length > 0, total: files.length }), uri: "add-coder://review/status", mimeType: "application/json" }] }
  })

  server.registerResource("route-status", "add-coder://route/status",
    { description: "ADD Route 执行状态", mimeType: "application/json" },
  async () => {
    const plansDir = join(PROJECT_ROOT, MAGIC_DIR, "plans")
    if (!existsSync(plansDir)) return { contents: [{ text: JSON.stringify({ found: false }), uri: "add-coder://route/status", mimeType: "application/json" }] }
    const files = (await readdirRecursive(plansDir)).filter(f => f.includes("add-route"))
    return { contents: [{ text: JSON.stringify({ found: files.length > 0, files }), uri: "add-coder://route/status", mimeType: "application/json" }] }
  })

  server.registerResource("specs-status", "add-coder://specs/status",
    { description: "ADD Specs 状态", mimeType: "application/json" },
  async () => {
    const specsDir = join(PROJECT_ROOT, MAGIC_DIR, "specs")
    if (!existsSync(specsDir)) return { contents: [{ text: JSON.stringify({ found: false }), uri: "add-coder://specs/status", mimeType: "application/json" }] }
    const dirs = (await readdirRecursive(specsDir)).filter(f => !f.includes("/"))
    return { contents: [{ text: JSON.stringify({ found: dirs.length > 0, specs: dirs }), uri: "add-coder://specs/status", mimeType: "application/json" }] }
  })
}
