// doc-format-guard.ts — schema.json 驱动的 ADD 文档格式守卫（Claude 版，Task 3.1 子类最小化）
// 继承 core DocFormatGuard；差异点仅两个（bash 原文 L87-104 逐字对照）:
//   ① 内容探测链: 加载 [doc.adapter_content_rules] claude 独立链（构造参数 adapterName）
//      ——「## 四、Handoff」分支前置 + simple-standard-plan-template.md 映射
//   ② 无算法规则段（反作弊/HITL 表/handoff 冲突不校验）——override runAlgoChecks

import { readFileSync } from "node:fs"
import { DocFormatGuard } from "../../../core/governance/doc-format-guard.js"

class ClaudeDocFormatGuard extends DocFormatGuard {
  constructor(projectDir: string, magicDir: string) {
    super(projectDir, magicDir, "claude")
  }

  /** 差异点 ②: claude 版无算法规则段 */
  protected override runAlgoChecks(_templateName: string, _filePath: string, _content: string): void {
    // claude 版不执行算法化规则校验（bash 原文无此段）
  }
}

// ── 主入口 ──
const PROJECT_DIR = process.env.PROJECT_DIR || process.cwd()
const MAGIC_DIR = process.env.MAGIC_DIR || ".qoder"

const guard = new ClaudeDocFormatGuard(PROJECT_DIR, MAGIC_DIR)
let raw = ""
try {
  raw = readFileSync(0, "utf-8")
} catch {
  raw = ""
}
process.exitCode = guard.run(raw)
