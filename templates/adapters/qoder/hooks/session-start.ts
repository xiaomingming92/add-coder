// session-start.ts — SessionStart 入口（Qoder CN 版，Task 4.1 继承体系）
// 继承 core SessionStartGuard；仅 override 协议差异（bash 原文逐字对照）:
//   ① emitState: JSON 注入（ADD: plan Step.. Round.. + 代办并入）
//   ② emitIndex: JSON 注入（lines 计数，对齐 bash wc -l）
//   ③ emitTodoReminder: 空（代办已并入状态段）
//   ④ emitHitlPending: JSON 注入

import { existsSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { detectActiveAdd, tryResolveMagicDir } from "../../../core/governance/common.js"
import { PreloadTemplates } from "../../../core/governance/preload-templates.js"
import { SessionStartGuard } from "../../../core/governance/session-start-guard.js"
import { injectProjectDir } from "./lib/qoder-env.js"

const PROJECT_DIR = injectProjectDir()
const inferred = tryResolveMagicDir()
if (inferred && !process.env.MAGIC_DIR) process.env.MAGIC_DIR = inferred
const MAGIC_DIR = process.env.MAGIC_DIR ?? ""

/** JSON 输出助手（Qoder stdout 规范） */
function sessionJson(context: string): string {
  return JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: context } }) + "\n"
}

class QoderSessionStartGuard extends SessionStartGuard {
  constructor(projectDir: string) {
    super(projectDir)
  }

  /** ① 状态恢复: JSON 注入（ADD: plan Step.. Round.. + 代办并入） */
  protected override emitState(state: string | null): void {
    if (state === null) return
    const [plan, step, rounds] = state.split("::")
    let addCtx = `ADD: ${plan} Step${step} Round${rounds}`
    addCtx += "\n[代办] 如有未加载的 IDE 代办清单，请从 tasks.md §IDE JSON 刷新 TodoWrite"
    process.stdout.write(sessionJson(addCtx))
  }

  /** ② 模板索引: JSON 注入（对齐 bash bash "$TPL_SCRIPT" --index | wc -l） */
  protected override emitIndex(): void {
    try {
      const preload = new PreloadTemplates()
      preload.validate()
      const idx = preload.index()
      const lines = idx.split("\n").length - 1 // wc -l 语义
      process.stdout.write(sessionJson(`${lines} ADD templates available. Use preload-templates.sh --index for list.`))
    } catch {
      /* 对齐 bash [ -f "$TPL_SCRIPT" ] 缺失时跳过 */
    }
  }

  /** ③ 代办已并入状态段 */
  protected override emitTodoReminder(_state: string | null): void {
    // qoder 协议: 代办并入 emitState
  }

  /** ④ HITL 待审批: JSON 注入（对齐 bash find *.hitl.md -mtime -7） */
  protected override emitHitlPending(): void {
    const plansDir = join(PROJECT_DIR, MAGIC_DIR, "plans")
    if (MAGIC_DIR !== "" && existsSync(plansDir)) {
      const weekAgo = Date.now() - 7 * 24 * 3600 * 1000
      let hitlCount = 0
      try {
        hitlCount = readdirSync(plansDir)
          .filter((f) => f.endsWith(".hitl.md"))
          .filter((f) => {
            try {
              return statSync(join(plansDir, f)).mtimeMs >= weekAgo
            } catch {
              return false
            }
          }).length
      } catch {
        hitlCount = 0
      }
      if (hitlCount > 0) {
        process.stdout.write(sessionJson(`[HITL 待审批] 检测到 ${hitlCount} 个待审批 HITL 提案，请检查并处理`))
      }
    }
  }
}

process.exit(new QoderSessionStartGuard(PROJECT_DIR).run())
