// session-start.ts — SessionStart 入口（Codex 版，Task 7.1 继承体系）
// 继承 core SessionStartGuard，命名子类 CodexSessionStartGuard:
//   ① emitState/emitTodoReminder/emitHitlPending = 基类默认（bash 原文逐字一致）
//   ② emitIndex override: 自定义列表格式（codex bash 原文——`## ADD 可用模板清单` + `- f` 简单列出，
//      非 PreloadTemplates 表格格式）
// 入口差异: PROJECT_DIR=git toplevel（codex 大文件协议）+ MAGIC_DIR 注入（.codex 兜底）

import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { execSync } from "node:child_process"
import { tryResolveMagicDir } from "../../../core/governance/common.js"
import { SessionStartGuard } from "../../../core/governance/session-start-guard.js"

class CodexSessionStartGuard extends SessionStartGuard {
  /** ② 模板索引: 自定义列表格式（codex bash 原文逐字，非表格） */
  protected override emitIndex(): void {
    const TEMPLATES_DIR = join(this.projectDir, this.magicDir, "templates")
    if (existsSync(TEMPLATES_DIR)) {
      process.stdout.write("## ADD 可用模板清单\n")
      try {
        for (const f of readdirSync(TEMPLATES_DIR)) {
          if (f.endsWith(".md")) process.stdout.write(`- ${f}\n`)
        }
      } catch {
        /* ignore（对齐 bash 读取失败跳过） */
      }
    }
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
const MAGIC_DIR = tryResolveMagicDir() || ".codex"
process.env.MAGIC_DIR = MAGIC_DIR

process.exit(new CodexSessionStartGuard(PROJECT_DIR).run())
