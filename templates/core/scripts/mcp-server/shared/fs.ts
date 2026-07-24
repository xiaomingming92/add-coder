import { readFile, readdir } from "fs/promises"
import { join, relative } from "path"
import { existsSync } from "fs"
import { spawnSync } from "child_process"
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
  const result = spawnSync("bash", [guardScript], { input: guardInput, encoding: "utf-8", timeout: 5000 })
  if (result.status !== 0) return { ok: false, issues: result.stderr || "guard 执行失败" }
  return { ok: true, issues: "" }
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
