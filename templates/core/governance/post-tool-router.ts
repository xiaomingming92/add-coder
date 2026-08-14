// lib/post-tool-router.ts — PostToolUse 路由（治理逻辑层，Task 2.1 类化收敛）
// 治理卡位 #5: 格式化 + ADD文档守卫 + 审计落库 + 结果增强 + 哨兵自动化
//
// 设计范式: OOP 路由类（§1 DPS 哨兵自动化 / §2 Edit·Write 守卫 / §3 Bash 增强）。

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join, basename, dirname } from "node:path"
import { jsonGet } from "./common.js"
import { AuditBridge } from "./audit-bridge.js"

/** 纯函数：从 input 中提取 output/content 拼接文本（对齐 bash grep -o 组合） */
function extractOutputText(raw: string): string {
  const m1 = raw.match(/"output"\s*:\s*"([^"]*)"/)
  const m2 = raw.match(/"content"\s*:\s*"([^"]*)"/)
  return [m1?.[1] ?? "", m2?.[1] ?? ""].filter(Boolean).join(" ")
}

/**
 * PostToolUse 路由（§1 DPS 自动化 → §2 Edit/Write 守卫 → §3 Bash 增强）:
 *   行为对齐注: bash 版文件含两段实现（L1-103 有效 + L104-139 死代码）——仅翻译有效段。
 */
export class PostToolRouter {
  private readonly projectDir: string
  private readonly magicDir: string
  /** 输出聚合（qoder feedback JSON 模式收集；core 直出 stderr） */
  protected readonly lines: string[] = []
  /** Task 8.1 审计桥接: 文件写入事件面扩展（jsonl 主路径 → MCP 常驻消费落库） */
  private readonly auditBridge: AuditBridge

  constructor(projectDir: string, magicDir: string) {
    this.projectDir = projectDir
    this.magicDir = magicDir
    this.auditBridge = new AuditBridge(projectDir, magicDir)
  }

  // ─────────────────────────── 扩展点 ───────────────────────────

  /** §1 DPS 自动化跳过（core: false；claude: true——claude 版未实现哨兵自动建） */
  protected shouldSkipDps(): boolean {
    return false
  }

  /** §2a 文档守卫文本（core: 章节完整） */
  protected docGuardText(filePath: string): string {
    return `[ADD PostToolUse] ADD 文档已写入: ${filePath}。请确保章节完整、双向链接齐全。\n`
  }

  /** §2 后置段（core: plan_track 自动触发 + devlog 提醒 + schema regen） */
  protected postDocSections(filePath: string): void {
    // §2b: plan_track 自动触发 — specs/ 或 add-route 写入后自动落库
    if (/\/(specs|plans)\/.*add-route/.test(filePath)) {
      let planName = basename(filePath).replace(/-add-route.*/, "").replace(/-plan-v\d*$/, "")
      // 从路径提取完整 planName（含 -plan-vN 后缀）
      if (filePath.includes("add-route")) {
        // add-route 写入：从文件名反推 planName
        const planDir = dirname(filePath)
        if (existsSync(planDir)) {
          try {
            const planFile = readdirSync(planDir).find((f) => f.includes("-plan-v") && f.endsWith(".md"))
            if (planFile) planName = planFile.replace(/\.md$/, "")
          } catch {
            /* ignore */
          }
        }
      }
      if (planName !== "") {
        this.emitLine(`[ADD PostToolUse] 📊 自动同步 PlanRecord: plan_track({ planName: "${planName}" }) — 请执行\n`)
      }
    }

    // §2c: devlog 自动提醒 — add-route Step 8 全 [x] 时提醒
    if (/add-route.*\.md$/.test(filePath)) {
      if (existsSync(filePath)) {
        const content = readFileSync(filePath, "utf-8")
        const step8 = content.match(/## Step 8[\s\S]*?(?=^## |\Z)/m)?.[0] ?? ""
        const unchecked = (step8.match(/^\- \[ \]/gm) || []).length
        const checked = (step8.match(/^\- \[x\]/gm) || []).length
        if (unchecked === 0 && checked > 0) {
          this.emitLine("[ADD PostToolUse] ⚠️ Step 8 全部收敛完成！请写 devlog日志(走mcp) → 更新 handoff\n")
        }
      }
    }

    // §2d: schema.json 自动 regen — 模板 .md 修改后更新对应 schema
    if (/templates\/.*\.md$/.test(filePath)) {
      const schemaFile = filePath.replace(/\.md$/, ".schema.json")
      if (existsSync(schemaFile)) {
        const headings = (readFileSync(filePath, "utf-8").match(/^## (.+)$/gm) ?? []).slice(0, 20)
        if (headings.length > 0) {
          this.emitLine(`[ADD PostToolUse] 🔄 模板已修改，请检查 ${schemaFile} 是否需更新（§ sections）\n`)
          this.emitLine(`[ADD PostToolUse] 模板标题: ${headings.join(" ")}\n`)
        }
      }
    }
  }

  /** 输出通道（core: stderr 直出；qoder: 收集后 feedback JSON flush） */
  protected collectJson(): boolean {
    return false
  }

  /** 输出一行（core: stderr 直出；qoder: 收集聚合） */
  protected emitLine(text: string): void {
    if (this.collectJson()) {
      this.lines.push(text.endsWith("\n") ? text.trimEnd() : text)
    } else {
      process.stderr.write(text)
    }
  }

  /** 刷新收集的输出（qoder: hookSpecificOutput.feedback JSON——Qoder 文档实证 PostToolUse 专属字段） */
  protected flushLines(): void {
    if (this.collectJson() && this.lines.length > 0) {
      process.stdout.write(
        JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse", feedback: this.lines.join("\n") } }) + "\n"
      )
    }
  }

  /** 主路由：返回 exit code（0） */
  run(input: string, toolName: string): number {
    // ═══════════════ §1: HITL DPS 自动化 — check_dps ≥ 80 → 自动建哨兵 ═══════════════
    if (!this.shouldSkipDps() && input.includes('"check_dps"')) {
      const toolOutput = extractOutputText(input)
      const dpsScore = toolOutput.match(/DPS\s*=\s*(\d+)/)?.[1] ?? ""
      const planKeyword = input.match(/"planKeyword"\s*:\s*"([^"]+)"/)?.[1] ?? ""

      if (dpsScore !== "" && planKeyword !== "") {
        const score = Number(dpsScore)
        if (!Number.isNaN(score) && score >= 80) {
          const sentinel = join(this.projectDir, this.magicDir, "hitl", `.tongyi-${planKeyword}`)
          if (!existsSync(sentinel)) {
            try {
              writeFileSync(sentinel, "")
              this.emitLine(`[ADD PostToolUse] ✅ DPS=${dpsScore} ≥80, HITL 自动通过 → ${sentinel}\n`)
            } catch {
              /* ignore */
            }
            this.emitLine(`[ADD PostToolUse] DPS=${dpsScore} ≥80, 已自动建哨兵 ${sentinel}\n`)
          } else {
            this.emitLine(`[ADD PostToolUse] DPS=${dpsScore} ≥80, 哨兵已存在 → ${sentinel}\n`)
          }
        } else {
          this.emitLine(`[ADD PostToolUse] ⚠️ DPS=${dpsScore} <80, 需 Review 后手动建哨兵 .tongyi-${planKeyword}\n`)
          this.emitLine("[ADD PostToolUse] 修复文档后重新 check_dps，通过即自动放行。\n")
        }
      }
    }

    // ═══════════════ §2: 文件写工具 matcher（Edit/Write 等: 格式化 + 文档守卫 + 自动 plan_track）═══
    if (this.isFileTool(toolName)) {
      const filePath = this.extractFilePath(input)
      if (filePath === "") return 0

      // §2a: ADD 文档结构守卫
      if (/\.(qoder|claude|add)\/(plans|specs|reviews)\//.test(filePath)) {
        this.emitLine(this.docGuardText(filePath))
      }

      // §2b/§2c/§2d 后置段（扩展点）
      this.postDocSections(filePath)

      // §2e: 审计提醒（扩展点: codex 简化文本）
      this.emitLine(this.emitAuditReminder(filePath))

      // §2f: 审计桥接（Task 8.1，ADD-7 自动化）——文件写入事件 → jsonl → MCP 常驻消费落库
      this.emitWriteEvent(filePath)
    } else if (toolName === "Bash") {
      // ═══════════════ §3: Bash matcher: 结果增强（扩展点: codex 文本）═══════════════
      this.emitLine(this.emitBashDone())
    } else {
      // 附加 matcher（扩展点: codex apply_patch——解析 patch 路径逐文件 reportFile）
      this.applyPatchMatcher(input)
    }

    this.flushLines()
    return 0
  }

  // ─────────────────────────── 扩展点（续）───────────────────────────

  /** 文件写工具判定（core: Edit/Write；codex 子类: +SearchReplace + apply_patch 走附加 matcher） */
  protected isFileTool(toolName: string): boolean {
    return toolName === "Edit" || toolName === "Write"
  }

  /** filePath 提取（core: file_path 字段；codex 子类: file_path ?? path） */
  protected extractFilePath(input: string): string {
    return jsonGet(input, "file_path")
  }

  /** §2e 审计提醒（core: 含 ADD-7；codex 子类: 简化文本） */
  protected emitAuditReminder(filePath: string): string {
    return `[ADD PostToolUse] 文件已写入: ${filePath}。请执行 record_dev_operation 落库审计（ADD-7）。\n`
  }

  /** §2f 审计桥接触发（Task 8.1，扩展点: 默认 AuditBridge.emit；
   *  如有端需关闭/改造事件面在此 override——本轮 5 端全接入，无关闭端） */
  protected emitWriteEvent(filePath: string): void {
    this.auditBridge.emit(filePath)
  }

  /** §3 Bash 增强（core: lint/tsc；codex 子类: lint/typecheck/test） */
  protected emitBashDone(): string {
    return "[ADD PostToolUse] 命令执行完成。如有 lint/tsc 错误请修复。\n"
  }

  /** 附加 matcher（core: 无；codex 子类: apply_patch 解析 `*** Add|Update|Delete File:` 逐文件 report） */
  protected applyPatchMatcher(_input: string): void {
    // core 协议: 无 apply_patch 工具
  }
}
