/*
 * `status` 宿主适配自检用例 — Plan Task 2.2 / Spec §5–§6（Issue #21）
 *
 * 覆盖验收项（四态 + 门控）：
 *  - 缺失 → `missing`；工作区键 = 0 → `ok`；用户级键 = 128 / 字符串 "0" → `non-zero`；
 *  - JSONC（行注释 / 块注释 / 尾随逗号）仍能解析出该键值，不误报 `missing`；
 *  - Insiders 变体（`Code - Insiders`）与三平台用户级路径均被探测到；
 *  - 解析失败不静默（记入 `parseError`）；
 *  - 非 VS Code 项目（magicDir ≠ .vscode 且 adapters 不含 vscode）不触发本项检查。
 *
 * 为什么注入 `homeDir` / `platform` / `env`：自检读的是**用户级**设置文件，
 * 若直接依赖真实 HOME 会把开发者本机配置当断言依据（不可复现），故全部走注入。
 */
import { describe, expect, it } from "vitest"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { AddCoderConfig } from "../../src/config/schema.js"
import {
  VIRTUAL_TOOLS_SETTING_KEY,
  checkVsCodeVirtualTools,
  isVsCodeTarget,
  parseJsonc,
  vscodeSettingsCandidates,
  virtualToolsNoticeLines,
} from "../../src/cli/commands/status.js"

/** 临时工作区 + 临时「用户主目录」，返回路径与清理函数 */
function makeFixture() {
  const root = mkdtempSync(join(tmpdir(), "add-coder-status-host-"))
  const projectRoot = join(root, "project")
  const homeDir = join(root, "home")
  mkdirSync(projectRoot, { recursive: true })
  mkdirSync(homeDir, { recursive: true })
  return {
    projectRoot,
    homeDir,
    writeWorkspaceSettings: (content: string) => {
      mkdirSync(join(projectRoot, ".vscode"), { recursive: true })
      writeFileSync(join(projectRoot, ".vscode", "settings.json"), content, "utf-8")
    },
    writeUserSettings: (relDir: string, content: string) => {
      const dir = join(homeDir, relDir)
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, "settings.json"), content, "utf-8")
    },
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  }
}

function config(overrides: Partial<AddCoderConfig> = {}): AddCoderConfig {
  return {
    projectName: "add-coder",
    projectRoot: "",
    sourceDir: "src",
    docsDir: "docs",
    logDir: "logs",
    envFilePath: ".env",
    auditLoggerPath: "src/lib/agent-audit-logger.ts",
    mcpServerCommand: "tsx",
    agentAuditImport: "@/lib/agent-audit-logger",
    magicDir: ".vscode",
    adapters: [],
    overrides: {},
    ...overrides,
  } as AddCoderConfig
}

describe("status 宿主适配自检（issue #21）", () => {
  it("键缺失时的提示含「可忽略」声明（宿主移除该设置后不再是无解告警）", () => {
    const { projectRoot, homeDir, cleanup } = makeFixture()
    try {
      const check = checkVsCodeVirtualTools({ projectRoot, homeDir, platform: "linux", env: {} })
      const lines = virtualToolsNoticeLines(check, {
        projectRoot,
        docPath: ".vscode/docs/ADD-governance-vscode-copilot.md",
      }).join("\n")
      expect(lines).toContain("可忽略")
    } finally {
      cleanup()
    }
  })

  it("键 = 0 时的通过提示不含「可忽略」（避免给人「配了也没用」的错觉）", () => {
    const { projectRoot, homeDir, writeWorkspaceSettings, cleanup } = makeFixture()
    try {
      writeWorkspaceSettings(`{ "${VIRTUAL_TOOLS_SETTING_KEY}": 0 }`)
      const check = checkVsCodeVirtualTools({ projectRoot, homeDir, platform: "linux", env: {} })
      const lines = virtualToolsNoticeLines(check, {
        projectRoot,
        docPath: ".vscode/docs/ADD-governance-vscode-copilot.md",
      }).join("\n")
      expect(check.state).toBe("ok")
      expect(lines).not.toContain("可忽略")
    } finally {
      cleanup()
    }
  })

  it("所有候选都无该键 → missing（文件不存在也算缺键）", () => {
    const fx = makeFixture()
    try {
      const check = checkVsCodeVirtualTools({
        projectRoot: fx.projectRoot,
        platform: "linux",
        homeDir: fx.homeDir,
        env: {},
      })
      expect(check.state).toBe("missing")
      expect(check.candidates.every((c) => c.exists === false)).toBe(true)
      expect(check.candidates).toHaveLength(3) // 工作区 + Code + Code - Insiders
    } finally {
      fx.cleanup()
    }
  })

  it("工作区键 = 0 → ok", () => {
    const fx = makeFixture()
    try {
      fx.writeWorkspaceSettings(`{\n  "${VIRTUAL_TOOLS_SETTING_KEY}": 0\n}`)
      const check = checkVsCodeVirtualTools({
        projectRoot: fx.projectRoot,
        platform: "linux",
        homeDir: fx.homeDir,
        env: {},
      })
      expect(check.state).toBe("ok")
      expect(check.candidates[0].threshold).toBe(0)
    } finally {
      fx.cleanup()
    }
  })

  it("用户级键 = 128 → non-zero（并报出当前值）", () => {
    const fx = makeFixture()
    try {
      fx.writeUserSettings(join(".config", "Code - Insiders", "User"), `{ "${VIRTUAL_TOOLS_SETTING_KEY}": 128 }`)
      const check = checkVsCodeVirtualTools({
        projectRoot: fx.projectRoot,
        platform: "linux",
        homeDir: fx.homeDir,
        env: {},
      })
      expect(check.state).toBe("non-zero")
      const hit = check.candidates.find((c) => c.hasKey)
      expect(hit?.threshold).toBe(128)
      expect(hit?.path).toContain("Code - Insiders")
    } finally {
      fx.cleanup()
    }
  })

  it("键为字符串 \"0\" → non-zero（不把非数值当通过）", () => {
    const fx = makeFixture()
    try {
      fx.writeWorkspaceSettings(`{ "${VIRTUAL_TOOLS_SETTING_KEY}": "0" }`)
      const check = checkVsCodeVirtualTools({
        projectRoot: fx.projectRoot,
        platform: "linux",
        homeDir: fx.homeDir,
        env: {},
      })
      expect(check.state).toBe("non-zero")
      expect(check.candidates[0].hasKey).toBe(true)
      expect(check.candidates[0].threshold).toBeNull()
    } finally {
      fx.cleanup()
    }
  })

  it("JSONC（行注释 / 块注释 / 尾随逗号）仍解析出键值 → ok", () => {
    const fx = makeFixture()
    try {
      fx.writeWorkspaceSettings(
        [
          "{",
          "  // 关闭虚拟工具折叠",
          "  /* 触发线 = 全局工具总数 ≥ 64 */",
          `  "${VIRTUAL_TOOLS_SETTING_KEY}": 0,`,
          "}",
        ].join("\n"),
      )
      const check = checkVsCodeVirtualTools({
        projectRoot: fx.projectRoot,
        platform: "linux",
        homeDir: fx.homeDir,
        env: {},
      })
      expect(check.state).toBe("ok")
    } finally {
      fx.cleanup()
    }
  })

  it("解析失败不静默（记入 parseError，且不误判为 ok）", () => {
    const fx = makeFixture()
    try {
      fx.writeWorkspaceSettings(`{ "${VIRTUAL_TOOLS_SETTING_KEY}": }`)
      const check = checkVsCodeVirtualTools({
        projectRoot: fx.projectRoot,
        platform: "linux",
        homeDir: fx.homeDir,
        env: {},
      })
      expect(check.state).not.toBe("ok")
      expect(check.candidates[0].parseError).toBeTruthy()
    } finally {
      fx.cleanup()
    }
  })

  it("win32 用户级路径用 %APPDATA% 且含 Insiders 变体", () => {
    const fx = makeFixture()
    try {
      const appData = join(fx.homeDir, "AppData", "Roaming")
      const paths = vscodeSettingsCandidates({
        projectRoot: fx.projectRoot,
        platform: "win32",
        homeDir: fx.homeDir,
        env: { APPDATA: appData },
      })
      expect(paths[0]).toBe(join(fx.projectRoot, ".vscode", "settings.json"))
      expect(paths).toContain(join(appData, "Code", "User", "settings.json"))
      expect(paths).toContain(join(appData, "Code - Insiders", "User", "settings.json"))
    } finally {
      fx.cleanup()
    }
  })

  it("darwin 用户级路径落在 Library/Application Support", () => {
    const fx = makeFixture()
    try {
      const paths = vscodeSettingsCandidates({
        projectRoot: fx.projectRoot,
        platform: "darwin",
        homeDir: fx.homeDir,
        env: {},
      })
      expect(paths).toContain(
        join(fx.homeDir, "Library", "Application Support", "Code - Insiders", "User", "settings.json"),
      )
    } finally {
      fx.cleanup()
    }
  })

  it("parseJsonc：字符串内的 // 与 ,} 不被误删", () => {
    const parsed = parseJsonc(`{ "url": "https://example.com/a", "note": "x,}", "n": 0 }`) as Record<string, unknown>
    expect(parsed.url).toBe("https://example.com/a")
    expect(parsed.note).toBe("x,}")
  })

  it("门控①：magicDir / adapters 命中即触发", () => {
    expect(isVsCodeTarget(config({ magicDir: ".vscode", adapters: [] }))).toBe(true)
    expect(isVsCodeTarget(config({ magicDir: ".add", adapters: ["vscode"] }))).toBe(true)
    expect(isVsCodeTarget(config({ magicDir: ".qoder", adapters: [] }))).toBe(false)
  })

  it("门控②：magicDir 为空串但工作区接了 VS Code MCP → 仍触发（真实项目 loadConfig 的默认态）", () => {
    const fx = makeFixture()
    try {
      // 真实项目：status 不传 configPath ⇒ magicDir 为空串，只能靠布局证据识别
      fx.writeWorkspaceSettings(`{ "mcp": { "servers": { "add-coder-dev-tools": {} } } }`)
      expect(isVsCodeTarget(config({ magicDir: "", adapters: [] }), fx.projectRoot)).toBe(true)

      // github.copilot.chat.* 设置同样视为 VS Code 端接线
      fx.writeWorkspaceSettings(`{ "${VIRTUAL_TOOLS_SETTING_KEY}": 0 }`)
      expect(isVsCodeTarget(config({ magicDir: "", adapters: [] }), fx.projectRoot)).toBe(true)
    } finally {
      fx.cleanup()
    }
  })

  it("门控③：既无配置命中也无 VS Code 布局 → 不触发", () => {
    const fx = makeFixture()
    try {
      expect(isVsCodeTarget(config({ magicDir: ".codex", adapters: ["codex"] }), fx.projectRoot)).toBe(false)
      expect(isVsCodeTarget(config({ magicDir: "", adapters: [] }), fx.projectRoot)).toBe(false)
    } finally {
      fx.cleanup()
    }
  })

  it("门控④：.vscode/mcp.json 存在即触发", () => {
    const fx = makeFixture()
    try {
      mkdirSync(join(fx.projectRoot, ".vscode"), { recursive: true })
      writeFileSync(join(fx.projectRoot, ".vscode", "mcp.json"), `{ "servers": {} }`, "utf-8")
      expect(isVsCodeTarget(config({ magicDir: "", adapters: [] }), fx.projectRoot)).toBe(true)
    } finally {
      fx.cleanup()
    }
  })
})
