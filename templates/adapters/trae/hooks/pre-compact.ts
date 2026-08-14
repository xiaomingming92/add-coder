// pre-compact.ts — 上下文压缩前 ADD 状态保存（Trae 版，Task 6.1 继承体系）
// 继承 core PreCompactGuard，命名子类 TraePreCompactGuard:
//   ① 状态保存到恢复标记 + ② tpl 标记清理 = 基类（与 trae bash 原文逐字同构，
//   2026-08-14 实态核验——手写版逻辑与 core 基类完全一致，收敛为子类）
// 协议差异仅剩: PROJECT_DIR = $PWD（trae 无注入链）

import { PreCompactGuard } from "../../../core/governance/pre-compact-guard.js"

class TraePreCompactGuard extends PreCompactGuard {
  // 当前无 override（状态保存/恢复清单/tpl 清理与 core 基线一致）；命名子类承载端身份 + 未来演进位
}

process.env.PROJECT_DIR = process.env.PROJECT_DIR || process.cwd()

process.exit(new TraePreCompactGuard().run())
