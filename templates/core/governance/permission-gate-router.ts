// permission-gate-router.ts — PermissionRequest 权限请求门禁路由（治理逻辑层，Task 5.1 继承体系）
// 治理卡位: 权限请求提示（Review 卡位）
// 设计范式: 模板方法基类——tool_name 解析流程固化，emit() 输出形态/文本 + 缺失回退值由 adapter 子类 override。
//   core 默认: 仅高风险工具（Bash/Write/Edit）stdout 二次确认提示；缺失回退 ""（bash `// empty` 语义）
//   qoder 子类: 全量工具 stderr 日志（qoder 权限弹窗自行处理 Review 卡位）；缺失回退 "unknown"（bash `// "unknown"`）

import { jsonGet, readHookInput } from "./common.js"

/** 字段提取（bash jq `// fallback` 精确语义：字段存在——含空串——取值；缺失才回退） */
function fieldOr(json: string, field: string, fallback: string): string {
  const re = new RegExp(`"${field}"\\s*:\\s*"([^"]*)"`)
  const m = re.exec(json)
  return m ? m[1] : fallback
}

/** PermissionRequest 门禁路由（tool_name 解析 → emit 输出） */
export class PermissionGateRouter {
  /** 主路由：返回 exit code（0） */
  run(input: string): number {
    // 空输入 → 空串（bash jq 无输出）；非空 → fieldOr（字段存在取值，缺失回退扩展点值）
    const toolName = input.trim() === "" ? "" : fieldOr(input, "tool_name", this.fallbackToolName())
    this.emit(toolName)
    return 0
  }

  /** tool_name 缺失回退（core: ""——bash `// empty` 语义；qoder 子类 override: "unknown"） */
  protected fallbackToolName(): string {
    return ""
  }

  /** 输出（core 默认: 仅高风险工具 stdout 二次确认提示；qoder 子类 override: 全量 stderr 日志） */
  protected emit(toolName: string): void {
    if (toolName === "Bash" || toolName === "Write" || toolName === "Edit") {
      process.stdout.write(`[ADD PermissionGate] 高风险工具: ${toolName}，请确认操作。\n`)
    }
  }
}

/** 入口便捷函数（core 薄壳用） */
export function runPermissionGate(): void {
  process.exit(new PermissionGateRouter().run(readHookInput()))
}
