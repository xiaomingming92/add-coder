// stop-check.ts — Stop 入口薄壳（Task 2.2 薄壳化）
// 治理逻辑: lib/stop-router.ts（StopRouter 四象限分流，象限文本消费 hook-context-rules.toml）
// 入口职责: 仅解析 + 进程语义（<50 行），治理 0 复制。

import { tryResolveMagicDir } from "../governance/common.js"
import { StopRouter } from "../governance/stop-router.js"

// 对齐 bash: MAGIC_DIR 从物理位置推导并 export（入口注入优先）
const inferredMagicDir = tryResolveMagicDir()
if (inferredMagicDir && !process.env.MAGIC_DIR) {
  process.env.MAGIC_DIR = inferredMagicDir
}

process.exit(new StopRouter().run())
