import { readFile, readdir } from "fs/promises"
import { join, relative } from "path"
import { existsSync } from "fs"
import { runCommand } from "./run-command.js"
import { PROJECT_ROOT, MAGIC_DIR } from "./env.js"
import type { GuardResult } from "../types.js"

export async function readFileSafe(filePath: string): Promise<string | null> {
  try { return await readFile(filePath, "utf-8") } catch { return null }
}

export async function validateDocWithGuard(filePath: string): Promise<GuardResult> {
  const guardScript = join(PROJECT_ROOT, MAGIC_DIR, "hooks", "doc-format-guard.sh")
  if (!existsSync(guardScript)) return { ok: true, issues: "" }
  const content = await readFileSafe(filePath)
  if (!content) return { ok: false, issues: "文件无法读取" }
  const guardInput = JSON.stringify({ tool_input: { file_path: filePath, file_content: content } })
  try {
    // bash 在 Windows 不存在 → runCommand 抛"命令不可用" → 显式返回 guard 失败（不再静默 null）
    const result = runCommand("bash", [guardScript], { input: guardInput, timeout: 5000 })
    if (result.status !== 0) return { ok: false, issues: result.stderr || "guard 执行失败" }
    return { ok: true, issues: "" }
  } catch (e) {
    return { ok: false, issues: `guard 执行失败: ${e instanceof Error ? e.message : String(e)}` }
  }
}

export async function readdirRecursive(baseDir: string): Promise<string[]> {
  const results: string[] = []
  async function walk(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(fullPath)
      } else {
        results.push(relative(baseDir, fullPath))
      }
    }
  }
  await walk(baseDir)
  return results
}

export { PROJECT_ROOT, MAGIC_DIR }
