// pre-compact.ts — 上下文压缩前 ADD 状态保存（Qoder CN 版，Task 4.1 继承体系补全）
// 继承 core PreCompactGuard，命名子类 QoderPreCompactGuard:
//   ① 状态保存到恢复标记 + ② tpl 标记清理 = 基类（与 qoder bash 原文逐字同构，
//   2026-08-14 实态核验——手写版逻辑与 core 基类完全一致，收敛为子类）
// 协议差异仅剩: PROJECT_DIR 注入链（qoder-env）

import { PreCompactGuard } from "../../../core/governance/pre-compact-guard.js"
import { injectProjectDir } from "./lib/qoder-env.js"

class QoderPreCompactGuard extends PreCompactGuard {
  // 当前无 override（状态保存/恢复清单/tpl 清理与 core 基线一致）；命名子类承载端身份 + 未来演进位
}

injectProjectDir()

process.exit(new QoderPreCompactGuard().run())
