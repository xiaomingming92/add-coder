// post-tool-use.ts — PostToolUse 入口（Codex 版，Task 7.1 继承体系）
// 继承 core PostToolRouter，命名子类 CodexPostToolRouter（codex 私有协议差异 override）:
//   ① isFileTool: +SearchReplace（codex 支持 file_path/path 双字段）
//   ② extractFilePath: file_path ?? path（codex 工具输入形态）
//   ③ emitAuditReminder: 简化文本（无 ADD-7 字样，bash 原文逐字）
//   ④ emitBashDone: lint/typecheck/test 闭环提示（bash 原文逐字）
//   ⑤ applyPatchMatcher: 解析 `*** Add|Update|Delete File:` 行逐文件 report（codex apply_patch 特有）
//   ⑥ docGuardText: 「请检查双向链接与 Plan/Spec 状态」（bash 原文逐字）
// 入口差异: PROJECT_DIR=git toplevel（codex 大文件协议）+ MAGIC_DIR 注入

import { execSync } from "node:child_process"
import { jsonGet, readHookInput, tryResolveMagicDir } from "../../../core/governance/common.js"
import { PostToolRouter } from "../../../core/governance/post-tool-router.js"

class CodexPostToolRouter extends PostToolRouter {
  /** ① codex 文件写工具含 SearchReplace */
  protected override isFileTool(toolName: string): boolean {
    return toolName === "Edit" || toolName === "Write" || toolName === "SearchReplace"
  }

  /** ② file_path ?? path（codex 工具输入形态） */
  protected override extractFilePath(input: string): string {
    const fp = jsonGet(input, "file_path")
    if (fp !== "") return fp
    return jsonGet(input, "path")
  }

  /** ③ 审计提醒（codex bash 原文逐字——无 ADD-7 字样） */
  protected override emitAuditReminder(filePath: string): string {
    return `[ADD PostToolUse] 文件已写入: ${filePath}；请执行 record_dev_operation 落库审计。\n`
  }

  /** ④ Bash 增强（codex bash 原文逐字——lint/typecheck/test 闭环） */
  protected override emitBashDone(): string {
    return "[ADD PostToolUse] Bash 命令完成；若产生 lint/typecheck/test 错误，请在本轮闭环。\n"
  }

  /** ⑤ apply_patch: 解析 `*** Add|Update|Delete File:` 行逐文件 report（codex 特有） */
  protected override applyPatchMatcher(input: string): void {
    let patchCommand = ""
    if (input.trim() !== "") {
      try {
        const parsed = JSON.parse(input) as { tool_input?: { command?: unknown } }
        patchCommand = typeof parsed.tool_input?.command === "string" ? parsed.tool_input.command : ""
      } catch {
        patchCommand = ""
      }
    }
    const patchPaths: string[] = []
    for (const line of patchCommand.split("\n")) {
      const m = line.match(/^\*\*\* (Add|Update|Delete) File: (.+)$/)
      if (m) patchPaths.push(m[2])
    }
    for (const p of patchPaths) this.reportFile(p)
  }

  /** 对齐 bash _report_file：ADD 文档守卫 + 审计提醒（codex 版） */
  private reportFile(filePath: string): void {
    if (filePath === "") return
    if (/(^|\/)\.codex\/(plans|specs|reviews)\//.test(filePath)) {
      this.emitLine(`[ADD PostToolUse] ADD 文档已写入: ${filePath}；请检查双向链接与 Plan/Spec 状态。\n`)
    }
    this.emitLine(`[ADD PostToolUse] 文件已写入: ${filePath}；请执行 record_dev_operation 落库审计。\n`)
    // Task 8.1: apply_patch 也是文件写入路径——接入审计桥接（ADD-7 自动化）
    this.emitWriteEvent(filePath)
  }
}

// 对齐 bash: git rev-parse --show-toplevel || pwd
function resolveProjectDir(): string {
  try {
    return execSync("git rev-parse --show-toplevel", { encoding: "utf-8" }).trim()
  } catch {
    return process.cwd()
  }
}
const PROJECT_DIR = resolveProjectDir()
process.env.PROJECT_DIR = PROJECT_DIR
process.env.MAGIC_DIR = tryResolveMagicDir() || ".codex"

const input = readHookInput()
const toolName = jsonGet(input, "tool_name")
if (toolName === "") process.exit(0)

process.exit(new CodexPostToolRouter(PROJECT_DIR, process.env.MAGIC_DIR).run(input, toolName))
