// pre-tool-use.ts — PreToolUse 入口（Trae 版，Task 6.1 继承体系）
// 继承 core PreToolUseGuard，命名子类 TraePreToolUseGuard:
//   ① 检测链: 构造传 adapterName="trae" → 加载 [guard.adapter_detectors] trae 独立链
//      （与 core 同正则同序，stderr 为 trae 长文本版——2026-08-14 实态核验，TOML 数据化）
//   ② onBlock/onSectionAPass/onNoPlanAllow/onSensitiveDeny/largeFileText/onHitlDeny
//      = core 基类默认（逐字对照 trae bash 原文一致：JSON ask + logBlock + 事件 + exit 2；
//      HITL 失败 exit 0 放行）
// 协议差异仅剩: MAGIC_DIR 兜底 = ".trae"（构造参数）

import { jsonGet, readHookInput, tryResolveMagicDir } from "../../../core/governance/common.js"
import { PreToolUseGuard } from "../../../core/governance/pre-tool-guard.js"

class TraePreToolUseGuard extends PreToolUseGuard {
  /** ① trae 独立检测链（TOML [guard.adapter_detectors] adapter=trae） */
  constructor(projectDir: string, magicDir: string) {
    super(projectDir, magicDir, "trae")
  }

  // 其余扩展点与 core 基线一致（trae bash 原文逐字对照）；命名子类承载端身份 + 未来演进位
}

const input = readHookInput()
const PROJECT_DIR = process.env.PROJECT_DIR || process.cwd()

// 探测 MAGIC_DIR（唯一解析链：注入优先 → 物理位置推导）
let MAGIC_DIR = process.env.MAGIC_DIR
if (!MAGIC_DIR) {
  MAGIC_DIR = tryResolveMagicDir() || ".trae"
}

const toolName = jsonGet(input, "tool_name")
const command = jsonGet(input, "command")

const guard = new TraePreToolUseGuard(PROJECT_DIR, MAGIC_DIR)

if (command !== "") {
  process.exit(guard.runSectionA(input))
} else {
  process.exit(guard.runSectionB(input, toolName))
}
