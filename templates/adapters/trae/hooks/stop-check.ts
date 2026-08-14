// stop-check.ts — Stop 入口（Trae 版，Task 6.1 继承体系）
// 继承 core StopRouter，命名子类 TraeStopRouter:
//   ① Q0-Q4 四象限分流 = 基类（2026-08-14 实态核验: trae bash 原文与 core 逐字相同——
//   bash diff 为空，收敛为子类无 override）
// 协议差异: 无（纯文本形态同 core）；MAGIC_DIR 物理推导注入（对齐 bash export）

import { tryResolveMagicDir } from "../../../core/governance/common.js"
import { StopRouter } from "../../../core/governance/stop-router.js"

class TraeStopRouter extends StopRouter {
  // 当前无 override（Q0-Q4 分流与 core 基线一致）；命名子类承载端身份 + 未来演进位
}

// 对齐 bash: MAGIC_DIR 从物理位置推导并 export（入口注入优先）
const inferredMagicDir = tryResolveMagicDir()
if (inferredMagicDir && !process.env.MAGIC_DIR) {
  process.env.MAGIC_DIR = inferredMagicDir
}

process.exit(new TraeStopRouter().run())
