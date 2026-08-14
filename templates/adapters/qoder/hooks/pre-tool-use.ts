// pre-tool-use.ts — PreToolUse 入口（Qoder CN 版，Task 4.1 继承体系）
// 继承 core PreToolUseGuard（模板方法固化治理流程）；仅 override 协议差异（bash 原文逐字对照）:
//   ① 检测链: 构造传 adapterName="qoder" → 加载 [guard.adapter_detectors] qoder 独立链
//      （与 claude 同构四段链，2026-08-14 实态核验）
//   ② onBlock: stderr + stdout JSON deny（permissionDecision: deny）+ 事件 + exit 2（无 logBlock）
//   ③ onSensitiveDeny: stderr + JSON deny + 事件 + exit 2（core 无事件上报）
//   ④ onSectionAPass: Bash 放行 markDevAction（同 claude）
//   ⑤ largeFileText: 「Qoder 40500」错误码提示（qoder IDE 特有）
//   ⑥ onHitlDeny: JSON deny + additionalContext + exit 2 + event "ask"（core exit 0 + event "deny"）
//   ⑦ onOtherTool: ③ Read matcher 模板提示（同 claude）

import { jsonGet, readHookInput, tryResolveMagicDir } from "../../../core/governance/common.js"
import { writeHookEvent } from "../../../core/governance/notify.js"
import { PreToolUseGuard } from "../../../core/governance/pre-tool-guard.js"
import { markDevAction } from "../../../core/governance/common.js"
import { injectProjectDir } from "./lib/qoder-env.js"

injectProjectDir()
const inferred = tryResolveMagicDir()
if (inferred && !process.env.MAGIC_DIR) process.env.MAGIC_DIR = inferred
const PROJECT_DIR = process.env.PROJECT_DIR || process.cwd()
const MAGIC_DIR = process.env.MAGIC_DIR || ".qoder"

/** JSON deny 输出（Qoder PreToolUse 协议: permissionDecision deny） */
function denyJsonOut(reason: string): string {
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  }) + "\n"
}

class QoderPreToolUseGuard extends PreToolUseGuard {
  constructor(projectDir: string, magicDir: string) {
    super(projectDir, magicDir, "qoder")
  }

  /** ② §A 阻断: stderr + JSON deny + 事件 + exit 2（无 logBlock） */
  protected override onBlock(blocked: { reason: string; stderr: string }, command: string): number {
    process.stderr.write(blocked.stderr.replaceAll("{{cmd}}", command))
    process.stdout.write(denyJsonOut(blocked.reason))
    writeHookEvent("pre-tool-use", "deny", command, blocked.reason, this.planKeyword, this.planStatus)
    return 2
  }

  /** ③ §B 敏感文件: stderr + JSON deny + 事件 + exit 2 */
  protected override onSensitiveDeny(filePath: string): number {
    process.stderr.write(`⛔ 敏感文件受保护，禁止写入: ${filePath}\n`)
    process.stdout.write(denyJsonOut("敏感文件受保护"))
    writeHookEvent("pre-tool-use", "deny", filePath, "敏感文件受保护", this.planKeyword, this.planStatus)
    return 2
  }

  /** ④ §A 放行后处理: bash 原文 mark_dev_action */
  protected override onSectionAPass(_command: string): void {
    markDevAction()
  }

  /** ⑤ 大文件提示: Qoder 40500 错误码（qoder IDE 特有） */
  protected override largeFileText(fsize: number): string {
    return `⚠️ [ADD PreToolUse] 文件已有 ${fsize} 字节，Write 全量覆盖可能触发 Qoder 40500。建议用 SearchReplace 分块追加。\n`
  }

  /** ⑥ HITL 未 tongyi: JSON deny + additionalContext + exit 2 + event "ask" */
  protected override onHitlDeny(toolName: string, filePath: string, tongyiMarker: string): number {
    process.stderr.write(`⛔ [ADD PreToolUse §C] HITL 未 tongyi: ${filePath}\n`)
    process.stderr.write(`   原因: 哨兵文件 ${tongyiMarker} 不存在\n`)
    process.stderr.write(`   操作: 请先调用 create_hitl 创建审批，再 update_hitl({ status: "TONGYI" })\n`)
    const msg = `⛔ HITL 未 tongyi: 哨兵 ${tongyiMarker} 不存在。请先 create_hitl → 人工 tongyi → update_hitl 后再写入`
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: msg,
          additionalContext: msg,
        },
      }) + "\n"
    )
    writeHookEvent("pre-tool-use", "ask", `${toolName} ${filePath}`, `HITL 未 tongyi: ${tongyiMarker}`, this.planKeyword, this.planStatus)
    return 2
  }

  /** ⑦ ③ Read matcher: 模板路径兜底提示 */
  protected override onOtherTool(input: string, toolName: string): number {
    if (toolName === "Read") {
      const filePath = jsonGet(input, "file_path")
      if (/templates\//.test(filePath)) {
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

const guard = new QoderPreToolUseGuard(PROJECT_DIR, MAGIC_DIR)

if (toolName === "Bash") {
  process.exit(guard.runSectionA(input))
} else if (toolName === "Write" || toolName === "Edit" || toolName === "SearchReplace") {
  process.exit(guard.runSectionB(input, toolName))
} else {
  process.exit(guard.runSectionC(input, toolName))
}
