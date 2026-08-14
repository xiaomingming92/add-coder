// hook-rules.test.ts — Hook 规则控制面漂移校验（Task 1.2.2）
// 断言:
//   ① 产物漂移校验: 生成器重跑输出 == 现产物（防手改 rules.ts）
//   ② 产物结构: _generated 标记 + 5 域导出齐全
//   ③ 正则可编译性: TOML 声明的全部 regex 在 JS 中可编译（防 TOML 写坏正则）
//   ④ 硬编码残留负向断言: hook 源码关键规则指纹计数 ≤ 白名单上限
//      （白名单 = 迁移前现状；随 Task 2.x/3-7.x 推进逐步收紧至 0）

import { describe, expect, it } from "vitest"
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { parse } from "smol-toml"
import { projectRoot } from "../src/shared/paths.js"
import { genHookRules } from "../scripts/hook-rules-gen.js"

const PROJECT_DIR = projectRoot() ?? process.cwd()
const CAIJUE_DIR = join(PROJECT_DIR, "src", "caijuehub")
const RULES_FILE = join(PROJECT_DIR, "templates", "core", "governance", "rules.ts")
const HOOKS_DIR = join(PROJECT_DIR, "templates", "core", "hooks")

/** 读取 TOML 真源 */
function readToml(file: string): unknown {
  const p = join(CAIJUE_DIR, file)
  if (!existsSync(p)) throw new Error(`真源缺失: ${p}`)
  return parse(readFileSync(p, "utf-8"))
}

/** 产物 GENERATED 区块内提取的 5 个导出文本 */
function generatedBlock(): string {
  const content = readFileSync(RULES_FILE, "utf-8")
  const start = content.indexOf("// ── GENERATED BEGIN")
  const end = content.indexOf("// ── GENERATED END")
  if (start === -1 || end === -1) throw new Error("rules.ts 缺 GENERATED 标记")
  return content.substring(start, end)
}

describe("hook-rules 漂移校验", () => {
  it("生成器重跑输出 == 现产物（防手改）", () => {
    const tmp = mkdtempSync(join(tmpdir(), "hook-rules-"))
    const tmpOut = join(tmp, "rules.ts")
    try {
      genHookRules(tmpOut)
      const expected = readFileSync(tmpOut, "utf-8")
      const actual = readFileSync(RULES_FILE, "utf-8")
      expect(actual).toBe(expected)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it("产物含 5 域导出（guard/doc/context/event/protocol）", () => {
    const block = generatedBlock()
    for (const key of ["guard", "doc", "context", "event", "protocol"]) {
      expect(block).toContain(`export const ${key} =`)
    }
  })

  it("TOML 声明的全部 regex 在 JS 中可编译", () => {
    const guardToml = readToml("hook-guard-rules.toml") as {
      guard?: { detectors?: Array<{ id: string; regex: string }>; sensitive_files?: { regex: string } }
    }
    const docToml = readToml("hook-doc-format-rules.toml") as {
      doc?: { incremental?: { regex: string }; anti_cheat?: { fuzzy_file_regex: string; fuzzy_decision_regex: string } }
    }
    const regexes: string[] = [
      ...(guardToml.guard?.detectors ?? []).map((d) => d.regex),
      guardToml.guard?.sensitive_files?.regex ?? "",
      docToml.doc?.incremental?.regex ?? "",
      docToml.doc?.anti_cheat?.fuzzy_file_regex ?? "",
      docToml.doc?.anti_cheat?.fuzzy_decision_regex ?? "",
    ]
    for (const r of regexes.filter(Boolean)) {
      expect(() => new RegExp(r), `正则不可编译: ${r}`).not.toThrow()
    }
  })

  it("正则语义冒烟: 关键检测器命中样本", () => {
    const guardToml = readToml("hook-guard-rules.toml") as {
      guard?: { detectors?: Array<{ id: string; regex: string }> }
    }
    const detectors = new Map((guardToml.guard?.detectors ?? []).map((d) => [d.id, d.regex]))
    // 脚本解释器: 命令分隔符后的 node/python
    expect(new RegExp(detectors.get("script-interpreter")!).test("node /tmp/x.js")).toBe(true)
    expect(new RegExp(detectors.get("script-interpreter")!).test("cat package.json")).toBe(false)
    // sed -i 精确判定: 不误伤 sed 只读
    expect(new RegExp(detectors.get("sed-in-place")!).test("sed -i 's/a/b/' f.txt")).toBe(true)
    expect(new RegExp(detectors.get("sed-in-place")!).test("sed -n '5p' f.txt")).toBe(false)
    // 重定向
    expect(new RegExp(detectors.get("redirect")!).test("echo x > f.txt")).toBe(true)
    // tee/dd
    expect(new RegExp(detectors.get("tee-dd")!).test("cmd | tee out")).toBe(true)
    // cp/mv/touch: 命令起始或分隔符后
    expect(new RegExp(detectors.get("cp-mv-touch")!).test("cp a b")).toBe(true)
    expect(new RegExp(detectors.get("cp-mv-touch")!).test("echo cp")).toBe(false)
  })

  it("硬编码残留负向断言: 指纹计数 ≤ 白名单上限（Task 2.1 完成，core 已归零）", () => {
    // 指纹 → [文件, 白名单上限, 说明]
    // Task 2.1 已完成 core 消费 rules：全部指纹归零（白名单收紧至 0）
    const fingerprints: Array<[string, string, number, string]> = [
      // [正则指纹, 相对 hooks 路径, 上限, 迁移归属]
      ["262144", "lib/notify.ts", 0, "event.rotate_bytes（已迁 → rules.js 消费）"],
      ["524288", "lib/notify.ts", 0, "event.total_bytes（已迁）"],
      ["\\.env\\$\\.\\.env\\.production|credentials", "pre-tool-use.ts", 0, "guard.sensitive_files（已迁 lib/pre-tool-guard.ts）"],
      ["large_file_bytes|2000", "pre-tool-use.ts", 0, "guard.thresholds（已迁）"],
      ["## PLAN 元信息", "doc-format-guard.ts", 0, "doc.content_rules（已迁 lib/doc-format-guard.ts）"],
      ["has_add_dev_closed", "lib/context-inject.ts", 0, "context.quadrants（已迁 → rules.js 消费）"],
    ]
    for (const [re, rel, limit, owner] of fingerprints) {
      const p = join(HOOKS_DIR, rel)
      if (!existsSync(p)) continue // 文件已在早期轮次删除 → 残留 0（通过）
      const count = (readFileSync(p, "utf-8").match(new RegExp(re, "g")) ?? []).length
      expect(
        count,
        `${rel} 中指纹 '${re}' 出现 ${count} 次，超过白名单上限 ${limit}（归属: ${owner}）。禁止新增硬编码。`
      ).toBeLessThanOrEqual(limit)
    }
  })
})
