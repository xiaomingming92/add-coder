// session-end.ts — SessionEnd 入口（Codex 版，Task 7.1 继承体系）
// 继承 core SessionEndGuard，命名子类 CodexSessionEndGuard:
//   ① 清理标记（tpl + dev）+ ② 审计结算（stderr）+ ③ Stop 兜底 = 基类
//   （2026-08-14 实态核验: codex 手写版与 core SessionEndGuard 逐字同构，收敛为子类）
// 协议差异仅剩: PROJECT_DIR = $PWD（codex 小文件无 git toplevel）+ MAGIC_DIR 注入

import { tryResolveMagicDir } from "../../../core/governance/common.js"
import { SessionEndGuard } from "../../../core/governance/session-end.js"

class CodexSessionEndGuard extends SessionEndGuard {
  // 当前无 override（清理/结算/兜底与 core 基线一致）；命名子类承载端身份 + 未来演进位
}

process.env.PROJECT_DIR = process.env.PROJECT_DIR || process.cwd()
// 对齐 bash export MAGIC_DIR=".codex"：唯一解析链（注入优先 → 物理推导），推导失败回退 .codex
const inferred = tryResolveMagicDir()
if (inferred && !process.env.MAGIC_DIR) process.env.MAGIC_DIR = inferred

process.exit(new CodexSessionEndGuard(process.env.PROJECT_DIR).run())
