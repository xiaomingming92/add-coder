// post-tool-failure-router.ts — PostToolUseFailure 错误分类路由（治理逻辑层，Task 5.1 继承体系）
// 设计范式: 模板方法基类——tool_name/error 解析流程固化，emit() 输出 + 缺失回退值由 adapter 子类 override。
//   core 默认: stdout 固定提示（不依赖参数）
//   qoder 子类: stderr 回退建议；缺失回退 "unknown"（bash `// "unknown"` 语义）
//   vscode 子类: 429 限流降级（串行模式建议）；error 缺失回退 "未知错误"（bash grep || echo 语义）

import { jsonGet, readHookInput } from "./common.js"

/** 字段提取（bash jq `// fallback` 精确语义：字段存在——含空串——取值；缺失才回退） */
function fieldOr(json: string, field: string, fallback: string): string {
  const re = new RegExp(`"${field}"\\s*:\\s*"([^"]*)"`)
  const m = re.exec(json)
  return m ? m[1] : fallback
}

/** PostToolUseFailure 错误分类路由（tool_name/error 解析 → emit 输出） */
export class PostToolFailureRouter {
  /** 主路由：返回 exit code（0） */
  run(input: string): number {
    // 空输入语义: 默认 → 空串（bash jq 无输出）；vscode 子类 → fallback（bash grep || echo）
    const empty = input.trim() === ""
    const toolName = empty
      ? (this.emptyUsesFallback() ? this.fallbackToolName() : "")
      : fieldOr(input, "tool_name", this.fallbackToolName())
    const error = empty
      ? (this.emptyUsesFallback() ? this.fallbackError() : "")
      : fieldOr(input, "error", this.fallbackError())
    this.emit(toolName, error)
    return 0
  }

  /** 空输入是否走 fallback（core/qoder: false——空串；vscode 子类 override: true——bash grep || echo 语义） */
  protected emptyUsesFallback(): boolean {
    return false
  }

  /** tool_name 缺失回退（core: ""；qoder 子类 override: "unknown"） */
  protected fallbackToolName(): string {
    return ""
  }

  /** error 缺失回退（core: ""；qoder 子类 override: "unknown"；vscode 子类 override: "未知错误"） */
  protected fallbackError(): string {
    return ""
  }

  /** 输出（core 默认: stdout 固定文本——bash 原文逐字；adapter 子类 override 用 toolName/error） */
  protected emit(_toolName: string, _error: string): void {
    process.stdout.write("[ADD PostToolFailure] 工具调用失败，请检查错误信息并修复。\n")
  }
}

/** 入口便捷函数（core 薄壳用） */
export function runPostToolFailure(): void {
  process.exit(new PostToolFailureRouter().run(readHookInput()))
}
