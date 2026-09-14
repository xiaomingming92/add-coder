/*
 * schema 驱动校验器（Plan core-validation-lifecycle Task 1.1 / Spec §1 §SchemaSource）
 *
 * **唯一真源**：全部形式判定读 `templates/core/templates/*.schema.json`。
 * 本文件内**不得出现任何硬编码章节名**——章节、子章节、允许占位符、禁词全部来自 schema。
 *
 * 校验项：
 *  - required section 缺失 → MISSING_SECTION
 *  - section 的 subsections 缺失 → MISSING_SUBSECTION
 *  - 多轮文档轮次不足 → ROUND_COUNT_SHORT（由调用方给 expectRounds）
 *  - schema.placeholders 中仍残留的占位符 → PLACEHOLDER_LEFT
 *  - schema.forbidden_terms 命中（**围栏代码块外**）→ FORBIDDEN_TERM
 */

export interface SchemaSection {
  id: string
  heading?: string
  required?: boolean
  subsections?: { heading: string }[]
  /** 语义锚定：在模板对应行中提取 token，要求这些 token 出现在文档（可配合 within 限定范围） */
  anchor?: string
  within?: string
}

export interface SchemaFile {
  template: string
  sections: SchemaSection[]
  placeholders?: string[]
  forbidden_terms?: string[]
  /** 结构位列号（1-based，含首列分隔符偏移，与既有守卫语义一致） */
  groupColumn?: number | string
}

/** schema 层（形式）检查码 */
export type SchemaIssueCode =
  | "MISSING_SECTION"
  | "MISSING_SUBSECTION"
  | "ROUND_COUNT_SHORT"
  | "PLACEHOLDER_LEFT"
  | "FORBIDDEN_TERM"

/**
 * 问题码：schema 层用固定枚举；类型特有规则（validators/*）可声明自己的码
 * （如 `AUDIT_QUERY_MISSING`、`UNVERIFIED_T_LEFT`），故开放为字符串联合。
 */
export type IssueCode = SchemaIssueCode | (string & {})

export interface ValidationIssue {
  code: IssueCode
  detail: string
  expected?: string
}

export interface ValidateOptions {
  /** 多轮文档的期望轮次数（来自 Plan/执行记录，不由本模块猜） */
  expectRounds?: number
  /** 轮次标题的模板串（默认取 schema 中 heading 含 `<第N轮>` 的 section） */
  roundHeading?: string
  /** 模板内容（anchor 校验需要：token 从模板对应行提取） */
  templateContent?: string
}

/** 统计子串出现次数 */
function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0
  let count = 0
  let idx = haystack.indexOf(needle)
  while (idx !== -1) {
    count++
    idx = haystack.indexOf(needle, idx + needle.length)
  }
  return count
}

/** 去掉围栏代码块（禁词判定不该命中示例代码与引用块） */
export function stripFencedBlocks(content: string): string {
  return content.replace(/```[\s\S]*?```/g, "\n")
}

/**
 * 结构位文本：**标题行 + groupColumn 列**（与既有 doc-format-guard 语义一致）。
 * 禁词只在该范围内判定——正文正常叙述里出现"阶段"不构成违规。
 */
export function structText(content: string, groupColumn?: number | string): string {
  let text = (content.match(/^#{2,}\s.*$/gm) ?? []).join("\n")
  const col = typeof groupColumn === "number" ? groupColumn : Number(groupColumn)
  if (Number.isFinite(col) && col > 0) {
    const cells = content
      .split("\n")
      .map((line) => {
        const cells = line.split("|")
        return cells.length > col ? (cells[col + 1] ?? "").trim() : ""
      })
      .filter(Boolean)
    text += "\n" + cells.join("\n")
  }
  return text
}

/**
 * 语义锚定校验（0.3.27 能力，上移至此以免抽层时丢失）：
 * 从模板中含 anchor 的行提取 token，要求它们出现在文档（`within` 存在时限定该节范围）。
 * 模板行或 within 无法定位时**跳过该规则**（与既有守卫一致，不误判）。
 */
export function validateAnchors(
  content: string,
  schema: SchemaFile,
  templateContent: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  for (const section of schema.sections) {
    if (!section.anchor) continue
    const refLine = templateContent.split("\n").find((l) => l.includes(section.anchor as string))
    if (!refLine) continue
    const tokens = [
      ...new Set(
        refLine
          .replace(/[#*`|(){]/g, " ")
          .split(/\s+/)
          .filter((t) => t !== "" && !t.includes("{")),
      ),
    ]
    if (tokens.length === 0) continue
    let scope = content
    if (section.within) {
      const startIdx = content.indexOf(section.within)
      if (startIdx < 0) continue
      const endIdx = content.indexOf("\n## ", startIdx + 1)
      scope = content.slice(startIdx, endIdx === -1 ? undefined : endIdx)
    }
    const missTokens = tokens.filter((tok) => !scope.includes(tok))
    if (missTokens.length > 0) {
      issues.push({
        code: "ANCHOR_MISS",
        detail: `缺锚点(${section.id}): ${missTokens.join(" ")}`,
        expected: section.anchor,
      })
    }
  }
  return issues
}

/** 从 schema 推断轮次标题模板（`## <第N轮>` 这类） */
export function inferRoundHeading(schema: SchemaFile): string | null {
  const round = schema.sections.find((s) => s.heading?.includes("<第N轮>"))
  return round?.heading ?? null
}

/** 轮次标题在文档中的实际出现次数（把 `<第N轮>` 视为通配片段） */
export function countRounds(content: string, roundHeading: string): number {
  if (!roundHeading.includes("<第N轮>")) return 0
  // 通配片段替换为「本行以轮结尾」，避免 `## 附录` 之类被误计
  const pattern = roundHeading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace("<第N轮>", "[^\\n]*轮")
  const re = new RegExp(`^${pattern}\\s*$`, "gm")
  return (content.match(re) ?? []).length
}

export function validateAgainstSchema(
  content: string,
  schema: SchemaFile,
  opts: ValidateOptions = {},
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const proseOnly = stripFencedBlocks(content)

  // 1) 章节与子章节
  const roundHeading = opts.roundHeading ?? inferRoundHeading(schema)
  for (const section of schema.sections) {
    if (!section.heading) continue
    const isRoundSection = roundHeading !== null && section.heading === roundHeading
    if (isRoundSection) {
      // 轮次章节始终走轮次计数（默认至少 1 轮），不与字面 `<第N轮>` 比对
      const need = opts.expectRounds ?? 1
      const found = countRounds(content, roundHeading as string)
      if (found < need) {
        issues.push({
          code: "ROUND_COUNT_SHORT",
          detail: `轮次章节不足：期望 ${need} 轮，实际 ${found} 轮`,
          expected: roundHeading,
        })
      }
      // 轮次子章节（每轮一套）必须逐项检查——这是多轮文档的核心规格，不能被 continue 跳过
      for (const sub of section.subsections ?? []) {
        if (countOccurrences(content, sub.heading) < need) {
          issues.push({
            code: "MISSING_SUBSECTION",
            detail: `轮次子章节缺失或不足（需要 ${need} 份）：${sub.heading}`,
            expected: sub.heading,
          })
        }
      }
      continue
    }
    if (section.required && countOccurrences(content, section.heading) === 0) {
      issues.push({ code: "MISSING_SECTION", detail: `缺少必需章节：${section.heading}`, expected: section.heading })
    }
    for (const sub of section.subsections ?? []) {
      const need = isRoundSection ? (opts.expectRounds ?? 1) : 1
      if (countOccurrences(content, sub.heading) < need) {
        issues.push({
          code: "MISSING_SUBSECTION",
          detail: `子章节缺失或不足（需要 ${need} 份）：${sub.heading}`,
          expected: sub.heading,
        })
      }
    }
  }

  // 2) 占位符残留（只查 schema 声明的那些）
  for (const ph of schema.placeholders ?? []) {
    if (ph && content.includes(ph)) {
      issues.push({ code: "PLACEHOLDER_LEFT", detail: `占位符未替换：${ph}`, expected: ph })
    }
  }

  // 3) 结构位禁词（**标题行 + groupColumn 列**；正文叙述不判）
  const struct = structText(content, schema.groupColumn)
  for (const term of schema.forbidden_terms ?? []) {
    if (term && struct.includes(term)) {
      issues.push({ code: "FORBIDDEN_TERM", detail: `结构位禁词：${term}（仅标题行与指定列判定）`, expected: term })
    }
  }

  // 4) 语义锚定（需要模板内容；缺模板则跳过，不误判）
  if (opts.templateContent) {
    issues.push(...validateAnchors(content, schema, opts.templateContent))
  }

  return issues
}
