import type { McpServer } from "@modelcontextprotocol/server"
import { join } from "path"
import { readFileSafe, PROJECT_ROOT } from "../shared/fs.js"
import { runCommand } from "../shared/run-command.js"

interface PkgJson { version?: string }

export function registerVersionResource(server: McpServer) {
  server.registerResource("add-coder-version", "add-coder://version",
    { description: "add-coder npm 包版本信息（当前安装 vs 最新发布）", mimeType: "application/json" },
  async () => {
    const pkgPath = join(PROJECT_ROOT, "package.json")
    const pkg = await readFileSafe(pkgPath)
    let current = "unknown", latest = "unknown", outdated = false
    if (pkg) {
      try { current = (JSON.parse(pkg) as PkgJson).version ?? "unknown" } catch { /* intentionally empty */ }
    }
    try {
      // win32 下 npm 为 .cmd → runCommand 自动解析（issue #10 跨端修复）
      const result = runCommand("npm", ["view", "add-coder", "version"], { timeout: 10000 })
      latest = result.stdout.trim() || "unknown"
      outdated = current !== "unknown" && latest !== "unknown" && current !== latest
    } catch { /* intentionally empty */ }
    return { contents: [{ text: JSON.stringify({ current, latest, outdated }), uri: "add-coder://version", mimeType: "application/json" }] }
  })
}
