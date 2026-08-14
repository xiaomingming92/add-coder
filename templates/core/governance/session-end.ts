// session-end.ts — SessionEnd 治理卡位（bash 版 session-end.sh 的 TS 同语义实现）
// 路径: templates/core/hooks/lib/session-end.ts
//
// 治理职能（卡位 #2）:
//   ① 清理 tpl-injected 标记文件
//   ② 会话审计结算（汇总 tool 调用统计）
//   ③ Stop 未触发兜底: 若 Stop 未执行验收检查，补执行 checklist 快照（best-effort）
//
// 设计范式: OOP 服务类（会话收尾三职责聚合）+ common.ts 纯函数复用（标记/状态/验收）。

import { unlinkSync } from "node:fs"
import {
  checkAddCompleteness,
  clearDevAction,
  detectActiveAdd,
  hasDevAction,
  localIsoSeconds,
  projectHash,
} from "./common.js"

/** 纯函数：解析 state 字段（对齐 bash awk -F'::' 切分） */
function stateField(state: string, index: 0 | 1 | 2 | 3 | 4): string {
  return state.split("::")[index] ?? ""
}

/**
 * SessionEnd 治理服务:
 *   - cleanupFlags: ① 清理标记（tpl-injected + dev action）
 *   - settle: ② 审计结算（stderr 输出）
 *   - stopFallback: ③ Stop 未触发兜底（best-effort，不阻断）
 */
export class SessionEndGuard {
  private readonly projectDir: string
  private readonly tplFlag: string

  constructor(projectDir?: string) {
    this.projectDir = projectDir ?? process.env.PROJECT_DIR ?? process.cwd()
    // 标记路径唯一算法 = common.ts projectHash（对齐 bash echo 含换行 md5）
    this.tplFlag = `/tmp/add_tpl_${projectHash()}`
  }

  /** ① 清理 tpl-injected 标记 + dev action 标记（对齐 cleanup_tpl_flag/cleanup_dev_flag） */
  cleanupFlags(): void {
    try {
      unlinkSync(this.tplFlag)
    } catch {
      /* ignore（对齐 rm -f || true） */
    }
    clearDevAction()
  }

  /** ② 审计结算（core 默认: stderr 文本；qoder 子类 override: stdout JSON additionalContext） */
  protected emitSettle(): void {
    process.stderr.write(`[ADD SessionEnd] 会话结束 — ${localIsoSeconds()}\n`)
  }

  /** ② 审计结算（输出到 stderr 供日志记录，对齐 bash date -Iseconds） */
  settle(): void {
    this.emitSettle()
  }

  /** ③ Stop 未触发兜底（对齐 stop_fallback：dev action 标记还在 → 补 checklist 快照） */
  stopFallback(): void {
    if (!hasDevAction()) return
    process.stderr.write("[ADD SessionEnd] ⚠️ 检测到 dev action 标记未清除——Stop 可能未触发验收检查\n")

    const state = detectActiveAdd()
    if (state === null) return

    const handoff = stateField(state, 3)
    const addRoute = stateField(state, 4)
    if (handoff && handoff !== "none") {
      process.stderr.write("[ADD SessionEnd] 补执行 checklist 快照（best-effort，不阻断）\n")
      const issues = checkAddCompleteness(handoff, addRoute !== "none" ? addRoute : "")
      for (const issue of issues) {
        process.stderr.write(issue + "\n")
      }
    }
  }

  /** 主入口：①清理 → ②结算 → ③兜底（对齐 bash main） */
  run(): number {
    this.cleanupFlags()
    this.settle()
    this.stopFallback()
    return 0
  }
}
