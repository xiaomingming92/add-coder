// lib/doc-format-guard.ts — doc-format-guard 守卫服务（治理逻辑层，Task 2.1 类化收敛）
// 规则真源: hook-doc-format-rules.toml（[doc.token_rules] / [doc.content_rules] /
//   [doc.handoff] / [doc.incremental] / [doc.anti_cheat]）
// 行为等价红线: 识别序（token → 内容探测 → 增量豁免 → 拒绝）与 bash 逐字一致
//
// 设计范式: OOP 守卫服务（模板识别 + schema 校验 + 算法规则聚合）+ 纯函数判定。

import { existsSync, mkdirSync, appendFileSync, readFileSync, readdirSync, unlinkSync } from "node:fs"
import { join, basename, dirname } from "node:path"
import { spawnSync } from "node:child_process"
import { detectActiveAdd, localIsoSeconds } from "./common.js"
import { writeHookEvent } from "./notify.js"
import { doc } from "./rules.js"

interface SchemaSection {
  id?: string
  heading?: string
  required?: boolean
  anchor?: string
  within?: string
  subsections?: Array<{ heading?: string }>
}

interface SchemaFile {
  sections: SchemaSection[]
  placeholders?: string[]
  forbidden_terms?: string[]
  groupColumn?: number | string
}

/** token 规则条目（rules.doc.token_rules 结构） */
interface TokenRule {
  template: string
  tokens: string[]
}

/** 内容探测条目（rules.doc.content_rules / adapter_content_rules 结构） */
interface ContentRule {
  adapter?: string
  marker: string
  template: string
  sub_markers?: Array<{ marker: string; template: string }>
}

/** 纯函数：提取内容（对齐 bash jq 的 if/elif 链） */
function extractContent(input: Record<string, unknown>): string {
  const ti = input.tool_input as Record<string, unknown> | undefined
  if (!ti) return ""
  if (typeof ti.file_content === "string") return ti.file_content
  if (typeof ti.content === "string") return ti.content
  if (typeof ti.new_string === "string") return ti.new_string
  const reps = ti.replacements as Array<{ new_text?: unknown }> | undefined
  if (reps && reps.length > 0 && typeof reps[0].new_text === "string") return reps[0].new_text
  return ""
}

/** 纯函数：模板名 token 匹配（数据驱动，特异性优先，对齐 bash case 链） */
function templateNameByToken(filePath: string): string {
  const base = basename(filePath).replace(/-v\d.*$/, "")
  for (const rule of (doc.token_rules as unknown as TokenRule[]) ?? []) {
    if (rule.tokens.every((t) => base.includes(t))) return rule.template
  }
  return ""
}

/** 纯函数：内容特征探测（数据驱动，命中即返回；无法识别返回 null）
 *  adapterName: 缺省 core 基线链；adapter 子类可通过构造参数加载 [doc.adapter_content_rules] 独立链 */
function templateNameByContent(content: string, filePath: string, adapterName: string): string | null {
  const rules = adapterName === "core"
    ? (doc.content_rules as unknown as ContentRule[]) ?? []
    : ((doc.adapter_content_rules as unknown as ContentRule[]) ?? []).filter((r) => r.adapter === adapterName)
  for (const rule of rules) {
    if (content.includes(rule.marker)) {
      for (const sub of rule.sub_markers ?? []) {
        if (content.includes(sub.marker)) return sub.template
      }
      return rule.template
    }
  }
  // handoff 内容识别（真源: [doc.handoff]）
  if (filePath.includes("handoff")) {
    const handoffRules = doc.handoff as { marker_multi: string; marker_single: string }
    if (content.includes(handoffRules.marker_multi)) return "handoff-multi-round-template.md"
    if (content.includes(handoffRules.marker_single)) return "handoff-single-round-template.md"
    return null
  }
  // 文件名 fallback（真源: [doc.fallback_rules]，顺序与 token 表不同——plan 优先）
  for (const rule of (doc.fallback_rules as unknown as TokenRule[]) ?? []) {
    if (rule.tokens.every((t) => filePath.includes(t))) return rule.template
  }
  return null
}

/** 增量修订识别（真源: [doc.incremental.regex]，对齐 bash：~~删除线~~ / → / [修订日期]） */
function isIncrementalEdit(content: string): boolean {
  const regex = (doc.incremental as { regex: string }).regex
  return new RegExp(regex).test(content)
}

/**
 * doc-format-guard 守卫服务（export: adapter 子类可继承 override 探测链）:
 *   - 模板识别（token → 内容特征 → 增量修订豁免）
 *   - schema 校验（章节/子章节/占位符/结构位禁词 + 锚定）
 *   - 算法化规则（精简版反作弊 / HITL 表非空 / handoff 冲突）
 *   - struct_score 精确语义（缺失规则数 / 适用规则数）
 */
export class DocFormatGuard {
  private readonly projectDir: string
  private readonly magicDir: string
  private readonly planKeyword: string
  private readonly planStatus: string
  /** adapter 名（缺省 core；adapter 子类传名加载独立内容探测链） */
  protected readonly adapterName: string
  private readonly issues: string[] = []

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

  /** 识别模板：token → 内容 → null（无法识别）；handoff 内容无法识别时由调用方阻断
   *  protected: adapter 子类可 override 探测链（如 claude 版 simple-standard-plan 分支） */
  protected identifyTemplate(filePath: string, content: string): { name: string } | { handoffUnrecognized: true } | null {
    let name = templateNameByToken(filePath)
    if (name === "") {
      const byContent = templateNameByContent(content, filePath, this.adapterName)
      if (byContent === null && filePath.includes("handoff")) {
        return { handoffUnrecognized: true }
      }
      if (byContent === null) {
        // 增量修订识别
        if (isIncrementalEdit(content)) {
          return null // 放行（增量修订跳过完整校验）
        }
        return null // 无法识别（调用方阻断）
      }
      name = byContent
    }
    return { name }
  }

  /** 读取 schema.json（含默认空结构） */
  private loadSchema(templateName: string): SchemaFile | null {
    const schemaFile = join(this.projectDir, this.magicDir, "templates", templateName.replace(/\.md$/, ".schema.json"))
    if (!existsSync(schemaFile)) return null
    try {
      return JSON.parse(readFileSync(schemaFile, "utf-8")) as SchemaFile
    } catch {
      return null
    }
  }

  /** 章节/锚定/占位符/禁词校验，返回 struct 统计 */
  private runSchemaChecks(schema: SchemaFile, templateName: string, content: string, isSearchReplace: boolean): { applied: number; missed: number; anchorHit: boolean } {
    const templatesDir = join(this.projectDir, this.magicDir, "templates")
    let applied = 0
    let missed = 0
    let anchorHit = true

    const headings = schema.sections.filter((s) => s.heading).map((s) => s.heading as string)
    const requiredHeadings = schema.sections.filter((s) => s.required === true && s.heading).map((s) => s.heading as string)
    const subs = schema.sections.flatMap((s) => s.subsections ?? []).filter((s) => s.heading).map((s) => s.heading as string)
    const placeholders = schema.placeholders ?? []
    const terms = schema.forbidden_terms ?? []

    if (!isSearchReplace) {
      // 锚定校验
      for (const section of schema.sections) {
        if (!section.anchor) continue
        applied++
        const templateContent = existsSync(join(templatesDir, templateName))
          ? readFileSync(join(templatesDir, templateName), "utf-8")
          : ""
        const refLine = templateContent.split("\n").find((l) => l.includes(section.anchor as string))
        if (!refLine) {
          process.stderr.write(`[doc-format-guard] anchor_miss: schema ${section.id} 声明的 anchor '${section.anchor}' 在 ${templateName} 中未定位，跳过该规则（冒烟巡检兑底）\n`)
          applied--
          continue
        }
        const tokens = [...new Set(refLine.replace(/[#*`|(){]/g, " ").split(/\s+/).filter((t) => t !== "" && !t.includes("{")))]
        if (tokens.length === 0) {
          applied--
          continue
        }
        let scope = content
        if (section.within) {
          if (content.includes(section.within)) {
            const startIdx = content.indexOf(section.within)
            const endIdx = content.indexOf("\n## ", startIdx + 1)
            scope = content.slice(startIdx, endIdx === -1 ? undefined : endIdx)
          } else {
            process.stderr.write(`[doc-format-guard] within_miss: schema ${section.id} 的 within '${section.within}' 在文档中未定位，跳过该规则\n`)
            applied--
            continue
          }
        }
        const missTokens = tokens.filter((tok) => !scope.includes(tok))
        if (missTokens.length > 0) {
          this.issues.push(`  缺锚点(${section.id}): ${missTokens.join(" ")}`)
          missed++
          anchorHit = false
        }
      }

      // 必选章节
      for (const heading of requiredHeadings) {
        applied++
        if (!content.includes(heading)) {
          this.issues.push(`  缺章节: ${heading}`)
          missed++
        }
      }
      // 子章节
      for (const sub of subs) {
        applied++
        if (!content.includes(sub)) {
          this.issues.push(`  缺子章节: ${sub}`)
          missed++
        }
      }
    }

    // 占位符
    for (const ph of placeholders) {
      if (content.includes(ph)) {
        this.issues.push(`  未替换占位符: ${ph}`)
        missed++
      }
    }

    // 结构位禁词（标题行 + groupColumn）
    let structText = (content.match(/^#{2,}\s.*$/gm) ?? []).join("\n")
    const col = typeof schema.groupColumn === "number" ? schema.groupColumn : Number(schema.groupColumn)
    if (!Number.isNaN(col) && col > 0) {
      const colLines = content
        .split("\n")
        .map((l) => {
          const cells = l.split("|")
          return cells.length > col ? (cells[col + 1] ?? "").trim() : ""
        })
        .filter(Boolean)
      structText += "\n" + colLines.join("\n")
    }
    for (const term of terms) {
      applied++
      if (structText.includes(term)) {
        this.issues.push(`  结构位禁词: ${term}`)
        missed++
      }
    }

    return { applied, missed, anchorHit }
  }

  /** 算法化规则校验（真源: [doc.anti_cheat] + HITL 表非空 + handoff 冲突）
   *  protected: adapter 子类可 override（如 claude 版无算法规则段） */
  protected runAlgoChecks(templateName: string, filePath: string, content: string): void {
    const antiCheat = doc.anti_cheat as {
      max_file_count: number
      fuzzy_file_regex: string
      fuzzy_decision_regex: string
      forbidden_heading: string
    }
    if (templateName.includes("simple-plan")) {
      const fileCount = (content.match(/^\|\s*`[^`]+`/gm) || []).length
      if (fileCount > antiCheat.max_file_count) {
        this.issues.push(`  ❌ 精简版反作弊: 涉及 ${fileCount} 个文件（超过 ${antiCheat.max_file_count} 个限制），应改用 standard-plan-template.md`)
      }
      if (new RegExp(antiCheat.fuzzy_file_regex).test(content)) {
        this.issues.push("  ❌ 精简版反作弊: HITL 表文件清单使用模糊描述（'等 N 个文件'），必须列出实际完整路径")
      }
      if (new RegExp(antiCheat.fuzzy_decision_regex).test(content)) {
        this.issues.push("  ❌ 精简版反作弊: HITL 表方案/设计决策使用模糊描述（'等若干决策'），必须逐条列出")
      }
      if (content.includes(antiCheat.forbidden_heading)) {
        this.issues.push("  ❌ 精简版反作弊: 包含 '## 三、架构设计' 章节，精简版不应有架构设计——应改用 standard-plan-template.md")
      }
    }

    if (/plan|review/.test(templateName)) {
      if (content.includes("## HITL")) {
        const hitlSection = content.slice(content.indexOf("## HITL"))
        const hitlRows = (hitlSection.match(/^\|\s*[^|{]*\s*\|/gm) || []).length
        const hitlData = hitlRows - 2
        if (hitlData < 1) {
          this.issues.push("  ⚠️  HITL 表为空——必须填写至少 1 行实际内容后再提交审核")
        }
      }
    }

    if (templateName.includes("simple-plan")) {
      const planBase = basename(filePath).replace(/-plan-v.*/, "")
      const planDir = dirname(filePath)
      const pattern = `${planBase}-handoff`
      const found = (() => {
        try {
          return readdirSync(planDir).some((f) => f.startsWith(pattern) && f.endsWith(".md"))
        } catch {
          return false
        }
      })()
      if (found) {
        this.issues.push(`  ❌ 精简版 Handoff 冲突: 检测到独立 handoff 文件（${pattern}*.md）。精简版 Plan 的 Handoff 已融合在 §四，不应生成独立文件。请删除独立 handoff 文件或改用 standard-plan-template.md`)
      }
    }
  }

  /** 主入口：返回 exit code（0 放行 / 2 阻断） */
  run(inputRaw: string): number {
    const input: Record<string, unknown> = (() => {
      try {
        return JSON.parse(inputRaw) as Record<string, unknown>
      } catch {
        return {}
      }
    })()

    // DEBUG dump（对齐 bash L24-38；非空输入且 tool_input 为 null 时 jq 报错泄漏到 stderr；
    // 空输入 jq 无输出不报错——2026-08-14 Task 5.1 修正: 原缺空输入判定，被 refresh-fixed 掩盖）
    const ti = input.tool_input as Record<string, unknown> | undefined
    if (inputRaw.trim() !== "" && !ti) {
      process.stderr.write("jq: error (at <stdin>:1): null (null) has no keys\n")
    }
    try {
      const debugDir = join(this.projectDir, this.magicDir, "debug-dump")
      mkdirSync(debugDir, { recursive: true })
      const log = [
        `=== ${localIsoSeconds()} ===`,
        `file_path: ${typeof ti?.file_path === "string" ? ti.file_path : "EMPTY"}`,
        `has_file_content: ${ti && typeof ti.file_content === "string"}`,
        `has_replacements: ${ti && Array.isArray(ti.replacements)}`,
      ]
      if (ti && typeof ti.file_content === "string") {
        log.push(`[file_content[500]]: ${ti.file_content.slice(0, 500)}`)
      }
      if (ti && Array.isArray(ti.replacements) && (ti.replacements[0] as { new_text?: string })?.new_text) {
        log.push(`[replacement_new_text[500]]: ${(ti.replacements[0] as { new_text: string }).new_text.slice(0, 500)}`)
      }
      log.push(`top_keys: ${Object.keys(input).join(", ")}`)
      log.push(`tool_input_keys: ${ti ? Object.keys(ti).join(", ") : "NO_TOOL_INPUT"}`)
      log.push("=== DONE ===")
      appendFileSync(join(debugDir, "stdin.log"), log.join("\n") + "\n")
    } catch {
      /* ignore */
    }

    const filePath = typeof ti?.file_path === "string" ? ti.file_path : ""
    if (filePath === "") return 0

    if (!new RegExp(`${this.magicDir}/(plans|specs)/`).test(filePath)) return 0

    const CONTENT = extractContent(input)
    if (CONTENT === "") {
      process.stderr.write("⛔ 拒绝：Write 工具未传 file_content，无法校验手写文档格式\n")
      process.stdout.write('{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"Write 工具未传 file_content，无法校验手写文档。请用 SearchReplace 改写已有文件，或用 Write 工具重试。"}}\n')
      writeHookEvent("doc-format-guard", "deny", "Write", "Write 工具未传 file_content", this.planKeyword, this.planStatus)
      return 2
    }

    const identified = this.identifyTemplate(filePath, CONTENT)
    let TEMPLATE_NAME = ""
    if (identified && "handoffUnrecognized" in identified) {
      process.stderr.write("⛔ handoff 文件内容无法识别模板类型（缺 '## 全局元信息' 或 '## 1. 交接前状态'），拒绝写入\n")
      process.stdout.write('{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"handoff 内容不符合 single/multi 模板规范"}}\n')
      writeHookEvent("doc-format-guard", "deny", filePath, "handoff 模板类型无法识别", this.planKeyword, this.planStatus)
      return 2
    }
    if (identified && "name" in identified) {
      TEMPLATE_NAME = identified.name
    } else {
      // 增量修订豁免
      if (isIncrementalEdit(CONTENT)) {
        process.stderr.write("[doc-format-guard] 检测到增量修订格式，跳过完整章节校验\n")
        return 0
      }
      process.stderr.write(`⛔ 拒绝：无法识别文档类型 (file_path: ${filePath})，缺少模板匹配规则\n`)
      process.stdout.write('{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"无法识别 ADD 文档类型，请联系管理员更新 doc-format-guard"}}\n')
      writeHookEvent("doc-format-guard", "deny", filePath, "无法识别文档类型", this.planKeyword, this.planStatus)
      return 2
    }

    const schema = this.loadSchema(TEMPLATE_NAME)
    if (!schema) {
      process.stderr.write(`⛔ 阻断：模板 ${TEMPLATE_NAME} 缺少对应的 .schema.json 校验规则\n`)
      process.stdout.write('{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"缺少 .schema.json 校验规则文件，禁止无规则放行"}}\n')
      writeHookEvent("doc-format-guard", "deny", filePath, "缺少 .schema.json 校验规则", this.planKeyword, this.planStatus)
      return 2
    }

    // SearchReplace 只传 patch → 跳过章节校验
    const isSearchReplace = ti && Array.isArray(ti.replacements) && ti.replacements.length > 0
      ? true
      : (ti && typeof ti.new_string === "string")

    const { applied, missed, anchorHit } = this.runSchemaChecks(schema, TEMPLATE_NAME, CONTENT, Boolean(isSearchReplace))
    this.runAlgoChecks(TEMPLATE_NAME, filePath, CONTENT)

    const termTotal = (schema.forbidden_terms ?? []).length
    const finalApplied = isSearchReplace ? termTotal : applied
    const finalMissed = this.issues.length
    let structScore = 100
    if (finalApplied > 0 && finalMissed > 0) {
      structScore = Math.max(0, Math.floor(((finalApplied - finalMissed) * 100) / finalApplied))
    }
    const BACKFLOW_EXTRA = `"anchor_hit":${anchorHit},"struct_score":${structScore}`

    if (this.issues.length > 0) {
      process.stderr.write(`⛔ ${TEMPLATE_NAME} 校验不通过:\n${this.issues.join("\n")}\n`)
      const brief = this.issues.join(" ").replace(/"/g, "").replace(/\s+/g, " ").slice(0, 180)
      process.stdout.write(`{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"文档格式校验不通过: ${brief}"}}\n`)
      writeHookEvent("doc-format-guard", "deny", filePath, "文档格式校验不通过", this.planKeyword, this.planStatus, BACKFLOW_EXTRA)
      return 2
    }

    // ── 自动更新 index.md ──
    if (new RegExp(`${this.magicDir}/plans/`).test(filePath)) {
      const genIndex = join(this.projectDir, "scripts", "gen-plan-index.sh")
      if (existsSync(genIndex)) {
        try {
          spawnSync("bash", [genIndex], { stdio: "ignore" })
        } catch {
          /* ignore */
        }
      }
    }

    // 放行回流
    writeHookEvent("doc-format-guard", "allow", filePath, "校验通过", this.planKeyword, this.planStatus, BACKFLOW_EXTRA)
    return 0
  }
}
