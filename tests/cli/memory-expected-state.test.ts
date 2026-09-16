/*
 * 期望态应用（库层）用例 — Plan Task 1.3 / Spec §2
 *
 * 为什么要单测库层而不是命令层：命令层（init / CLI）只编排，规则在库层；
 * 通过注入 `run` 即可覆盖成功/失败/缺文件三条路径，不触碰真库、不起 prisma 进程。
 */
import { describe, expect, it } from "vitest"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  applyMemoryExpectedState,
  expectedStateSqlRelPath,
} from "../../src/lib/memory-expected-state.js"

function makeProject(withSql: boolean): string {
  const root = mkdtempSync(join(tmpdir(), "add-coder-expected-state-"))
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "probe" }), "utf-8")
  if (withSql) {
    const rel = expectedStateSqlRelPath(".codex")
    mkdirSync(join(root, rel, ".."), { recursive: true })
    writeFileSync(join(root, rel), "CREATE VIRTUAL TABLE IF NOT EXISTS add_memory_fts USING fts5(x);\n", "utf-8")
  }
  return root
}

describe("applyMemoryExpectedState（库层）", () => {
  it("非 sqlite 引擎：不适用、不动作、ok=true（PG 路径零改动）", () => {
    const root = makeProject(true)
    try {
      let called = 0
      const r = applyMemoryExpectedState({ projectRoot: root, magicDir: ".codex", engine: "postgresql", run: () => { called++; return { status: 0 } } })
      expect(r).toMatchObject({ applicable: false, ok: true })
      expect(called).toBe(0)
    } finally { rmSync(root, { recursive: true, force: true }) }
  })

  it("sqlite 且 SQL 缺失：ok=false + 明确提示（不抛异常）", () => {
    const root = makeProject(false)
    try {
      const r = applyMemoryExpectedState({ projectRoot: root, magicDir: ".codex", engine: "sqlite" })
      expect(r.applicable).toBe(true)
      expect(r.ok).toBe(false)
      expect(r.detail).toContain("期望态 SQL 未找到")
      expect(r.manualCmd).toContain("prisma db execute --file")
    } finally { rmSync(root, { recursive: true, force: true }) }
  })

  it("sqlite 且 SQL 存在 + 执行成功：ok=true，argv 走 db execute --file", () => {
    const root = makeProject(true)
    try {
      let argv: string[] = []
      const r = applyMemoryExpectedState({
        projectRoot: root, magicDir: ".codex", engine: "sqlite",
        run: (a) => { argv = a; return { status: 0 } },
      })
      expect(r.ok).toBe(true)
      expect(argv.join(" ")).toContain("db execute --file")
      // Prisma 7 移除 `db execute --schema`（datasource 从 prisma.config.ts 读）→ 断言不得带该参数
      expect(argv.join(" ")).not.toContain("--schema")
    } finally { rmSync(root, { recursive: true, force: true }) }
  })

  it("执行失败：ok=false + detail 带 stderr 首行（供 init 告警），不抛", () => {
    const root = makeProject(true)
    try {
      const r = applyMemoryExpectedState({
        projectRoot: root, magicDir: ".codex", engine: "sqlite",
        run: () => ({ status: 1, stderr: "Error: no such table: AddMemory\nsecond line\nthird line" }),
      })
      expect(r.ok).toBe(false)
      expect(r.detail).toContain("退出码 1")
      expect(r.detail).toContain("no such table")
      expect(r.detail).toContain("second line")      // 取前两行，便于定位
      expect(r.detail).not.toContain("third line")   // 不把整段 stderr 灌进告警
    } finally { rmSync(root, { recursive: true, force: true }) }
  })
})
