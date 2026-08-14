// stop-check.ts — Stop 入口（Codex 版，Task 7.1 继承体系）
// 继承 core StopRouter，命名子类 CodexStopRouter:
//   ① Q0/Q1/Q2 = 基类默认（stderr + exit 语义，与 codex bash 原文逐字一致）
//   ② emitQ3 override: {systemMessage} JSON（codex 私有协议——plan/approval/tasks 字段）
//   ③ emitQ4Pass override: {systemMessage} JSON（codex stdout 契约——Q4 通过形态；
//      ~~q4Check override~~ → 2026-08-14 Task 9.4.4④ 删除，回归 core 双维度组合（DB 进度 + checklist 质量））
// 入口差异: PROJECT_DIR=git toplevel（codex 大文件协议）+ stopHookActive 续跑保护 + MAGIC_DIR 注入

import { execSync } from "node:child_process"
import { readHookInput, tryResolveMagicDir } from "../../../core/governance/common.js"
import { StopRouter } from "../../../core/governance/stop-router.js"

/** 对齐 bash jq -nc --arg message '{systemMessage: $message}'（codex 私有协议） */
function systemMessage(message: string): string {
  return JSON.stringify({ systemMessage: message })
}

class CodexStopRouter extends StopRouter {
  /** ② Q3: systemMessage JSON（codex 协议——approval/tasks 字段，bash 原文逐字） */
  protected override emitQ3(plan: string, approval: string, tasks: string): number {
    process.stdout.write(systemMessage(`[ADD Stop] Plan: ${plan}；approval: ${approval}；tasks: ${tasks}。本次无代码改动。`) + "\n")
    return 0
  }

  /** ③ Q4 通过: systemMessage JSON（codex stdout 契约——Task 9.4.4④ 新增，
   *  原 q4Check 完成分支的 systemMessage 语义保留到协议层） */
  protected override emitQ4Pass(): number {
    process.stdout.write(systemMessage("[ADD Stop] ✅ 验收通过——checklist 全部勾选，devlog 已记录。DB Plan tasks 已完成；可进入 Review/closure。") + "\n")
    return 0
  }
}

// 对齐 bash: git rev-parse --show-toplevel || pwd
function resolveProjectDir(): string {
  try {
    return execSync("git rev-parse --show-toplevel", { encoding: "utf-8" }).trim()
  } catch {
    return process.cwd()
  }
}
const PROJECT_DIR = resolveProjectDir()
process.env.PROJECT_DIR = PROJECT_DIR
// 对齐 bash export MAGIC_DIR=".codex"：唯一解析链（注入优先 → 物理推导），推导失败回退 .codex
process.env.MAGIC_DIR = tryResolveMagicDir() || ".codex"

const input = readHookInput()
let stopHookActive = false
if (input.trim() !== "") {
  try {
    const parsed = JSON.parse(input) as { stop_hook_active?: unknown }
    stopHookActive = parsed.stop_hook_active === true
  } catch {
    stopHookActive = false
  }
}
// codex 续跑保护: 内部 Stop 触发时跳过（bash 原文逐字）
if (stopHookActive) process.exit(0)

process.exit(new CodexStopRouter().run())
