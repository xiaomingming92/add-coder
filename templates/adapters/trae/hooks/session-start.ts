// session-start.ts — SessionStart 入口（Trae 版，Task 6.1 继承体系）
// 继承 core SessionStartGuard，命名子类 TraeSessionStartGuard:
//   ① 状态恢复 + ② 模板索引 + ③ 代办 + ④ HITL 待审批 = 基类默认
//   （2026-08-14 实态核验: trae bash 原文四段与 core 逐字一致，收敛为子类无 override）
// 协议差异仅剩: PROJECT_DIR = $PWD（trae 无注入链）

import { SessionStartGuard } from "../../../core/governance/session-start-guard.js"

class TraeSessionStartGuard extends SessionStartGuard {
  // 当前无 override（四段与 core 基线一致）；命名子类承载端身份 + 未来演进位
}

process.env.PROJECT_DIR = process.env.PROJECT_DIR || process.cwd()

process.exit(new TraeSessionStartGuard(process.env.PROJECT_DIR).run())
