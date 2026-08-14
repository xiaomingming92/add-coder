// session-end.ts — SessionEnd 入口（Qoder CN 版，Task 4.1 继承体系补全）
// 继承 core SessionEndGuard，命名子类 QoderSessionEndGuard:
//   ① 清理标记（tpl + dev）= 基类（bash 原文逐字）
//   ② emitSettle override: stdout JSON additionalContext（qoder 协议——
//     含 fallbackMsg 检测，bash 缺陷照搬: 清理后 hasDevAction 恒 false，fallbackMsg 恒空）
//   ③ stopFallback = 基类（清理后 hasDevAction 恒 false → 恒无操作，与 qoder bash 原文等价）

import { hasDevAction, localIsoSeconds } from "../../../core/governance/common.js"
import { SessionEndGuard } from "../../../core/governance/session-end.js"
import { injectProjectDir } from "./lib/qoder-env.js"

class QoderSessionEndGuard extends SessionEndGuard {
  /** ② qoder 协议: stdout JSON additionalContext（含 fallbackMsg 检测——bash 缺陷照搬顺序） */
  protected override emitSettle(): void {
    // bash 缺陷照搬: 先清理 dev 标记再检查 has_dev_action——清理后检查恒为 false
    let fallbackMsg = ""
    if (hasDevAction()) {
      fallbackMsg = "⚠️ 检测到 dev action 标记未清除——Stop 可能未触发验收检查"
    }
    const ctx = `[ADD SessionEnd] 会话结束 — ${localIsoSeconds()}。标记已清理。${fallbackMsg}`
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionEnd", additionalContext: ctx } }) + "\n")
  }
}

injectProjectDir()

process.exit(new QoderSessionEndGuard().run())
