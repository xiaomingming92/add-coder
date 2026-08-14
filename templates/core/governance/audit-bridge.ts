// audit-bridge.ts — AuditBridge（审计桥接，Task 8.1 事件面扩展，ADD-7 自动化）
// 设计（Spec §4 嵌入式三层，回流 R1）:
//   ① 主路径（现状不动）: 拦截事件 writeHookEvent(jsonl) → MCP 常驻 fs.watch 消费 → devOperation 落库
//   ② 事件面扩展（本类）: post-tool-use 文件写入 → 写 hook 事件（decision="write"）→ 同一 jsonl 主路径
//      → MCP 常驻侧自动消费落库（幂等 dedupKey: hook::ts::planKeyword + decision + cmd）
//   ③ 自然演化: Claude mcp_tool 直调 record_dev_operation 由 handlerTypes 维度声明驱动（TOML 一行切换）
//
// 与 writeHookEvent 的关系: 复用其 jsonl 写入 + 轮转逻辑（event.file 真源），
// 但路径必须用本类 magicDir 构造参数（writeHookEvent 默认 env.MAGIC_DIR || ".qoder"
// 兜底——core/adapter 入口多数未回写 env.MAGIC_DIR，依赖 env 会错写 .qoder/reports）。

import { writeHookEvent } from "./notify.js"

/**
 * 审计桥接：post-tool-use 文件写入事件面扩展。
 * emit() 幂等——同文件同秒重复写入由 MCP 消费端 dedupKey 去重，落库唯一。
 */
export class AuditBridge {
  private readonly projectDir: string
  private readonly magicDir: string

  constructor(projectDir: string, magicDir: string) {
    this.projectDir = projectDir
    this.magicDir = magicDir
  }

  /**
   * 文件写入审计事件（decision="write"）。
   * @param filePath 被写入文件路径（绝对/相对均可，MCP 消费端以 cmd 为 targetId）
   */
  emit(filePath: string): void {
    if (!filePath || filePath === "") return
    const planKeyword = this.extractPlanKeyword(filePath)
    writeHookEvent("post-tool-use", "write", filePath, "文件写入审计（ADD-7 自动化）", planKeyword, "none", "", this.magicDir)
  }

  /**
   * 从写入路径提取 planKeyword（plans/specs/reviews 目录下命名规范文件）:
   *   xxx-plan-v1.md / xxx-add-route-v1.md / xxx-review-v1.md → xxx-{suffix}-vN
   * 其余路径 → "unknown"（与拦截事件缺省语义一致）。
   */
  private extractPlanKeyword(filePath: string): string {
    void this.projectDir
    const m = filePath.match(/([^/]+-(?:plan|add-route|review)-v\d+)\.md$/)
    return m ? m[1] : "unknown"
  }
}
