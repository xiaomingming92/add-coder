// session-end.ts — SessionEnd 入口（Trae 版，Task 6.1 继承体系）
// 继承 core SessionEndGuard，命名子类 TraeSessionEndGuard:
//   ① 清理标记（tpl + dev）+ ② 审计结算（stderr）+ ③ Stop 兜底 = 基类
//   （2026-08-14 实态核验: trae 手写版与 core SessionEndGuard 逐字同构——bash 原文
//   清理 → 警告 → checklist 快照 → 结算，收敛为子类无 override）
// 协议差异仅剩: PROJECT_DIR = $PWD（trae 无注入链）

import { SessionEndGuard } from "../../../core/governance/session-end.js"

class TraeSessionEndGuard extends SessionEndGuard {
  // 当前无 override（清理/结算/兜底与 core 基线一致）；命名子类承载端身份 + 未来演进位
}

process.env.PROJECT_DIR = process.env.PROJECT_DIR || process.cwd()

process.exit(new TraeSessionEndGuard(process.env.PROJECT_DIR).run())
