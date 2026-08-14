// pre-tool-use.ts — PreToolUse 入口（Codex 版，Task 7.1 继承体系）
// 继承 core PreToolUseGuard，命名子类 CodexPreToolUseGuard（codex 私有协议差异 override）:
//   ① 检测链: adapterName="codex" → [guard.adapter_detectors] codex 链（同 core 正则 + codex reason）
//   ② onBlock/onSensitiveDeny/onHitlDeny: JSON **deny** 形态（core 是 ask；codex bash 原文 _deny 逐字，
//      stderr `⛔ [ADD PreToolUse] reason` + logBlock + 事件 + exit 2）
//   ③ onOtherTool: apply_patch 特有（解析 `*** Add|Update|Delete File:` 路径 → guardFilePath 逐文件 + markDevAction）
//   ④ ~~sensitiveFileRegex / hitlExemptReviews / hitlMarkers~~ → Task 9.4.4 三项上提 core 默认（2026-08-14）
//   ⑤ noPlanHint: true——无 Plan 仅 stderr 提示后继续（codex 协议差异保留）
// 入口差异: PROJECT_DIR=git toplevel + cd 统一 cwd + MAGIC_DIR 注入

import { execSync } from "node:child_process"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { jsonGet, markDevAction, readHookInput, tryResolveMagicDir } from "../../../core/governance/common.js"
import { writeHookEvent } from "../../../core/governance/notify.js"
import { PreToolUseGuard } from "../../../core/governance/pre-tool-guard.js"

class CodexPreToolUseGuard extends PreToolUseGuard {
  constructor(projectDir: string, magicDir: string) {
    super(projectDir, magicDir, "codex")
  }

  /** ② §A 阻断: JSON deny（core 是 ask——codex bash 原文 _deny 逐字） */
  protected override onBlock(blocked: { reason: string; stderr: string }, command: string): number {
    process.stderr.write(`⛔ [ADD PreToolUse] ${blocked.reason}\n`)
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: blocked.reason,
        },
      }) + "\n"
    )
    this.logBlock("检测器链", command)
    writeHookEvent("pre-tool-use", "deny", command, blocked.reason, this.planKeyword, this.planStatus)
    return 2
  }

  /** ② 敏感文件: JSON deny + 事件 + exit 2（core 无事件） */
  protected override onSensitiveDeny(filePath: string): number {
    const reason = `敏感文件受保护，禁止写入: ${filePath}`
    process.stderr.write(`⛔ [ADD PreToolUse] ${reason}\n`)
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: reason,
        },
      }) + "\n"
    )
    this.logBlock("sensitive-file", filePath)
    writeHookEvent("pre-tool-use", "deny", `Write ${filePath}`, reason, this.planKeyword, this.planStatus)
    return 2
  }

  /** ② HITL: JSON deny + 事件 + exit 2（core 是 exit 0 放行——codex 阻断） */
  protected override onHitlDeny(toolName: string, filePath: string, tongyiMarker: string): number {
    const reason = `HITL 未同意: ${filePath}。请先 create_hitl，再由人工 update_hitl(TONGYI)。`
    process.stderr.write(`⛔ [ADD PreToolUse] ${reason}\n`)
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: reason,
        },
      }) + "\n"
    )
    this.logBlock("hitl", filePath)
    writeHookEvent("pre-tool-use", "deny", `${toolName} ${filePath}`, `HITL 未同意: ${tongyiMarker}`, this.planKeyword, this.planStatus)
    return 2
  }

  /** ③ apply_patch: 解析 patch 路径 → guardFilePath 逐文件 + markDevAction（codex 特有） */
  protected override onOtherTool(input: string, toolName: string): number {
    if (toolName !== "apply_patch") return 0
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
    for (const p of patchPaths) {
      if (p !== "") {
        // Task 9.4 修复: guardFilePath 返回阻断码（敏感/HITL），apply_patch 路径必须透传 exit
        const guardCode = this.guardFilePath(p, "apply_patch")
        if (guardCode !== 0) return guardCode
      }
    }
    markDevAction()
    return 0
  }

  /** ⑦ 无 Plan 仅提示后继续（codex bash 原文） */
  protected override noPlanHint(): boolean {
    return true
  }
}
// 注: ④ sensitiveFileRegex / ⑤ hitlExemptReviews / ⑥ hitlMarkers override 已删除——
// 2026-08-14 Task 9.4.4 三项上提 core 默认（锚定正则 / 仅 -runtime 豁免 / 双哨兵），收敛无 diff。

// 对齐 bash: git rev-parse --show-toplevel || pwd + cd
function resolveProjectDir(): string {
  try {
    return execSync("git rev-parse --show-toplevel", { encoding: "utf-8" }).trim()
  } catch {
    return process.cwd()
  }
}
const PROJECT_DIR = resolveProjectDir()
process.env.PROJECT_DIR = PROJECT_DIR
// 对齐 bash export MAGIC_DIR=".codex"：唯一解析链（注入优先 → 物理推导），推导失败回退 .codex
const MAGIC_DIR = tryResolveMagicDir() || ".codex"
process.env.MAGIC_DIR = MAGIC_DIR
process.chdir(PROJECT_DIR) // 统一 cwd，避免从 repo 子目录启动时写偏审计文件

const input = readHookInput()
const toolName = jsonGet(input, "tool_name")
// Task 9.4 修复: Bash 与 apply_patch 的 command 均在 tool_input——分流依据 tool_name
// （原 jsonGet 顶层 command 判断会把 apply_patch 的 patch body 误当 Bash 命令走 §A）

const guard = new CodexPreToolUseGuard(PROJECT_DIR, MAGIC_DIR)

if (toolName === "Bash") {
  process.exit(guard.runSectionA(input))
} else if (toolName === "apply_patch") {
  // apply_patch 的 payload 在 tool_input.command——只走 §C matcher（避免把 patch body 误判成 shell）
  process.exit(guard.runSectionC(input, toolName))
} else {
  process.exit(guard.runSectionB(input, toolName))
}
