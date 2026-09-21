/*
 * AGENTS.md 入口文件分发回归（Plan `add-coder-agents-template-and-step3-execution-modes-plan-v1`）
 *
 * 覆盖三类防退化断言：
 * ① 真源存在且占位符化（不写死任何 magicDir）
 * ② 机制声明化：`[replace_specials]` → 生成物 SPECIALS（token → 来源 id）完整；CONFIGS 里每条 AGENTS 条目都带 replacements
 *    （TOML 语义坑：`[configs.replacements]` 挂在**最近一个** [[configs]] 上，漏一条就会运行期报"占位符残留"）
 * ③ 六端渲染结果：零占位符残留、每端只引用自己的 magicDir
 */
import { describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

const REPO_ROOT = join(import.meta.dirname, "..")
const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), "utf-8")
const MAGIC_DIRS = [".add", ".claude", ".codex", ".qoder", ".trae", ".vscode"] as const

describe("① AGENTS.md 真源", () => {
  it("真源存在、占位符化、且不写死任何 magicDir", () => {
    const src = read("templates/core/AGENTS.md")
    expect(src).toContain("{{magicDir}}")
    expect(src).toContain("{{projectName}}")
    for (const d of MAGIC_DIRS) expect(src).not.toContain(`${d}/`)
  })
  it("真源含 Step 3 执行风格（stepwise / delegated + 停止条件）", () => {
    const src = read("templates/core/AGENTS.md")
    expect(src).toMatch(/stepwise/)
    expect(src).toMatch(/delegated/)
    expect(src).toMatch(/check_spec_sync/)
    expect(src).toMatch(/check_rahs/)
  })
})

describe("② 机制声明化（规则 → 生成物 → 脚本解析）", () => {
  it("生成物 SPECIALS 含四个声明式 token 与其来源 id", () => {
    const strategy = read("src/caijuehub/strategies/sync-magic.strategy.ts")
    expect(strategy).toMatch(/ENTRY_MAGIC_DIR:\s*"entry\.magic_dir"/)
    expect(strategy).toMatch(/PROJECT_DIR:\s*"project\.dir"/)
    expect(strategy).toMatch(/PROJECT_NAME:\s*"project\.name"/)
    expect(strategy).toMatch(/MCP_SERVER_COMMAND:\s*"add-coder\.mcpServerCommand"/)
  })
  it("每条 AGENTS config 条目自带 replacements（magicDir → $ENTRY_MAGIC_DIR）", () => {
    const strategy = read("src/caijuehub/strategies/sync-magic.strategy.ts")
    const agentsEntries = strategy.split("\n").filter((l) => l.includes('dest: ".') && l.includes("/AGENTS.md"))
    expect(agentsEntries).toHaveLength(MAGIC_DIRS.length)
    for (const line of agentsEntries) {
      expect(line).toMatch(/placeholderPolicy: "replace"/)
      expect(line).toMatch(/magicDir: "\$ENTRY_MAGIC_DIR"/)
    }
  })
  it("脚本不再内置特殊值特例（改为按 SPECIALS 声明解析）", () => {
    const script = read("scripts/sync-magic.ts")
    expect(script).toMatch(/SYNC_MAGIC_CONFIG as unknown as \{ SPECIALS\?: Record<string, string> \}/)
    expect(script).not.toMatch(/\$MAGIC_DIR:\s*magicDir/)   // 旧的内置特例已移除
  })
})

describe("③ 六端渲染结果", () => {
  for (const d of MAGIC_DIRS) {
    it(`${d}/AGENTS.md 存在、零占位符残留、只引用本端路径`, () => {
      const p = join(REPO_ROOT, d, "AGENTS.md")
      expect(existsSync(p), `${p} 缺失（先跑 pnpm sync）`).toBe(true)
      const text = readFileSync(p, "utf-8")
      expect(text).not.toMatch(/\{\{/)
      expect(text).toContain(`${d}/`)
      for (const other of MAGIC_DIRS) {
        if (other === d) continue
        expect(text, `${d}/AGENTS.md 不应引用 ${other}/`).not.toContain(`${other}/`)
      }
    })
  }
})
