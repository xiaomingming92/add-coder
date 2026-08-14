// post-tool-use.ts — PostToolUse 入口（Trae 版，Task 6.1 继承体系）
// 继承 core PostToolRouter，命名子类 TraePostToolRouter:
//   ① §1 DPS 自动化 + §2a-e 文档守卫 + §3 Bash 增强 = 基类
//   （2026-08-14 实态核验: trae 手写版与 core PostToolRouter 逐字同构）
// 协议差异仅剩: MAGIC_DIR 兜底 = ".trae"（构造参数封装——原手写版误用 ".qoder" 兜底，已修正）

import { jsonGet, readHookInput } from "../../../core/governance/common.js"
import { PostToolRouter } from "../../../core/governance/post-tool-router.js"

class TraePostToolRouter extends PostToolRouter {
  /** 协议差异封装: MAGIC_DIR 兜底 = ".trae"（原手写版复制 qoder 时误用 ".qoder" 兜底，2026-08-14 修正） */
  constructor(projectDir: string) {
    super(projectDir, process.env.MAGIC_DIR || ".trae")
  }

  // 当前无 override（段落能力与 core 基线一致）；命名子类承载端身份 + 未来演进位
}

const PROJECT_DIR = process.env.PROJECT_DIR || process.cwd()
const input = readHookInput()
const toolName = jsonGet(input, "tool_name")
if (toolName === "") process.exit(0)

process.exit(new TraePostToolRouter(PROJECT_DIR).run(input, toolName))
