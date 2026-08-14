// stop-check.ts — Stop 入口（VS Code Copilot 版，Task 5.1 继承体系）
// 继承 core StopRouter，命名子类 VscodeStopRouter:
//   bash 原文与 core 逐字相同（2026-08-14 实态核验: vscode bash L40/L56 与 core bash L32/L48
//   均为 build_stop_context 无 echo，Q2/Q4 换行语义对齐 core TS +"\n"）——当前无 override，
//   命名子类承载端身份 + 未来演进位
// 协议差异: 无（纯文本形态同 core）；MAGIC_DIR 物理推导注入（对齐 bash export）

import { tryResolveMagicDir } from "../../../core/governance/common.js"
import { StopRouter } from "../../../core/governance/stop-router.js"

class VscodeStopRouter extends StopRouter {
  // 当前无 override（Q0-Q4 分流与 core 基线一致）；命名子类承载端身份 + 未来演进位
}

// 对齐 bash: MAGIC_DIR 从物理位置推导并 export（入口注入优先）
const inferredMagicDir = tryResolveMagicDir()
if (inferredMagicDir && !process.env.MAGIC_DIR) {
  process.env.MAGIC_DIR = inferredMagicDir
}

process.exit(new VscodeStopRouter().run())
