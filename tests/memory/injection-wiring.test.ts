/*
 * 记忆注入接线回归（Plan `add-coder-memory-injection-wiring-plan-v1` / Spec §7–§8）
 *
 * 覆盖四条防退化断言：
 *  ① [W] 快照刷新存在**生产调用点**（实现存在 ≠ 生产可达：本 Plan 的原始缺陷正是"库齐了、入口没分发"）
 *  ② `inject` 档位下 SessionStart 输出包含 L1 正文（带来源边界标签）
 *  ③ `shadow` 档位下输出档位提示且**不注入**正文
 *  ④ 快照缺失时**不静默**（至少输出"未接线"），且 fail-open（不抛、exit code 仍 0）
 *
 * 为什么用例 ① 用"读源文件 + 正则命中"而不是 import：
 * 接线判据问的是"生产路径里有没有调用方"，import 只能证明"模块存在"——三次同类事故
 * （纯函数与单测齐全、生产不可达）都发生在"导出了、但没人调"这一层。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { recallMode } from "../../templates/core/scripts/mcp-server/shared/memory/switches.js"
import { SessionStartGuard } from "../../templates/core/governance/session-start-guard.js"
import { refreshL1SnapshotOnInstall } from "../../src/lib/memory-snapshot-install.js"

const REPO_ROOT = join(import.meta.dirname, "../..")

let tmp: string
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "mem-wiring-"))
  vi.stubEnv("MAGIC_DIR", ".codex")
  vi.stubEnv("ADD_MEMORY_MAX_TOKENS", "600")
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  rmSync(tmp, { recursive: true, force: true })
})

function captureStdout() {
  const out: string[] = []
  vi.spyOn(process.stdout, "write").mockImplementation(((chunk: unknown) => {
    out.push(String(chunk))
    return true
  }) as never)
  return out
}

class TestSessionGuard extends SessionStartGuard {
  public callL1() { this.emitMemoryL1() }
}

const SNAPSHOT = [
  '[Memory L1 · 来源: AddMemory 治理库 · 生成于 2026-08-20T00:00:00.000Z]',
  '<agent-memory source="add-memory" trust="governed">',
  "- [CONSTRAINT] 端口约定（置信 0.90）",
  "  5433/5435 属邻居项目，勿占用",
  "</agent-memory>",
  "",
].join("\n")

function writeSnapshot(content = SNAPSHOT): string {
  const dir = join(tmp, ".codex", "memory")
  mkdirSync(dir, { recursive: true })
  const file = join(dir, "l1-context.md")
  writeFileSync(file, content, "utf-8")
  return file
}

function readSource(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), "utf-8")
}

describe("[W] 快照刷新的生产调用点", () => {
  it("工具注册 + 模板 CLI + init/sync 挂载三处均存在非测试调用方", () => {
    // ① MCP 工具：注册名与实现同文件
    const tools = readSource("templates/core/scripts/mcp-server/tools/memory.ts")
    expect(tools).toMatch(/registerTool\(\s*"refresh_memory_snapshots"/)
    expect(tools).toMatch(/refreshL1Snapshot\(snapshotDeps\)/)

    // ② 下游可运行的模板入口（随 sync 分发到 {magicDir}/scripts/memory/）
    const cli = readSource("templates/core/scripts/memory/memory-jobs.ts")
    expect(cli).toMatch(/refresh-l1/)
    expect(cli).toMatch(/refreshL1Snapshot\(baseDeps\)/)

    // ③ 安装期挂载：库层单一实现 + init/sync 两个调用方
    const lib = readSource("src/lib/memory-snapshot-install.ts")
    expect(lib).toMatch(/memory-jobs\.ts/)
    expect(readSource("src/cli/commands/init.ts")).toMatch(/refreshL1SnapshotOnInstall\(/)
    expect(readSource("src/cli/commands/sync.ts")).toMatch(/refreshL1SnapshotOnInstall\(/)
  })
})

describe("会话注入三态（接线后）", () => {
  it("默认档位 = inject", () => {
    expect(recallMode({} as never)).toBe("inject")
  })

  it("inject + 快照新鲜 → 注入 L1 正文（含来源边界标签）", () => {
    vi.stubEnv("ADD_MEMORY_RECALL_MODE", "inject")
    writeSnapshot()
    const out = captureStdout()
    new TestSessionGuard(tmp).callL1()
    const text = out.join("")
    expect(text).toContain('<agent-memory source="add-memory"')
    expect(text).toContain("CONSTRAINT")
  })

  it("shadow → 输出档位提示且不注入正文", () => {
    vi.stubEnv("ADD_MEMORY_RECALL_MODE", "shadow")
    writeSnapshot()
    const out = captureStdout()
    new TestSessionGuard(tmp).callL1()
    const text = out.join("")
    expect(text).toContain("当前档位 shadow")
    expect(text).toContain("ADD_MEMORY_RECALL_MODE")
    expect(text).not.toContain("<agent-memory")
  })

  it("快照缺失 → 不静默（输出未接线 + 生成入口 + 开启方式），且 fail-open 不抛", () => {
    const out = captureStdout()
    expect(() => new TestSessionGuard(tmp).callL1()).not.toThrow()
    const text = out.join("")
    expect(text).toContain("未接线")
    expect(text).toContain("refresh_memory_snapshots")
    expect(text).toContain("ADD_MEMORY_RECALL_MODE=inject")
    expect(text).not.toContain("<agent-memory")
  })
})

describe("安装期挂载：失败阻断且原因可见（人类决策）", () => {
  it("入口脚本缺失 → ok=false 且指明脚本路径", () => {
    const r = refreshL1SnapshotOnInstall({ projectRoot: tmp, magicDir: ".codex", env: {} })
    expect(r.ok).toBe(false)
    expect(r.detail).toContain(".codex/scripts/memory/memory-jobs.ts")
  })

  it("缺 DATABASE_URL → ok=false 且指出去哪配", () => {
    mkdirSync(join(tmp, ".codex", "scripts", "memory"), { recursive: true })
    writeFileSync(join(tmp, ".codex", "scripts", "memory", "memory-jobs.ts"), "// stub\n", "utf-8")
    const r = refreshL1SnapshotOnInstall({ projectRoot: tmp, magicDir: ".codex", env: {} })
    expect(r.ok).toBe(false)
    expect(r.detail).toContain("DATABASE_URL")
  })

  it("子进程非零 → ok=false 且带 stderr 摘录与可复现命令", () => {
    mkdirSync(join(tmp, ".codex", "scripts", "memory"), { recursive: true })
    writeFileSync(join(tmp, ".codex", "scripts", "memory", "memory-jobs.ts"), "// stub\n", "utf-8")
    const r = refreshL1SnapshotOnInstall({
      projectRoot: tmp,
      magicDir: ".codex",
      env: { DATABASE_URL: "postgresql://localhost:5432/x" },
      run: () => ({ status: 1, stdout: "", stderr: "Cannot find module 'prisma'" }),
    })
    expect(r.ok).toBe(false)
    expect(r.detail).toContain("Cannot find module")
    expect(r.cmd).toContain("refresh-l1")
  })

  it("子进程成功 → ok=true（幂等刷新由入口自身保证）", () => {
    mkdirSync(join(tmp, ".codex", "scripts", "memory"), { recursive: true })
    writeFileSync(join(tmp, ".codex", "scripts", "memory", "memory-jobs.ts"), "// stub\n", "utf-8")
    const r = refreshL1SnapshotOnInstall({
      projectRoot: tmp,
      magicDir: ".codex",
      env: { DATABASE_URL: "postgresql://localhost:5432/x" },
      run: () => ({ status: 0, stdout: "{\"path\":\".codex/memory/l1-context.md\"}", stderr: "" }),
    })
    expect(r.ok).toBe(true)
    expect(r.relScript).toBe(".codex/scripts/memory/memory-jobs.ts")
  })
})
