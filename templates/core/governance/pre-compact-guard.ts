// pre-compact-guard.ts — 上下文压缩前 ADD 状态保存（治理逻辑层，Task 3.1 继承体系）
// 治理卡位 #9: ADD状态保存 + 恢复清单导出 + tpl标记清理
// adapter 差异仅 PROJECT_DIR 注入（依赖注入，无 override 需求）。

import { writeFileSync, unlinkSync } from "node:fs"
import { detectActiveAdd, projectHash } from "./common.js"

/** PreCompact 守卫（① 状态保存到恢复标记 → ② tpl 标记清理） */
export class PreCompactGuard {
  /** 主入口：返回 exit code（0） */
  run(): number {
    const hash = projectHash()

    // ── ① 获取 ADD 状态并保存到标记文件 ──
    const state = detectActiveAdd()
    if (state !== null) {
      const [plan, step, rounds, handoff, addRoute] = state.split("::")

      // 写入恢复标记文件（SessionStart 恢复时读取）
      try {
        writeFileSync(
          `/tmp/add_recovery_${hash}`,
          `plan=${plan}\nstep=${step}\nrounds=${rounds}\nhandoff=${handoff}\nadd_route=${addRoute}\n`
        )
      } catch {
        /* ignore */
      }

      process.stderr.write(`[ADD PreCompact] ADD 状态已保存: Plan=${plan}, Step=${step}\n`)
    }

    // ── ② 清理 tpl-injected 标记（compact 后上下文丢失，下次需重注） ──
    try {
      unlinkSync(`/tmp/add_tpl_${hash}`)
    } catch {
      /* ignore（对齐 rm -f || true） */
    }

    return 0
  }
}
