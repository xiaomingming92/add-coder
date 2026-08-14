// doc-format-guard.ts — doc-format-guard 入口薄壳（Task 2.2 薄壳化）
// 治理逻辑: lib/doc-format-guard.ts（DocFormatGuard 服务类，规则消费 hook-doc-format-rules.toml）
// 入口职责: 仅解析 + 进程语义（<50 行），治理 0 复制。

import { readFileSync } from "node:fs"
import { DocFormatGuard } from "../governance/doc-format-guard.js"

// ── 主入口（仅产物被 node 直调时执行；被 import 时保持纯库） ──
if (import.meta.url === new URL(`file://${process.argv[1] ?? ""}`).href) {
  const PROJECT_DIR = process.env.PROJECT_DIR || process.cwd()
  const MAGIC_DIR = process.env.MAGIC_DIR || ".qoder"

  const guard = new DocFormatGuard(PROJECT_DIR, MAGIC_DIR)
  let raw = ""
  try {
    raw = readFileSync(0, "utf-8")
  } catch {
    raw = ""
  }
  process.exitCode = guard.run(raw)
}
