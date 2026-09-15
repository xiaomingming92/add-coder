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
  orphanPidsToReap,
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
      " 9999    1 99999 /usr/bin/gnome-shell --mode=ubuntu",
      "  111  9999  120 npx tsx /home/u/proj/.codex/scripts/mcp-server.ts",
      "  222  9999   60 npx tsx /home/u/proj/.qoder/scripts/mcp-server.ts",
      "  333  9999   10 node /home/u/proj/node_modules/.bin/vitest run",
    ].join("\n")
    const servers = listRunningMcpServers({ psOutput, now: () => new Date("2026-09-13T10:00:00Z") })
    expect(servers.map((s) => s.magicDir).sort()).toEqual([".codex", ".qoder"])
    expect(servers[0].pid).toBe(111)
    expect(servers[0].startedAt).toEqual(new Date("2026-09-13T09:58:00Z")) // now - 120s
  })

  it("无 server 时返回空数组（不抛）", () => {
    expect(listRunningMcpServers({ psOutput: "  1  9999  5  bash" })).toEqual([])
  })

  // 真实场景回归（2026-09-13 sync 现场捞出的两个 bug）：
  // ① 同一逻辑 server 会呈现为 npx → npm exec → sh -c → tsx 的进程链；
  // ② 路径噪声（node_modules）与无点前缀目录不得被误判为 adapter。
  const realPsOutput = [
    " 9999    1 99999 /usr/bin/gnome-shell --mode=ubuntu",
    "  75649  9999  79300 npx tsx /home/u/proj/.codex/scripts/mcp-server.ts",
    "  75658  75649 79299 npm exec tsx /home/u/proj/.codex/scripts/mcp-server.ts",
    "  75788  75658 79298 sh -c 'tsx' /home/u/proj/.codex/scripts/mcp-server.ts",
    "1346370 75649  3600 tsx /home/u/proj/.codex/scripts/mcp-server.ts",
    "1346392 75649  3500 tsx /home/u/proj/.codex/scripts/mcp-server.ts",
    "    222  9999    60 npx tsx /home/u/proj/.qoder/scripts/mcp-server.ts",
    "    333  9999    10 node /home/u/proj/node_modules/add-coder/scripts/mcp-server.ts",
    "    444  9999     5 tsx /home/u/proj/any/scripts/mcp-server.ts",
    "    555  9999     5 tsx /home/u/proj/.codex/scripts/mcp-restart-notice.ts",
  ].join("\n")

  it("真实进程链：同一 adapter 多条记录，node_modules 与无点前缀路径被排除", () => {
    const servers = listRunningMcpServers({ psOutput: realPsOutput, now: () => new Date("2026-09-13T10:00:00Z") })
    expect(servers.filter((s) => s.magicDir === ".codex")).toHaveLength(5)
    expect(servers.filter((s) => s.magicDir === ".qoder")).toHaveLength(1)
    // 安装副本 / 无点前缀目录 / 自身脚本 都不应出现
    expect(servers.some((s) => s.command.includes("/any/"))).toBe(false)
    expect(servers.some((s) => s.command.includes("mcp-restart-notice"))).toBe(false)
  })

  /*
   * 噪声过滤收窄回归（2026-09-14）：旧实现 `cmd.includes("node_modules") → skip` 会把
   * **我们自己的 tsx 启动层**一并挡掉（argv 里必然出现 node_modules 路径），
   * 导致回收只杀表层 npx/npm，深层 node/tsx 残部继续存活（实测留下两族残部）。
   */
  const nodeModulesPsOutput = [
    " 9999    1 99999 /usr/bin/gnome-shell --mode=ubuntu",
    "  444 9999    20 node /home/u/proj/node_modules/.bin/../tsx/dist/cli.mjs /home/u/proj/.codex/scripts/mcp-server.ts",
    "  445 9999    20 node /home/u/proj/node_modules/some-pkg/.codex/scripts/mcp-server.ts",
  ].join("\n")

  it("自己的 tsx 启动层（argv 含 node_modules）必须被纳入", () => {
    const servers = listRunningMcpServers({ psOutput: nodeModulesPsOutput })
    expect(servers.map((s) => s.pid)).toContain(444)
  })

  it("安装副本（node_modules/<pkg>/.codex/…）仍被排除", () => {
    const servers = listRunningMcpServers({ psOutput: nodeModulesPsOutput })
    expect(servers.map((s) => s.pid)).not.toContain(445)
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

/*
 * 残留族识别与回收（2026-09-14 用户实测反馈：`.qoder` / `.codex` 上反复出现 MCP 残留）
 *
 * 成因：IDE/app 退出只杀直接子进程（npx），`npm exec → sh -c → tsx → node` 被 reparent 到
 * init/systemd 继续存活。判定依据 = ppid 落在 init/systemd 上（systemd --user 同样算）。
 */
describe("残留族（孤儿 MCP 进程）", () => {
  const orphanPsOutput = [
    "    1    0 99999 /sbin/init",
    " 1125    1 99999 /usr/lib/systemd/systemd --user",
    " 8332    1  3600 npx tsx /home/u/proj/.codex/scripts/mcp-server.ts",
    " 8386 8332  3600 npm exec tsx /home/u/proj/.codex/scripts/mcp-server.ts",
    " 8549 8386  3600 sh -c 'tsx' /home/u/proj/.codex/scripts/mcp-server.ts",
    "41234 1125    10 npx tsx /home/u/proj/.qoder/scripts/mcp-server.ts",
    " 7777 9999    20 npx tsx /home/u/proj/.codex/scripts/mcp-server.ts",
    " 9999    1 99999 /usr/bin/gnome-shell --mode=ubuntu",
  ].join("\n")

  it("ppid 落在 init/systemd 上的进程族被标为 orphan；正常启动者名下的不算", () => {
    const servers = listRunningMcpServers({ psOutput: orphanPsOutput })
    expect(servers.find((s) => s.pid === 8332)?.orphan).toBe(true) // ppid=1
    expect(servers.find((s) => s.pid === 41234)?.orphan).toBe(true) // ppid=systemd --user
    expect(servers.find((s) => s.pid === 7777)?.orphan).toBe(false) // ppid=gnome-shell
  })

  it("orphanPidsToReap 只列孤儿族（含链上各代），运行中的正常 server 不动", () => {
    const servers = listRunningMcpServers({ psOutput: orphanPsOutput })
    expect(orphanPidsToReap(servers)).toEqual([8332, 8386, 8549, 41234])
  })

  it("新鲜度判定忽略孤儿：只有孤儿时不报 stale，也不会把孤儿 pid 当成现役 server", () => {
    const onlyOrphans = listRunningMcpServers({ psOutput: orphanPsOutput }).filter((s) => s.orphan)
    const info = computeFreshness(".codex", root, { mtimeOf: () => mtime, listServers: () => onlyOrphans })
    expect(info.stale).toBe(false)
    expect(info.detail).toContain("无运行中 server")
    expect(info.processStartedAt).toBeUndefined()
  })

  it("同 adapter 同时存在孤儿与现役时，判定取现役那条", () => {
    const servers = listRunningMcpServers({ psOutput: orphanPsOutput })
    const info = computeFreshness(".codex", root, {
      mtimeOf: () => newer, // 产物比现役进程(20s)更新 → stale=true
      listServers: () => servers,
    })
    expect(info.processStartedAt).toBeDefined()
    expect(info.detail).toContain("7777") // 取的是现役那条，不是孤儿 8332
  })
})
