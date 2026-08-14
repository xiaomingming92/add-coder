// pre-compact.ts — 上下文压缩前 ADD 状态保存（Codex 版，Task 7.1 继承体系）
// 继承 core PreCompactGuard，命名子类 CodexPreCompactGuard:
//   ① 状态保存到恢复标记 + ② tpl 标记清理 = 基类（与 codex bash 原文逐字同构，
//   2026-08-14 实态核验——手写版逻辑与 core 基类完全一致，收敛为子类）
// 协议差异仅剩: PROJECT_DIR = $PWD（codex 小文件无 git toplevel，bash 原文逐字）
//               + MAGIC_DIR 唯一解析链注入（.codex 兜底）

import { tryResolveMagicDir } from "../../../core/governance/common.js"
import { PreCompactGuard } from "../../../core/governance/pre-compact-guard.js"

class CodexPreCompactGuard extends PreCompactGuard {
  // 当前无 override（状态保存/恢复清单/tpl 清理与 core 基线一致）；命名子类承载端身份 + 未来演进位
}

process.env.PROJECT_DIR = process.env.PROJECT_DIR || process.cwd()
// 对齐 bash export MAGIC_DIR=".codex"：唯一解析链（注入优先 → 物理推导），推导失败回退 .codex
const inferred = tryResolveMagicDir()
if (inferred && !process.env.MAGIC_DIR) process.env.MAGIC_DIR = inferred

process.exit(new CodexPreCompactGuard().run())
