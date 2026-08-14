// doc-format-guard.ts — schema.json 驱动的 ADD 文档格式守卫（Codex 版，Task 7.1 继承体系）
// 继承 core DocFormatGuard，命名子类 CodexDocFormatGuard:
//   ① 探测链与 core 数据驱动同语义（PLAN 元信息 → 一、Plan 概述 → 四、Handoff → simple-plan，
//      2026-08-14 实态核验 codex 独立类 L133-135 与 core 基线一致）→ 当前无 override
//      （空子类承载端身份 + 未来演进位）
// 协议差异仅剩: MAGIC_DIR 兜底 = ".codex"（构造参数）

import { readFileSync } from "node:fs"
import { DocFormatGuard } from "../../../core/governance/doc-format-guard.js"

class CodexDocFormatGuard extends DocFormatGuard {
  /** 协议差异封装: MAGIC_DIR 兜底 = ".codex"（codex 端） */
  constructor(projectDir: string, magicDir: string) {
    super(projectDir, magicDir)
  }

  // 当前无 override（探测链/算法段同 core）；未来 codex 协议演进在此扩展，不改 core
}

const PROJECT_DIR = process.env.PROJECT_DIR || process.cwd()
const MAGIC_DIR = process.env.MAGIC_DIR || ".codex"

const guard = new CodexDocFormatGuard(PROJECT_DIR, MAGIC_DIR)
let raw = ""
try {
  raw = readFileSync(0, "utf-8")
} catch {
  raw = ""
}
process.exitCode = guard.run(raw)
