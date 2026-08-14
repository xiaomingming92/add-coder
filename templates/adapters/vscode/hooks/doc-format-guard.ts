// doc-format-guard.ts — schema.json 驱动的 ADD 文档格式守卫（VS Code Copilot 版，Task 5.1 继承体系）
// 继承 core DocFormatGuard，命名子类 VscodeDocFormatGuard:
//   探测链 = core 基线（PLAN 元信息 → 一、Plan 概述 → 四、Handoff → simple-plan，
//   2026-08-14 实态核验与 core 同语义）；
//   差异点仅一个: 无算法规则段（反作弊/HITL 表/handoff 冲突不校验，bash 原文无此段）

import { readFileSync } from "node:fs"
import { DocFormatGuard } from "../../../core/governance/doc-format-guard.js"

class VscodeDocFormatGuard extends DocFormatGuard {
  /** 无算法规则段（vscode bash 原文无反作弊/HITL 表/handoff 冲突校验） */
  protected override runAlgoChecks(_templateName: string, _filePath: string, _content: string): void {
    // vscode 协议: 不执行算法化规则校验
  }
}

const PROJECT_DIR = process.env.PROJECT_DIR || process.cwd()
const MAGIC_DIR = process.env.MAGIC_DIR || ".vscode"

const guard = new VscodeDocFormatGuard(PROJECT_DIR, MAGIC_DIR)
let raw = ""
try {
  raw = readFileSync(0, "utf-8")
} catch {
  raw = ""
}
process.exitCode = guard.run(raw)
