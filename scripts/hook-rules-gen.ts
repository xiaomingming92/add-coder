#!/usr/bin/env tsx
// hook-rules-gen.ts — Hook 规则控制面生成器（Task 1.2）
// 数据流: src/caijuehub/hook-*.toml ×5 → templates/core/governance/rules.ts（聚合产物）
// fail-safe: TOML 缺失/解析失败 → 内置默认常量 + 告警（不中断烘焙/sync）
// 漂移校验: tests/hook-rules.test.ts 断言产物与 TOML 一致（防手改产物）
// 用法: npx tsx scripts/hook-rules-gen.ts
// 接入: hook-bake.ts 烘焙前自动调用（Task 1.3）

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { parse } from "smol-toml"
import { projectRoot } from "../src/shared/paths.js"

const PROJECT_DIR = projectRoot() ?? process.cwd()
const CAIJUE_DIR = join(PROJECT_DIR, "src", "caijuehub")
const OUT_FILE = join(PROJECT_DIR, "templates", "core", "governance", "rules.ts")

/** 5 域规则真源清单（key = rules.ts 导出字段名） */
const SOURCES: Array<{ file: string; key: string }> = [
  { file: "hook-guard-rules.toml", key: "guard" },
  { file: "hook-doc-format-rules.toml", key: "doc" },
  { file: "hook-context-rules.toml", key: "context" },
  { file: "hook-event-rules.toml", key: "event" },
  { file: "hook-protocol-rules.toml", key: "protocol" },
]

const GENERATED_MARKER = "// ── GENERATED BEGIN（真源: src/caijuehub/hook-*.toml）──"
const GENERATED_END = "// ── GENERATED END ──"

/** fail-safe 默认常量（TOML 全缺失时兜底，值 = 生成时的 TOML 快照核心） */
const DEFAULT_RULES: Record<string, unknown> = {
  guard: {
    detectors: [
      {
        id: "script-interpreter",
        regex: '(^|;|\\|\\||&&|\\|)\\s*(python3?|node|ruby|perl|php)(\\s|$)',
        reason: "禁止通过脚本解释器直接修改文件。请使用 Write 或 SearchReplace 工具操作文件。",
        stderr: "⛔ [ADD PreToolUse §A] 阻断: 禁止通过脚本解释器直接修改文件。\n  → 请改用 Write 或 SearchReplace 工具操作文件。\n",
      },
      {
        id: "redirect",
        regex: '[>]{1,2}\\s+\\S',
        reason: "禁止通过重定向写入文件。请使用 Write 工具。",
        stderr: "⛔ [ADD PreToolUse §A] 阻断: 禁止通过重定向(>/>>)写入文件。\n  → 请改用 Write 工具。\n",
      },
    ],
    sensitive_files: { regex: "\\.env$|\\.env\\.production$|\\.env\\.local$|credentials|secrets", deny_reason: "敏感文件受保护" },
    thresholds: { large_file_bytes: 2000 },
    hitl_exemptions: { suffixes: ["-handoff", "-implementation", "-runtime"] },
    template_hints: [],
  },
  doc: { token_rules: [], content_rules: [], handoff: {}, incremental: { regex: "" }, anti_cheat: { max_file_count: 3 } },
  context: { quadrants: [], templates: { priority_order: [] } },
  event: { file: { rotate_bytes: 262144, total_bytes: 524288 }, schema: { fields: [] }, daily: { warn_threshold: 10 } },
  protocol: { exit_codes: { pass: 0, block: 2 }, output: {}, adapters: {} },
}

/** 读取并解析单个 TOML（失败返回 null，告警不中断） */
function readToml(file: string): unknown | null {
  const p = join(CAIJUE_DIR, file)
  if (!existsSync(p)) {
    console.error(`⚠️ hook-rules-gen: 真源缺失 ${file} → 使用 fail-safe 默认常量`)
    return null
  }
  try {
    return parse(readFileSync(p, "utf-8"))
  } catch (e) {
    console.error(`⚠️ hook-rules-gen: ${file} 解析失败（${(e as Error).message}）→ 使用 fail-safe 默认常量`)
    return null
  }
}

/** 提取产物中 USER CODE 区块（生成标记之后的手写代码） */
function readUserCode(): string {
  if (!existsSync(OUT_FILE)) return ""
  const content = readFileSync(OUT_FILE, "utf-8")
  const idx = content.indexOf(GENERATED_END)
  if (idx === -1) return ""
  return content.substring(idx + GENERATED_END.length).trim()
}

/** 聚合 5 域规则 → rules.ts 产物（含 _generated 标记 + USER CODE 保留） */
export function genHookRules(outFile: string = OUT_FILE): number {
  const body: string[] = []
  let ok = 0
  for (const s of SOURCES) {
    const parsed = readToml(s.file)
    if (parsed !== null) ok++
    // TOML 顶层域键（[guard.xxx] → { guard: {...} }）剥离一层：rules.guard.detectors 直接可达
    const domain = (parsed as Record<string, unknown> | null)?.[s.key]
    const data = domain ?? parsed ?? DEFAULT_RULES[s.key]
    body.push(
      `export const ${s.key} = ${JSON.stringify(data, null, 2)} as const;`
    )
  }
  const userCode = readUserCode()
  const content = [
    `// ═══════════════════════════════════════════════════════════════`,
    `// rules.ts — Hook 规则常量（_generated，勿手改本文件）`,
    `// 真源: src/caijuehub/hook-*.toml ×5（guard/doc/context/event/protocol）`,
    `// 生成器: scripts/hook-rules-gen.ts（hook-bake 烘焙前自动调用）`,
    `// 消费方式: hook 源码 import "./rules.js"（bundle 内联，产物零依赖）`,
    `// ═══════════════════════════════════════════════════════════════`,
    ``,
    GENERATED_MARKER,
    body.join("\n\n"),
    GENERATED_END,
    userCode ? `\n${userCode}\n` : "",
  ].join("\n")
  mkdirSync(dirname(outFile), { recursive: true })
  writeFileSync(outFile, content, "utf-8")
  console.log(`hook-rules-gen: ${ok}/${SOURCES.length} 真源 → ${outFile}`)
  return ok === SOURCES.length ? 0 : 1
}

if (process.argv[1] && (process.argv[1].endsWith("hook-rules-gen.ts") || process.argv[1].endsWith("hook-rules-gen.js"))) {
  process.exitCode = genHookRules()
}
