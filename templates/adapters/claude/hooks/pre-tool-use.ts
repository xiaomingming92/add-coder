// pre-tool-use.ts — PreToolUse 入口（Claude 版，Task 3.1 继承体系）
// 继承 core PreToolUseGuard（模板方法固化治理流程）；仅 override 协议差异:
//   ① 检测链: 构造传 adapterName="claude" → 加载 [guard.adapter_detectors] 独立链
//   ② onBlock: 纯 stderr（无 askJson / 无 logBlock）+ exit 2
//   ③ onNoPlanAllow: 输出同 core 但 exit 2（bash 原文 L73 exit $EXIT_BLOCK）→ Task 9.4.2 修复对齐 exit 0
//   ④ onSensitiveDeny: 纯 stderr（无 denyJson）+ 事件 + exit 2
//   ⑤ onOtherTool: ③ Read matcher 模板提示（claude 特有）

import { detectActiveAdd, jsonGet, markDevAction, readHookInput, tryResolveMagicDir } from "../../../core/governance/common.js"
import { writeHookEvent } from "../../../core/governance/notify.js"
import { PreToolUseGuard } from "../../../core/governance/pre-tool-guard.js"
import { resolveClaudeProjectDir } from "./lib/claude-env.js"

process.env.PROJECT_DIR = resolveClaudeProjectDir()
const PROJECT_DIR = process.env.PROJECT_DIR

const magicDir = tryResolveMagicDir()
if (magicDir && !process.env.MAGIC_DIR) {
  process.env.MAGIC_DIR = magicDir
}
const MAGIC_DIR = process.env.MAGIC_DIR || ""

class ClaudePreToolUseGuard extends PreToolUseGuard {
  constructor(projectDir: string, magicDir: string) {
    super(projectDir, magicDir, "claude")
  }

  /** ② §A 阻断: 纯 stderr（{{cmd}} 模板替换）+ 事件 + exit 2（无 askJson / logBlock） */
  protected override onBlock(blocked: { reason: string; stderr: string }, command: string): number {
    process.stderr.write(blocked.stderr.replaceAll("{{cmd}}", command))
    writeHookEvent("pre-tool-use", "deny", command, blocked.reason, this.planKeyword, this.planStatus)
    return 2
  }

  /** §A 放行后处理: bash 原文 L56 mark_dev_action（core 无此行为） */
  protected override onSectionAPass(_command: string): void {
    markDevAction()
  }

  /** ③ §B 无 Plan 放行: 输出同 core（提示 + allowJson + 事件）+ exit 0（Task 9.4.2 修复: bash 原文 exit 2 缺陷对齐 core） */
  protected override onNoPlanAllow(toolName: string, filePath: string): number {
    process.stderr.write("[ADD 提示] 正在写入 Plan/Spec/Review 文档但无活跃 ADD Plan——首次创建场景放行，建议先执行 add-paradigm 生成 Plan+add-route\n")
    process.stdout.write('{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"无活跃 ADD Plan 但为 Plan/Spec/Review 写入（首次创建场景），提示而非拦截"}}\n')
    writeHookEvent("pre-tool-use", "info", filePath, "无活跃 ADD Plan 下写入 Plan/Spec/Review（首次创建放行）", this.planKeyword, this.planStatus)
    return 0
  }

  /** ④ §B 敏感文件: 纯 stderr（无 denyJson）+ 事件 + exit 2 */
  protected override onSensitiveDeny(filePath: string): number {
    process.stderr.write(`⛔ 敏感文件受保护，禁止写入: ${filePath}\n`)
    writeHookEvent("pre-tool-use", "deny", filePath, "敏感文件受保护", this.planKeyword, this.planStatus)
    return 2
  }

  /** ⑤ ③ Read matcher: 模板路径兜底提示（claude 特有） */
  protected override onOtherTool(input: string, toolName: string): number {
    if (toolName === "Read") {
      const filePath = jsonGet(input, "file_path")
      if (filePath.includes("templates/")) {
        process.stderr.write("[ADD PreToolUse] 提示: 模板文件已通过 hook 预读到上下文，可跳过重复读取\n")
      }
    }
    return 0
  }
}

const input = readHookInput()
let toolName = jsonGet(input, "tool_name")
if (toolName === "") {
  toolName = input.match(/"tool_name"\s*:\s*"([^"]*)"/)?.[1] ?? ""
}

const guard = new ClaudePreToolUseGuard(PROJECT_DIR, MAGIC_DIR)

if (toolName === "Bash") {
  process.exit(guard.runSectionA(input))
} else if (toolName === "Write" || toolName === "Edit" || toolName === "SearchReplace") {
  process.exit(guard.runSectionB(input, toolName))
} else {
  process.exit(guard.runSectionC(input, toolName))
}
