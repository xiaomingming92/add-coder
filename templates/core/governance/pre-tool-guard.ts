// pre-tool-guard.ts — PreToolUse 守卫基类（治理逻辑层，Task 3.1 继承体系）
// 治理卡位 #4: 危险命令拦截 / 模板路径兜底 / 写入前置守卫 / 敏感文件保护
// 规则真源: hook-guard-rules.toml（[guard.detectors] 基线链 / [guard.adapter_detectors] 独立链 /
//   [guard.sensitive_files] / [guard.thresholds] / [guard.template_hints] / [guard.hitl_exemptions]）
//
// 设计范式: 模板方法基类——治理流程（链加载 → 判定 → §B/§C 分流）在基类固化，
//   协议差异（输出形态 / exit 语义 / 阻断日志 / 附加 matcher）由 adapter 子类
//   override protected 扩展点。adapter 入口 = 薄壳（环境注入）+ 子类（协议差异），治理流程 0 复制。

import { existsSync, mkdirSync, appendFileSync, statSync } from "node:fs"
import { join, basename } from "node:path"
import { detectActiveAdd, jsonGet, localIsoSeconds, markDevAction } from "./common.js"
import { writeHookEvent } from "./notify.js"
import { guard } from "./rules.js"

/** 检测器条目（rules.guard.detectors / adapter_detectors 结构） */
interface Detector {
  id: string
  regex: string
  flags?: string
  reason: string
  stderr: string
}

/** 模板提示条目（rules.guard.template_hints 结构） */
interface TemplateHint {
  pattern: string
  message: string
}

/** 拦截原因与输出文本 */
interface BlockResult {
  reason: string
  stderr: string
}

/** 纯函数：构造 hookSpecificOutput JSON（对齐 bash echo 格式） */
function askJson(reason: string): string {
  return `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"${reason}"}}`
}

function allowJson(reason: string): string {
  return `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"${reason}"}}`
}

function denyJson(reason: string): string {
  return `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"${reason}"}}`
}

/**
 * PreToolUse 守卫基类（模板方法）:
 *   流程固化（不可 override）: runSectionA / runSectionB / runSectionC
 *   扩展点（protected，adapter 子类 override 协议差异）:
 *     - detectorChain(): 检测链加载（core 基线 / adapter 独立链，按 adapterName）
 *     - onBlock(): §A 阻断输出（core: stderr+askJson+logBlock+2；claude: 纯 stderr+2）
 *     - onNoPlanAllow(): §B 无 Plan 放行（core: allowJson+0；claude: allowJson+2）
 *     - onSensitiveDeny(): 敏感文件阻断（core: stderr+denyJson+2；claude: 纯 stderr+2）
 *     - onOtherTool(): 附加 matcher（core: 无；claude: ③ Read 模板提示）
 */
export class PreToolUseGuard {
  protected readonly projectDir: string
  protected readonly magicDir: string
  protected readonly planKeyword: string
  protected readonly planStatus: string
  protected readonly adapterName: string

  constructor(projectDir: string, magicDir: string, adapterName: string = "core") {
    this.projectDir = projectDir
    this.magicDir = magicDir
    this.adapterName = adapterName
    const active = detectActiveAdd()
    if (active !== null) {
      this.planKeyword = active.split("::")[0] ?? ""
      this.planStatus = "active"
    } else {
      this.planKeyword = "no-active-plan"
      this.planStatus = "none"
    }
  }

  // ─────────────────────────── 扩展点 ───────────────────────────

  /** 检测链加载（真源: [guard.detectors] 基线 / [guard.adapter_detectors] 独立链） */
  protected detectorChain(): Detector[] {
    if (this.adapterName === "core") {
      return (guard.detectors as unknown as Detector[]) ?? []
    }
    const all = (guard.adapter_detectors as unknown as Array<Detector & { adapter: string }>) ?? []
    return all.filter((d) => d.adapter === this.adapterName)
  }

  /** §A 阻断输出（core 协议: stderr + askJson + 阻断日志 + 事件 + 2） */
  protected onBlock(blocked: BlockResult, command: string): number {
    process.stderr.write(blocked.stderr)
    process.stdout.write(askJson(blocked.reason) + "\n")
    this.logBlock("检测器链", command)
    writeHookEvent("pre-tool-use", "deny", command, blocked.reason, this.planKeyword, this.planStatus)
    return 2
  }

  /** §A 放行后处理（core: 无操作；claude: bash 原文 mark_dev_action） */
  protected onSectionAPass(_command: string): void {
    // core 协议: 构建工具/版本控制/只读操作放行，无标记
  }

  /** §B 无 Plan 放行（core 协议: 提示 + allowJson + 事件 + 0） */
  protected onNoPlanAllow(toolName: string, filePath: string): number {
    process.stderr.write("[ADD 提示] 正在写入 Plan/Spec/Review 文档但无活跃 ADD Plan——首次创建场景放行，建议先执行 add-paradigm 生成 Plan+add-route\n")
    process.stdout.write(allowJson("无活跃 ADD Plan 但为 Plan/Spec/Review 写入（首次创建场景），提示而非拦截") + "\n")
    writeHookEvent("pre-tool-use", "info", `${toolName} ${filePath}`, "无活跃 ADD Plan 下写入 Plan/Spec/Review（首次创建放行）", this.planKeyword, this.planStatus)
    return 0
  }

  /** §B 敏感文件阻断（core 协议: stderr + denyJson + 2） */
  protected onSensitiveDeny(filePath: string): number {
    const sensReason = (guard.sensitive_files as { regex: string; deny_reason: string }).deny_reason
    process.stderr.write(`⛔ 敏感文件受保护，禁止写入: ${filePath}\n`)
    process.stdout.write(denyJson(sensReason) + "\n")
    return 2
  }

  /** 大文件适配提示文本（core: payload 限制；qoder: Qoder 40500 错误码） */
  protected largeFileText(fsize: number): string {
    return `⚠️ [ADD PreToolUse] 文件已有 ${fsize} 字节，Write 全量覆盖可能触发工具 payload 限制。建议用 SearchReplace 分块追加。\n`
  }

  /** HITL 未 tongyi 输出（core 协议: stderr 3 行 + JSON deny + 事件 + exit 0；qoder: exit 2 + event ask） */
  protected onHitlDeny(toolName: string, filePath: string, tongyiMarker: string): number {
    process.stderr.write(`⛔ [ADD PreToolUse §C] HITL 未 tongyi: ${filePath}\n`)
    process.stderr.write(`   原因: 哨兵文件 ${tongyiMarker} 不存在\n`)
    process.stderr.write('   操作: 请先调用 create_hitl 创建审批，再 update_hitl({ status: "TONGYI" })\n')
    const reason = `HITL 未 tongyi: 哨兵 ${tongyiMarker} 不存在。请先 create_hitl → 人工 tongyi → update_hitl 后再写入`
    process.stdout.write(
      `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"${reason}","additionalContext":"${reason}"}}\n`
    )
    writeHookEvent("pre-tool-use", "deny", `${toolName} ${filePath}`, `HITL 未 tongyi: ${tongyiMarker}`, this.planKeyword, this.planStatus)
    return 0
  }

  /** 附加 matcher（core: 无；claude: ③ Read 模板提示） */
  protected onOtherTool(_input: string, _toolName: string): number {
    return 0
  }

  // ─────────────────────────── 流程固化 ───────────────────────────

  /** 阻断日志（对齐 bash _log_block：追加到 debug-dump/stdin.log） */
  protected logBlock(rule: string, cmd: string): void {
    try {
      const dir = join(this.projectDir, this.magicDir, "debug-dump")
      mkdirSync(dir, { recursive: true })
      appendFileSync(
        join(dir, "stdin.log"),
        `=== ${localIsoSeconds()} [BLOCKED by §A: ${rule}] ===\ncommand: ${cmd.slice(0, 300)}\n=== DONE ===\n`
      )
    } catch {
      /* ignore */
    }
  }

  /** §A 检测器链判定：返回阻断结果，放行返回 null */
  private checkBashCommand(command: string): BlockResult | null {
    for (const d of this.detectorChain()) {
      if (new RegExp(d.regex, d.flags ?? "").test(command)) {
        return { reason: d.reason, stderr: d.stderr }
      }
    }
    return null
  }

  /** §A 入口：Bash 工具写入保护（模板方法） */
  runSectionA(input: string): number {
    const command = jsonGet(input, "command")
    if (command === "") return 0 // 无命令字段 → 走 §B

    const blocked = this.checkBashCommand(command)
    if (blocked) {
      return this.onBlock(blocked, command)
    }
    // 放行: 构建工具/版本控制/只读操作
    this.onSectionAPass(command)
    return 0
  }

  /** §B 入口：Write/Edit 文件写入前置守卫（模板方法） */
  runSectionB(input: string, toolName: string): number {
    if (toolName !== "Write" && toolName !== "Edit" && toolName !== "SearchReplace") return 0

    const filePath = jsonGet(input, "file_path")
    if (filePath === "") return 0

    // §B: 写入守卫按当前 magicDir 限域（无 Plan 分支: core return / codex 提示继续）
    if (new RegExp(`${this.magicDir}/(plans|specs|reviews)/`).test(filePath)) {
      const state = detectActiveAdd()
      if (state === null) {
        if (this.noPlanHint()) {
          process.stderr.write(`[ADD PreToolUse] 正在修改 ADD 文档但未检测到活跃 Plan: ${filePath}\n`)
        } else {
          return this.onNoPlanAllow(toolName, filePath)
        }
      }
    }

    // 敏感文件保护 + HITL + 模板提示（guard 核心——codex apply_patch 复用）
    const guardCode = this.guardFilePath(filePath, toolName)
    if (guardCode !== 0) return guardCode

    markDevAction()
    return 0
  }

  /**
   * guard 核心（敏感文件 → HITL → 模板提示；codex apply_patch 路径逐文件复用）:
   *   敏感 → onSensitiveDeny；HITL → onHitlDeny；模板提示/大文件 → stderr
   *   返回阻断码（非 0 = 阻断，调用方必须透传 exit）——
   *   2026-08-14 Task 9.4 修复: 原返回 void 丢弃 onSensitiveDeny/onHitlDeny 的 exit 2（敏感文件拦截形同虚设）
   */
  protected guardFilePath(filePath: string, toolName: string): number {
    // 敏感文件保护（扩展点: codex 自定义锚定正则）
    const sensRegex = this.sensitiveFileRegex()
    if (new RegExp(sensRegex).test(filePath)) {
      return this.onSensitiveDeny(filePath)
    }

    // §C: 模板类型前置注入（真源: [guard.template_hints]）
    if (new RegExp(`${this.magicDir}/(plans)/`).test(filePath)) {
      const fname = basename(filePath)
      for (const hint of (guard.template_hints as unknown as TemplateHint[]) ?? []) {
        if (new RegExp(hint.pattern).test(fname)) {
          process.stderr.write(hint.message + "\n")
        }
      }
      // Write 大文件适配（真源: [guard.thresholds.large_file_bytes]）
      if (toolName === "Write" && existsSync(filePath)) {
        const fsize = statSync(filePath).size
        const limit = (guard.thresholds as { large_file_bytes: number }).large_file_bytes
        if (fsize > limit) {
          process.stderr.write(this.largeFileText(fsize))
        }
      }
    }

    // §C: HITL tongyi 检查（扩展点: codex 双哨兵 + reviews 豁免差异）
    let doHitl = false
    if (new RegExp(`${this.magicDir}/(plans)/`).test(filePath)) {
      doHitl = !filePath.includes("-handoff")
    } else if (new RegExp(`${this.magicDir}/(reviews)/`).test(filePath)) {
      doHitl = !this.hitlExemptReviews().test(filePath)
    }

    if (doHitl) {
      // 限域: 仅当前 magicDir 下的 plans/reviews 触发 HITL 门禁
      if (!new RegExp(`${this.magicDir}/(plans|reviews)/`).test(filePath)) {
        doHitl = false
      } else {
        const relative = filePath.replace(/.*\/\.(qoder|claude|add|vscode|trae|codex)\/(plans|reviews)\//, "")
        const planName = basename(relative, ".md")
          .replace(/\.hitl$/, "")
          .replace(/-plan-v\d*$/, "")
          .replace(/-add-route-v\d*$/, "")
          .replace(/-review-v\d*$/, "")
          .replace(/-review-implementation$/, "")
          .replace(/-review-runtime$/, "")
        if (planName !== "") {
          const markers = this.hitlMarkers(planName)
          if (!markers.some((m) => existsSync(join(this.projectDir, this.magicDir, "hitl", m)))) {
            const tongyiMarker = markers[0]
            return this.onHitlDeny(toolName, filePath, tongyiMarker)
          }
        }
      }
    }
    return 0
  }

  // ─────────────────────────── 扩展点（续）───────────────────────────

  /** 敏感文件正则（core: TOML 真源；codex 子类: 锚定版 `(^|\/)(...)$|credentials|secrets`） */
  protected sensitiveFileRegex(): string {
    return (guard.sensitive_files as { regex: string; deny_reason: string }).regex
  }

  /** Reviews HITL 豁免（仅 -runtime；review-implementation-* 也走 HITL——2026-08-14 Task 9.4.4③ 上提，回流: I2） */
  protected hitlExemptReviews(): RegExp {
    return /-runtime/
  }

  /** HITL 哨兵（[full, base] 双哨兵——2026-08-14 Task 9.4.4② 上提，回流: I2；
   *  与 MCP update_hitl 双命名哨兵（原始 planName + 剥后缀推导名）对齐） */
  protected hitlMarkers(planName: string): string[] {
    const base = planName
      .replace(/-plan-v\d*$/, "")
      .replace(/-add-route-v\d*$/, "")
      .replace(/-review-v\d*$/, "")
      .replace(/-review-implementation$/, "")
      .replace(/-review-runtime$/, "")
    return [`.tongyi-${planName}`, `.tongyi-${base}`]
  }

  /** 无 Plan 分支语义（core: onNoPlanAllow return；codex 子类: 仅 stderr 提示后继续） */
  protected noPlanHint(): boolean {
    return false
  }

  /** §C 入口：其他工具 matcher（模板方法，默认委托扩展点） */
  runSectionC(input: string, toolName: string): number {
    return this.onOtherTool(input, toolName)
  }
}
