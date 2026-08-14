// permission-gate.ts — PermissionRequest 入口（Qoder CN 版，Task 4.1 继承体系补全）
// 继承 core PermissionGateRouter，命名子类 QoderPermissionGateRouter:
//   ① emit override: 全量工具 stderr 日志（qoder bash 原文无条件输出——
//      qoder 权限弹窗自行处理 Review 卡位；core 是仅高风险工具 stdout 提示）

import { readHookInput, tryResolveMagicDir } from "../../../core/governance/common.js"
import { PermissionGateRouter } from "../../../core/governance/permission-gate-router.js"

class QoderPermissionGateRouter extends PermissionGateRouter {
  /** ① tool_name 缺失回退 "unknown"（bash jq `// \"unknown\"` 语义） */
  protected override fallbackToolName(): string {
    return "unknown"
  }

  /** ② qoder 协议: 全量工具 stderr 日志（bash 原文逐字） */
  protected override emit(toolName: string): void {
    process.stderr.write(`[ADD PermissionRequest] 工具 ${toolName} 请求权限。如有 Review 文档待确认，请先检查。\n`)
  }
}

// 对齐 bash: MAGIC_DIR 由物理位置推导注入（替代 HOOK_DIR 局部变量 source 传递）
const inferred = tryResolveMagicDir()
if (inferred && !process.env.MAGIC_DIR) process.env.MAGIC_DIR = inferred

const input = readHookInput()
process.exit(new QoderPermissionGateRouter().run(input))
