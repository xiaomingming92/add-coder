/*
 * 轮 1 契约测试：schema 驱动校验器（Spec §1 §SchemaSource）
 *
 * 关键：**不得硬编码章节名** —— 用一个"改名 schema"验证实现跟随 schema 而非内置常量。
 */
import { describe, expect, it } from "vitest"
import {
  countRounds,
  inferRoundHeading,
  normalizeWidth,
  stripFencedBlocks,
  validateAgainstSchema,
  type SchemaFile,
} from "../../templates/core/validation/schema-validator.js"

const schema: SchemaFile = {
  template: "demo-template.md",
  sections: [
    { id: "a", heading: "## 甲章", required: true },
    { id: "b", heading: "## 乙章", required: false },
    {
      id: "round",
      heading: "## <第N轮>",
      required: true,
      subsections: [{ heading: "### 你当前的位置" }, { heading: "### 验证标准" }],
    },
  ],
  placeholders: ["{项目名}"],
  forbidden_terms: ["阶段"],
}

describe("章节与子章节判定", () => {
  it("required 章节缺失 → MISSING_SECTION", () => {
    const issues = validateAgainstSchema("## 乙章\n内容", schema)
    expect(issues.some((i) => i.code === "MISSING_SECTION" && i.detail.includes("甲章"))).toBe(true)
  })

  it("非 required 章节缺失不报错", () => {
    const doc = "## 甲章\n" + "## 第1轮\n### 你当前的位置\n### 验证标准\n"
    const issues = validateAgainstSchema(doc, schema)
    expect(issues.some((i) => i.detail.includes("乙章"))).toBe(false)
  })

  it("子章节缺失 → MISSING_SUBSECTION", () => {
    const doc = "## 甲章\n## 第1轮\n### 你当前的位置\n"
    const issues = validateAgainstSchema(doc, schema)
    expect(issues.some((i) => i.code === "MISSING_SUBSECTION" && i.detail.includes("验证标准"))).toBe(true)
  })
})

describe("多轮轮次计数", () => {
  it("inferRoundHeading 从 schema 推断（不硬编码）", () => {
    expect(inferRoundHeading(schema)).toBe("## <第N轮>")
  })

  it("countRounds 按通配片段计数", () => {
    const doc = "## 第1轮\nx\n## 第2轮\ny\n## 附录\n"
    expect(countRounds(doc, "## <第N轮>")).toBe(2)
  })

  it("countRounds 计带描述的轮次标题（模板示范写法 `## <第N轮> {描述}`）", () => {
    const doc = "## 第 1 轮 抽层（core/validation）\n## 第 2 轮 专司 validators\n## 每轮收敛判定补充规则\n"
    expect(countRounds(doc, "## <第N轮>")).toBe(2)
  })

  it("countRounds 不把无编号的轮次类标题误计（`## 轮次依赖` / `## 附录`）", () => {
    expect(countRounds("## 轮次依赖\n## 轮次拓扑\n## 附录：每轮启动模板\n", "## <第N轮>")).toBe(0)
  })

  it("轮次不足 → ROUND_COUNT_SHORT（期望 4 实际 1）", () => {
    const doc = "## 甲章\n## 第1轮\n### 你当前的位置\n### 验证标准\n"
    const issues = validateAgainstSchema(doc, schema, { expectRounds: 4 })
    expect(issues.some((i) => i.code === "ROUND_COUNT_SHORT")).toBe(true)
  })

  it("轮次足够 → 不报 ROUND_COUNT_SHORT", () => {
    const one = "## 第N轮\n### 你当前的位置\n### 验证标准\n"
    const doc = "## 甲章\n" + [1, 2, 3, 4].map((n) => one.replace("第N轮", `第${n}轮`)).join("")
    const issues = validateAgainstSchema(doc, schema, { expectRounds: 4 })
    expect(issues.some((i) => i.code === "ROUND_COUNT_SHORT")).toBe(false)
  })
})

describe("占位符与禁词", () => {
  it("schema 声明的占位符残留 → PLACEHOLDER_LEFT", () => {
    const doc = "## 甲章\n## 第1轮\n### 你当前的位置\n### 验证标准\n{项目名}\n"
    const issues = validateAgainstSchema(doc, schema)
    expect(issues.some((i) => i.code === "PLACEHOLDER_LEFT" && i.detail.includes("{项目名}"))).toBe(true)
  })

  it("禁词只查结构位：正文叙述出现禁词不报错", () => {
    const doc = "## 甲章\n## 第1轮\n### 你当前的位置\n### 验证标准\n本阶段完成\n"
    expect(validateAgainstSchema(doc, schema).some((i) => i.code === "FORBIDDEN_TERM")).toBe(false)
  })

  it("标题行命中禁词 → FORBIDDEN_TERM", () => {
    const doc = "## 甲章\n## 第1轮\n### 你当前的位置\n### 验证标准\n## 阶段二说明\n"
    expect(validateAgainstSchema(doc, schema).some((i) => i.code === "FORBIDDEN_TERM")).toBe(true)
  })

  it("structText 含标题行（不含正文）", () => {
    const t = stripFencedBlocks("## 甲章\n正文里的阶段\n")
    expect(t).toContain("## 甲章")
  })

  it("stripFencedBlocks 去除代码块但保留其余内容", () => {
    expect(stripFencedBlocks("a\n```\n阶段\n```\nb")).toContain("a")
    expect(stripFencedBlocks("a\n```\n阶段\n```\nb")).not.toContain("阶段")
  })
})

describe("真源性：实现跟随 schema 而非硬编码", () => {
  it("把 schema 章节改名后，判定随新名走（出现新名即通过）", () => {
    const renamed: SchemaFile = {
      template: "x.md",
      sections: [{ id: "a", heading: "## 全新的章节名", required: true }],
    }
    expect(validateAgainstSchema("## 全新的章节名", renamed)).toEqual([])
    expect(validateAgainstSchema("## 甲章", renamed).length).toBeGreaterThan(0)
  })
})

/*
 * 半角/全角等价（2026-09-14）——触发源：4 份 tasks.md 因 `## 轮次 1:` / `## 轮次 1：`
 * 被判 MISSING_SECTION。判定必须对两侧同时归一，任一侧写全角都成立。
 */
describe("半角/全角等价（宽度归一）", () => {
  it("normalizeWidth 折叠全角 ASCII 与表意空格", () => {
    expect(normalizeWidth("## 轮次 1：抽层")).toBe("## 轮次 1:抽层")
    expect(normalizeWidth("（证据）")).toBe("(证据)")
    expect(normalizeWidth("ＡＢ１２")).toBe("AB12")
    expect(normalizeWidth("a\u3000b")).toBe("a b")
    expect(normalizeWidth("中文中文")).toBe("中文中文") // 非全角区不受影响
  })

  it("schema 半角冒号 ↔ 文档全角冒号：不报缺章节", () => {
    const s: SchemaFile = {
      template: "x.md",
      sections: [{ id: "rounds", heading: "## 轮次 1:", required: true }],
    }
    expect(validateAgainstSchema("## 轮次 1：抽层（schema 驱动）\n正文", s)).toEqual([])
  })

  it("schema 全角冒号 ↔ 文档半角冒号：同样不报缺章节", () => {
    const s: SchemaFile = {
      template: "x.md",
      sections: [{ id: "a", heading: "## 甲章：", required: true }],
    }
    expect(validateAgainstSchema("## 甲章: 内容", s)).toEqual([])
  })

  it("子章节全角括号 ↔ schema 半角括号：不报缺子章节", () => {
    const s: SchemaFile = {
      template: "x.md",
      sections: [{ id: "a", heading: "## 甲章", subsections: [{ heading: "审计链(证据→devlog→checklist)" }] }],
    }
    const doc = "## 甲章\n审计链（证据→devlog→checklist）\n"
    expect(validateAgainstSchema(doc, s).some((i) => i.code === "MISSING_SUBSECTION")).toBe(false)
  })

  it("countRounds 对全角/半角轮次标题同等计数", () => {
    const doc = "## 乙章\n## 第1轮:\n## 第2轮：\n"
    expect(countRounds(doc, "## <第N轮>：")).toBe(2)
  })

  it("占位符判定同样宽度无关（全角写完仍算残留）", () => {
    const s: SchemaFile = { template: "x.md", sections: [], placeholders: ["(待填写)"] }
    const issues = validateAgainstSchema("证据：（待填写）\n", s)
    expect(issues.some((i) => i.code === "PLACEHOLDER_LEFT")).toBe(true)
  })

  it("锚定 token 匹配宽度无关", () => {
    const s: SchemaFile = {
      template: "x.md",
      sections: [{ id: "t", heading: "## 甲章", anchor: "plan_track" }],
    }
    // 模板行里的 token 是「落库：调用」——文档写成半角冒号也必须命中（否则会被判 ANCHOR_MISS）
    const template = "落库：调用 plan_track 记录\n"
    const ok = validateAgainstSchema("## 甲章\n落库:调用 plan_track 记录\n", s, {
      templateContent: template,
    })
    expect(ok.some((i) => i.code === "ANCHOR_MISS")).toBe(false)
    // 反向：真正缺 token 时仍要报（归一化没有把锚定规则变成永真）
    const bad = validateAgainstSchema("## 甲章\n落库:调用 其它内容\n", s, { templateContent: template })
    expect(bad.some((i) => i.code === "ANCHOR_MISS")).toBe(true)
  })
})
