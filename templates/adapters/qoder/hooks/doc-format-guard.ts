// doc-format-guard.ts — schema.json 驱动的 ADD 文档格式守卫（Qoder CN 版，Task 4.1 继承体系）
// 继承 core DocFormatGuard，命名子类 QoderDocFormatGuard——六端实态核验（2026-08-14）:
//   探测链与 core 数据驱动同语义（PLAN 元信息 → 一、Plan 概述 → 四、Handoff → simple-plan，
//   无 claude 的 Handoff 前置差异）→ 当前无 override（空子类承载端身份 + 未来演进位）；
//   文本漂移（「doc-format-guard.sh」残留）已在 core 修正（TS 时代无 .sh）。
// 协议差异仅剩: PROJECT_DIR 注入链（qoder-env）

import { readFileSync } from "node:fs"
import { DocFormatGuard } from "../../../core/governance/doc-format-guard.js"
import { injectProjectDir } from "./lib/qoder-env.js"

/**
 * Qoder DocFormatGuard（命名子类）:
 *   当前无 override（探测链同 core）；未来 qoder 协议演进（如 hookSpecificOutput 新字段）
 *   在此扩展，不改 core 基类。
 */
class QoderDocFormatGuard extends DocFormatGuard {
  constructor(projectDir: string, magicDir: string) {
    super(projectDir, magicDir)
  }
}

injectProjectDir()
const PROJECT_DIR = process.env.PROJECT_DIR || process.cwd()
const MAGIC_DIR = process.env.MAGIC_DIR || ".qoder"

const guard = new QoderDocFormatGuard(PROJECT_DIR, MAGIC_DIR)
let raw = ""
try {
  raw = readFileSync(0, "utf-8")
} catch {
  raw = ""
}
process.exitCode = guard.run(raw)
