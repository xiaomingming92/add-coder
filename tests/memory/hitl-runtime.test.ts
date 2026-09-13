/*
 * 轮 1 契约测试：HITL 运行时可见性与降级（Spec §Freshness / §RenderFallback / §WidgetInstance / §SyncNotice）
 *
 * 覆盖：陈旧判定（含 unknown 回退）、标记读写幂等、实例 HTML 注入与落盘、缺模板明确报错、
 *       全 adapter 扫描（非仅 .codex）。
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, describe, expect, it } from "vitest"
import {
  RESTART_MARKER_FILE,
  clearRestartRequiredMarker,
  computeFreshness,
  earliestPerAdapter,
  listRunningMcpServers,
  readRestartRequiredMarker,
  writeRestartRequiredMarker,
} from "../../templates/core/scripts/mcp-server/shared/runtime-freshness.js"
import {
  buildHitlInstanceHtml,
  writeHitlInstanceHtml,
} from "../../templates/core/scripts/mcp-server/shared/hitl-widget-instance.js"

const root = mkdtempSync(join(tmpdir(), "hitl-runtime-"))
afterAll(() => rmSync(root, { recursive: true, force: true }))

const mtime = new Date("2026-09-13T09:47:00Z")
const older = new Date("2026-09-12T11:49:00Z")
const newer = new Date("2026-09-13T10:30:00Z")

describe("listRunningMcpServers 全 adapter 扫描", () => {
  it("从 ps 输出解析出 .codex 与 .qoder 两个 server（非仅 .codex）", () => {
    const psOutput = [
      "  111  120 npx tsx /home/u/proj/.codex/scripts/mcp-server.ts",
      "  222  60  npx tsx /home/u/proj/.qoder/scripts/mcp-server.ts",
      "  333  10  node /home/u/proj/node_modules/.bin/vitest run",
    ].join("\n")
    const servers = listRunningMcpServers({ psOutput, now: () => new Date("2026-09-13T10:00:00Z") })
    expect(servers.map((s) => s.magicDir).sort()).toEqual([".codex", ".qoder"])
    expect(servers[0].pid).toBe(111)
    expect(servers[0].startedAt).toEqual(new Date("2026-09-13T09:58:00Z")) // now - 120s
  })

  it("无 server 时返回空数组（不抛）", () => {
    expect(listRunningMcpServers({ psOutput: "  1  5  bash" })).toEqual([])
  })

  // 真实场景回归（2026-09-13 sync 现场捞出的两个 bug）：
  // ① 同一逻辑 server 会呈现为 npx → npm exec → sh -c → tsx 的进程链；
  // ② 路径噪声（node_modules）与无点前缀目录不得被误判为 adapter。
  const realPsOutput = [
    "  75649  79300 npx tsx /home/u/proj/.codex/scripts/mcp-server.ts",
    "  75658  79299 npm exec tsx /home/u/proj/.codex/scripts/mcp-server.ts",
    "  75788  79298 sh -c 'tsx' /home/u/proj/.codex/scripts/mcp-server.ts",
    "1346370   3600 tsx /home/u/proj/.codex/scripts/mcp-server.ts",
    "1346392   3500 tsx /home/u/proj/.codex/scripts/mcp-server.ts",
    "    222     60 npx tsx /home/u/proj/.qoder/scripts/mcp-server.ts",
    "    333     10 node /home/u/proj/node_modules/add-coder/scripts/mcp-server.ts",
    "    444      5 tsx /home/u/proj/any/scripts/mcp-server.ts",
    "    555      5 tsx /home/u/proj/.codex/scripts/mcp-restart-notice.ts",
  ].join("\n")

  it("真实进程链：同一 adapter 多条记录，node_modules 与无点前缀路径被排除", () => {
    const servers = listRunningMcpServers({ psOutput: realPsOutput, now: () => new Date("2026-09-13T10:00:00Z") })
    expect(servers.filter((s) => s.magicDir === ".codex")).toHaveLength(5)
    expect(servers.filter((s) => s.magicDir === ".qoder")).toHaveLength(1)
    // node_modules 噪声、无点前缀目录、自身脚本 都不应出现
    expect(servers.some((s) => s.command.includes("node_modules"))).toBe(false)
    expect(servers.some((s) => s.command.includes("/any/"))).toBe(false)
    expect(servers.some((s) => s.command.includes("mcp-restart-notice"))).toBe(false)
  })

  it("聚合后每个 adapter 只留一条，且取最早启动时间；陈旧判定不会被新进程掩盖", () => {
    const servers = listRunningMcpServers({ psOutput: realPsOutput, now: () => new Date("2026-09-13T10:00:00Z") })
    const perAdapter = earliestPerAdapter(servers)
    expect([...perAdapter.keys()].sort()).toEqual([".codex", ".qoder"])
    const codex = perAdapter.get(".codex")!
    expect(codex.pid).toBe(75649) // 最早（79300s 前）
    const info = computeFreshness(".codex", root, { mtimeOf: () => mtime, listServers: () => servers })
    expect(info.stale).toBe(true)
    expect(info.detail).toContain("需重启")
  })
})

describe("computeFreshness 陈旧判定", () => {
  const deps = (serverStart?: Date) => ({
    mtimeOf: () => mtime,
    markerExists: () => false,
    listServers: () =>
      serverStart
        ? [{ magicDir: ".codex", pid: 111, command: "x", startedAt: serverStart }]
        : [],
  })

  it("进程启动早于产物 → stale=true（真实缺陷场景）", () => {
    const info = computeFreshness(".codex", root, deps(older))
    expect(info.stale).toBe(true)
    expect(info.processStartedAt).toBe(older.toISOString())
    expect(info.detail).toContain("需重启")
  })

  it("进程晚于产物 → stale=false", () => {
    expect(computeFreshness(".codex", root, deps(newer)).stale).toBe(false)
  })

  it("无运行中 server → stale=false（不误报）", () => {
    expect(computeFreshness(".codex", root, deps()).stale).toBe(false)
  })

  it("产物缺失 / 进程启动时间不可得 → stale=\"unknown\"（不误报）", () => {
    expect(computeFreshness(".codex", root, { mtimeOf: () => null }).stale).toBe("unknown")
    const noStart = {
      mtimeOf: () => mtime,
      listServers: () => [{ magicDir: ".codex", pid: 1, command: "x", startedAt: undefined }],
    }
    expect(computeFreshness(".codex", root, noStart).stale).toBe("unknown")
  })

  it("按 adapter 隔离：.qoder 的 server 不影响 .codex 判定", () => {
    const info = computeFreshness(".codex", root, {
      mtimeOf: () => mtime,
      listServers: () => [{ magicDir: ".qoder", pid: 9, command: "x", startedAt: older }],
    })
    expect(info.stale).toBe(false)
  })
})

describe("重启标记读写（幂等 + fail-open）", () => {
  it("写入后可读，清除后不可读，重复清除不抛", () => {
    mkdirSync(join(root, ".codex"), { recursive: true })
    const path = writeRestartRequiredMarker(".codex", root, { reason: "test", pid: 123 })
    expect(path).toBe(join(root, ".codex", RESTART_MARKER_FILE))
    expect(readRestartRequiredMarker(".codex", root)).toContain("test")
    // 幂等覆盖写
    writeRestartRequiredMarker(".codex", root, { reason: "second", pid: 456 })
    expect(readRestartRequiredMarker(".codex", root)).toContain("second")
    clearRestartRequiredMarker(".codex", root)
    expect(readRestartRequiredMarker(".codex", root)).toBeNull()
    expect(() => clearRestartRequiredMarker(".codex", root)).not.toThrow()
  })

  it("写入失败返回 null 而非抛错（fail-open）", () => {
    // 标记路径上先建目录 → writeFileSync 必然失败（EISDIR）
    mkdirSync(join(root, ".claude", RESTART_MARKER_FILE), { recursive: true })
    expect(writeRestartRequiredMarker(".claude", root, { reason: "r" })).toBeNull()
  })
})

describe("HITL 实例 HTML", () => {
  const template = "<html><head><title>w</title></head><body><main>核心 widget</main></body></html>"
  const input = {
    planName: "demo-plan-v1",
    type: "PLAN",
    round: 1,
    status: "DRAFT",
    dimensions: [
      { name: "范围界定", content: "只做 <b>X</b>" },
      { name: "验收基线", content: "MRR ≥ 0.75" },
    ],
  }

  it("注入 JSON 载荷 + 人类可读维度表，且保留原模板内容", () => {
    const html = buildHitlInstanceHtml({ ...input, templateHtml: template })
    expect(html).toContain("核心 widget")
    expect(html).toContain('id="hitl-instance-payload"')
    expect(html).toContain("demo-plan-v1")
    expect(html).toContain("范围界定")
    expect(html).toContain("MRR ≥ 0.75")
    // HTML 转义：维度内容里的标签不得逃逸
    expect(html).toContain("&lt;b&gt;X&lt;/b&gt;")
    expect(html).not.toContain("<b>X</b>")
  })

  it("落盘路径为 {magicDir}/hitl/{planName}-round{N}.html（幂等覆盖）", () => {
    mkdirSync(join(root, ".codex", "templates"), { recursive: true })
    writeFileSync(join(root, ".codex", "templates", "hitl-approval-widget.html"), template, "utf-8")
    const first = writeHitlInstanceHtml({ ...input, projectRoot: root, magicDir: ".codex" })
    expect(first.htmlPath).toBe(join(root, ".codex", "hitl", "demo-plan-v1-round1.html"))
    expect(existsSync(first.htmlPath)).toBe(true)
    expect(readFileSync(first.htmlPath, "utf-8")).toContain("范围界定")
    const second = writeHitlInstanceHtml({ ...input, projectRoot: root, magicDir: ".codex" })
    expect(second.htmlPath).toBe(first.htmlPath)
  })

  it("模板缺失 → 明确报错（不静默产出空 HTML）", () => {
    expect(() =>
      writeHitlInstanceHtml({ ...input, projectRoot: root, magicDir: ".trae" }),
    ).toThrow(/模板缺失/)
  })
})
