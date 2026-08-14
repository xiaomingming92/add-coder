// stop-failure.ts — Claude Code StopFailure 紧急审计转储（Claude 独有事件）
// 治理卡位 #8: 紧急审计转储 + 异常标记

import { writeFileSync } from "node:fs"
import { detectActiveAdd, localIsoSeconds, projectHash } from "../../../core/governance/common.js"
import { resolveClaudeProjectDir } from "./lib/claude-env.js"

const PROJECT_DIR = resolveClaudeProjectDir()
// 对齐 bash export PROJECT_DIR（后续 hash/路径均消费该值）
process.env.PROJECT_DIR = PROJECT_DIR

process.stderr.write(`[ADD StopFailure] ⚠️ Agent 异常退出 — ${localIsoSeconds()}\n`)

// 尝试 dump 当前 ADD 状态
const state = detectActiveAdd()
if (state !== null) {
  const [plan, step, rounds, handoff, addRoute] = state.split("::")
  process.stderr.write(`[ADD StopFailure] 异常退出时 ADD 状态:
  Plan: ${plan}
  Step: ${step}
  轮次: ${rounds}
  handoff: ${handoff}
  add-route: ${addRoute}
`)
}

// 标记异常终止（供 SessionEnd 兜底识别）
try {
  writeFileSync(`/tmp/add_failure_${projectHash() || ""}`, "")
} catch {
  /* ignore（对齐 touch || true） */
}

process.exit(0)
