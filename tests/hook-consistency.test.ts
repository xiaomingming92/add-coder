// hook-consistency.test.ts — 五端一致性矩阵（Task 9.1，Spec §5「一致即可证」）
// 契约红线 × 6 端（core 参考实现 + 5 adapter）逐项断言:
//   ① 生命周期裁决 fail-closed 形态（stdout/stderr/exit 协议一致，codex systemMessage 标注差异）
//   ② 危险命令拦截一致性（detectors 链上提后六端同语义）
//   ③ 敏感文件锚定（.env 拦 / config.env 放行）
//   ④ 审计事件面（post-tool-use 写事件 → jsonl，五端同链路）
//   ⑤ 协议形态标注（codex deny/systemMessage JSON vs 其余文本——形态差异治理语义一致）
// 运行: npx vitest run tests/hook-consistency.test.ts

import { describe, expect, it } from "vitest"
import { existsSync, readFileSync, unlinkSync } from "node:fs"
import { join } from "node:path"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { projectRoot } from "../src/shared/paths.js"

const PROJECT_DIR = projectRoot() ?? process.cwd()

interface End {
  name: string
  magicDir: string
}

// 六端（core 参考实现 + 5 adapter）
const ENDS: End[] = [
  { name: "core", magicDir: ".add" },
  { name: "claude", magicDir: ".claude" },
  { name: "qoder", magicDir: ".qoder" },
  { name: "vscode", magicDir: ".vscode" },
  { name: "trae", magicDir: ".trae" },
  { name: "codex", magicDir: ".codex" },
]

/** 以产物重放（同 compare-golden 语义） */
function runHook(end: End, hook: string, stdin: string, env: Record<string, string> = {}) {
  const mjs = join(PROJECT_DIR, end.magicDir, "hooks", `${hook}.mjs`)
  if (!existsSync(mjs)) return { stdout: "", stderr: "", exitCode: -2 }
  const r = spawnSync(process.execPath, [mjs], {
    input: stdin,
    env: { ...process.env, MAGIC_DIR: end.magicDir, PROJECT_DIR, ...env },
    timeout: 10_000,
    encoding: "utf-8",
    cwd: PROJECT_DIR,
  })
  return { stdout: r.stdout ?? "", stderr: r.stderr ?? "", exitCode: r.status ?? -1 }
}

describe("五端一致性矩阵（契约红线）", () => {
  // ── ① 生命周期裁决 fail-closed（Q0：DB 不可用 → 阻断，不吞成无 Plan）──
  it("Q0 fail-closed：MAGIC_DIR 无效（bridge 缺失）→ exit 2 阻断而非放行", () => {
    // 无效 magicDir → queryPlanStatus 返回 STATUS_UNAVAILABLE → Q0 exit 2（fail-closed 契约）
    for (const end of ENDS) {
      const r = runHook(end, "stop-check", "{}", { MAGIC_DIR: `${end.magicDir}_invalid_` })
      expect(r.exitCode, `${end.name} Q0 未 fail-closed`).toBe(2)
      expect(r.stderr, `${end.name} Q0 缺阻断语义`).toContain("status")
    }
  })

  // ── ② 危险命令拦截一致性（Task 9.4.2: dangerous-command 上提 core 基线链）──
  it("危险命令 rm -rf / 六端一致拦截（exit 2 + 语义文本）", () => {
    for (const end of ENDS) {
      const r = runHook(end, "pre-tool-use", JSON.stringify({ tool_name: "Bash", tool_input: { command: "rm -rf /" } }))
      const output = r.stdout + r.stderr
      expect(r.exitCode, `${end.name} 危险命令未拦截`).toBe(2)
      expect(output, `${end.name} 拦截语义缺失`).toContain("危险命令已被阻止")
    }
  })

  // ── ③ 敏感文件锚定（Task 9.4.4①: 锚定版不误伤 config.env）──
  it("敏感文件 .env 六端一致拦截（exit 2）", () => {
    for (const end of ENDS) {
      const r = runHook(end, "pre-tool-use", JSON.stringify({ tool_name: "Write", tool_input: { file_path: join(PROJECT_DIR, ".env") } }))
      expect(r.exitCode, `${end.name} .env 未拦截`).toBe(2)
      expect(r.stdout + r.stderr, `${end.name} 敏感语义缺失`).toContain("敏感文件")
    }
  })

  it("config.env 不再误拦（锚定版，六端放行 exit 0）", () => {
    for (const end of ENDS) {
      const r = runHook(end, "pre-tool-use", JSON.stringify({ tool_name: "Write", tool_input: { file_path: join(PROJECT_DIR, "config.env") } }))
      expect(r.exitCode, `${end.name} config.env 误拦`).toBe(0)
    }
    // 放行分支 markDevAction 会残留 /tmp/add_dev_* 标记——清理避免污染后续 stop-check 对比（Task 9.4）
    const h = createHash("md5").update(`${PROJECT_DIR}\n`).digest("hex").slice(0, 8)
    try {
      unlinkSync(`/tmp/add_dev_${h}`)
    } catch {
      /* ignore */
    }
  })

  // ── ④ 审计事件面（Task 8: post-tool-use 写事件 → jsonl，五端同链路）──
  it("post-tool-use 文件写入事件五端同链路（decision=write 落 jsonl）", () => {
    const probe = join(PROJECT_DIR, ".qoder", "plans", "2026-08", "14", "consistency-probe.md")
    for (const end of ENDS) {
      const r = runHook(end, "post-tool-use", JSON.stringify({ tool_name: "Write", tool_input: { file_path: probe } }))
      expect(r.exitCode, `${end.name} post-tool-use 异常`).toBe(0)
      const jsonl = join(PROJECT_DIR, end.magicDir, "reports", "hook-events.jsonl")
      expect(existsSync(jsonl), `${end.name} jsonl 缺失`).toBe(true)
      const content = readFileSync(jsonl, "utf-8")
      // 最近一条 post-tool-use write 事件（文件尾部）
      const last = content.trim().split("\n").filter((l) => l.includes('"hook":"post-tool-use"') && l.includes('"decision":"write"')).pop() ?? ""
      expect(last, `${end.name} 无 write 事件`).toContain(probe)
      expect(last, `${end.name} 事件缺 reason`).toContain("文件写入审计")
    }
  })

  // ── ⑤ 协议形态标注（形态差异 ≠ 语义差异）──
  it("codex 私有协议形态标注（systemMessage / deny JSON）", () => {
    // codex 入口含 systemMessage JSON 序列化（stop 协议）
    const stopMjs = readFileSync(join(PROJECT_DIR, ".codex", "hooks", "stop-check.mjs"), "utf-8")
    expect(stopMjs).toContain("systemMessage")
    // codex pre-tool-use 拦截输出 permissionDecision deny（其余端 ask/text）
    const r = runHook({ name: "codex", magicDir: ".codex" }, "pre-tool-use", JSON.stringify({ tool_name: "Bash", tool_input: { command: "rm -rf /" } }))
    expect(r.stdout).toContain('"permissionDecision":"deny"')
    // 其余端无 systemMessage 协议（语义一致形态不同）
    for (const end of ENDS.filter((e) => e.name !== "codex")) {
      const mjs = readFileSync(join(PROJECT_DIR, end.magicDir, "hooks", "stop-check.mjs"), "utf-8")
      // 协议指纹: systemMessage JSON 序列化调用（注释/闲聊字样不计）
      expect(mjs, `${end.name} 不应含 codex systemMessage 协议`).not.toContain("JSON.stringify({ systemMessage")
    }
  })

  // ── ⑤ 熵值管控：adapter 入口无治理逻辑副本（协议薄壳）──
  it("治理 0 复制：adapter pre-tool-use 入口无检测链硬编码", () => {
    const DETECTOR_FINGERPRINT = "python3?|node|ruby|perl|php"
    for (const end of ENDS.filter((e) => e.name !== "core")) {
      const src = readFileSync(join(PROJECT_DIR, "templates", "adapters", end.name, "hooks", "pre-tool-use.ts"), "utf-8")
      const codeLines = src.split("\n").filter((l) => !l.trim().startsWith("//"))
      expect(codeLines.some((l) => l.includes(DETECTOR_FINGERPRINT)), `${end.name} 入口含检测链硬编码`).toBe(false)
    }
  })
})
