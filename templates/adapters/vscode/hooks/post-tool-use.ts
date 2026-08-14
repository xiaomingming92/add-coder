// post-tool-use.ts — PostToolUse 入口（VS Code Copilot 版，Task 5.1 继承体系）
// 继承 core PostToolRouter，命名子类 VscodePostToolRouter:
//   六端实态核验（2026-08-14）: post-tool-use 段落能力统一 core 全段
//   （§1 DPS 自动化 + §2a-e 文档守卫 + §3 Bash 增强）——当前无 override，
//   命名子类承载端身份 + 未来演进位（如 vscode 协议支持 feedback JSON 时在此扩展）
// 协议差异仅剩: MAGIC_DIR 兜底 = ".vscode"（构造参数注入）

import { jsonGet, readHookInput } from "../../../core/governance/common.js"
import { PostToolRouter } from "../../../core/governance/post-tool-router.js"

class VscodePostToolRouter extends PostToolRouter {
  /** 协议差异封装: MAGIC_DIR 兜底 = ".vscode"（env 注入优先，bash 原文逐字） */
  constructor(projectDir: string) {
    super(projectDir, process.env.MAGIC_DIR || ".vscode")
  }

  // 当前无 override（段落能力与 core 基线一致）；命名子类承载端身份 + 未来演进位
}

const PROJECT_DIR = process.env.PROJECT_DIR || process.cwd()
const input = readHookInput()
const toolName = jsonGet(input, "tool_name")
if (toolName === "") process.exit(0)

process.exit(new VscodePostToolRouter(PROJECT_DIR).run(input, toolName))
