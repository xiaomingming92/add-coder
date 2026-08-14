// subagent-stop.ts — SubagentStop 入口（Codex 版，Task 7.1 继承体系）
// 继承 core SubagentStopRouter，命名子类 CodexSubagentStopRouter:
//   ① 边界校验 + deliverables 越界检查 + 审计聚合 = 基类（与 codex bash 原文逐字同构，
//   2026-08-14 实态核验——手写版逻辑与 core 基类完全一致，收敛为子类）
// 协议差异仅剩: PROJECT_DIR = $PWD（codex 小文件无 git toplevel）+ MAGIC_DIR 注入

import { readHookInput, tryResolveMagicDir } from "../../../core/governance/common.js"
import { SubagentStopRouter } from "../../../core/governance/subagent-stop-router.js"

class CodexSubagentStopRouter extends SubagentStopRouter {
  // 当前无 override（边界校验 + 审计聚合与 core 基线一致）；命名子类承载端身份 + 未来演进位
}

process.env.PROJECT_DIR = process.env.PROJECT_DIR || process.cwd()
// 对齐 bash export MAGIC_DIR=".codex"：唯一解析链（注入优先 → 物理推导），推导失败回退 .codex
const inferred = tryResolveMagicDir()
if (inferred && !process.env.MAGIC_DIR) process.env.MAGIC_DIR = inferred

const input = readHookInput()
process.exit(new CodexSubagentStopRouter().run(input))
