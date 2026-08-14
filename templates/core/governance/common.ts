// lib/common.ts — ADD Hook 协议壳（轮次 1 / Task 1.3）
// 与 bash 版 lib/common.sh 行为逐字对齐:
//   stdin 解析 / stdout JSON / stderr 文本 / 退出码 0·2 / failClosed
// 契约红线（Plan §1.2）: stdout 仅 JSON、stderr 仅人类可读文本、exit 0/2
// 烘焙: scripts/hook-bake.ts bundle 为各 magicDir hooks/lib/common.mjs
// 本文件被各入口 .ts 与 adapter 私有协议层 import（bundle 时内联，产物自包含）

import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs"
import { basename, dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { protocol } from "./rules.js"
import { findUpSync } from "find-up"

/** 退出码常量（真源: hook-protocol-rules.toml [protocol.exit_codes]） */
export const EXIT_PASS = protocol.exit_codes.pass as number
export const EXIT_BLOCK = protocol.exit_codes.block as number

/** state 字段分隔符（真源: hook-protocol-rules.toml [protocol.output.field_separator]） */
export const STATE_SEP = protocol.output.field_separator as string

/** 从 stdin 读取完整 JSON（IDE hook 事件 payload）；TTY 时返回 "{}"（对齐 bash parse_input） */
export function readHookInput(): string {
  if (process.stdin.isTTY) return "{}"
  return readFileSync(0, "utf-8")
}

/** 从 JSON 提取首个字符串字段值（对齐 bash json_get 的 grep/sed 语义） */
export function jsonGet(json: string, field: string): string {
  const re = new RegExp(`"${field}"\\s*:\\s*"([^"]*)"`)
  const m = re.exec(json)
  return m?.[1] ?? ""
}

/** stdout 输出 JSON（机器契约一字不变: additionalContext / hookSpecificOutput / decision） */
export function emitJson(payload: Record<string, unknown> | string): void {
  process.stdout.write(
    (typeof payload === "string" ? payload : JSON.stringify(payload)) + "\n"
  )
}

/** stderr 输出文本（Qoder 规范: stderr=人类可读，stdout=机器 JSON） */
export function emitText(text: string): void {
  process.stderr.write(text + "\n")
}

/** 放行（退出码 0） */
export function exitOk(): never {
  process.exit(EXIT_PASS)
}

/** 阻断（退出码 2） */
export function exitBlock(): never {
  process.exit(EXIT_BLOCK)
}

/**
 * STATUS_UNAVAILABLE 语义: 非零退出 + stderr 说明，禁止静默吞掉。
 * 默认阻断码 2（hook 冒烟契约 ∈ {0,2}）；bridge 场景可传 3（对齐 bash return 3）。
 */
export function failClosed(msg: string, code: number = EXIT_BLOCK): never {
  process.stderr.write(msg + "\n")
  process.exit(code)
}

/**
 * magicDir 统一解析（Plan §3.2 缺陷修复要求 TS 版唯一解析链）:
 *   ① 入口注入 MAGIC_DIR 优先（sync 烘焙时 bakeMagicRefs 已硬编码）
 *   ② 物理位置推导: <projectDir>/<magicDir>/hooks/... 向上找以 . 开头的目录名
 *   ③ 推导失败 → failClosed（禁止猜测 adapter 名 / 禁止孤儿变量）
 */
export function resolveMagicDir(): string {
  const hit = tryResolveMagicDir()
  if (hit) return hit
  return failClosed(
    `magicDir 未注入且无法从物理位置推导: ${fileURLToPath(import.meta.url)}`
  )
}

/**
 * 非阻断版 magicDir 解析（唯一解析链的柔和变体）:
 * 与 resolveMagicDir 同一条链，但推导失败时返回 "" 而非 failClosed——
 * 供 vocabulary 等「文件缺失静默返回空」语义的调用方使用（对齐 bash：禁止猜测 adapter 名）。
 * find-up 语义（2026-08-14 Task 5.1 补齐）: 以当前文件为锚点向上找「以 . 开头的目录名」
 * （magicDir 约定形态），替代手写 for 循环——层级变动零漂移（对齐 src/shared/paths.ts 范式）。
 */
export function tryResolveMagicDir(): string {
  const injected = process.env.MAGIC_DIR
  if (injected) return injected
  const startDir = dirname(fileURLToPath(import.meta.url))
  // find-up v8 matcher 约定: 返回命中值（string）或 undefined（未命中）
  const hit = findUpSync((dir) => (basename(dir).startsWith(".") ? dir : undefined), {
    cwd: startDir,
    type: "directory",
  })
  return hit ? basename(hit) : ""
}

/**
 * PROJECT_DIR 统一解析: 注入优先；否则以 magicDir 为锚点向上查找其父目录（项目根）。
 * 失败 → failClosed（不猜测项目路径）。
 * find-up 语义（2026-08-14 Task 5.1 补齐）: 替代手写 for 循环，层级零漂移。
 */
export function resolveProjectDir(): string {
  const injected = process.env.PROJECT_DIR
  if (injected) return injected
  const magicDir = resolveMagicDir()
  const startDir = dirname(fileURLToPath(import.meta.url))
  const hit = findUpSync((dir) => (basename(dir) === magicDir ? dir : undefined), {
    cwd: startDir,
    type: "directory",
  })
  return hit ? dirname(hit) : failClosed("PROJECT_DIR 未注入且无法从物理位置推导")
}

// ── ADD 活跃 Plan 检测（对齐 bash common.sh query_plan_status / detect_active_add）──
//
// lifecycle 的唯一真相源是 scoped DB。短生命周期 Hook 不常驻 LISTEN；每次触发
// 都通过当前 adapter 生成态的机器桥（plan-status-bridge）调用 shared resolver。
// Handoff/add-route 不参与 active 裁决，禁止跨 adapter 或文件系统 fallback。

export interface PlanStatusResult {
  stdout: string
  exitCode: number
}

/**
 * 查询活跃 Plan 状态（对齐 bash query_plan_status）:
 *   - MAGIC_DIR 未注入 → STATUS_UNAVAILABLE（exitCode 3）——对齐 bash：
 *     未注入且无 HOOK_DIR 时直接放弃，不做物理推导（入口 hook 保证注入）
 *   - bridge 缺失 → STATUS_UNAVAILABLE（exitCode 3）
 *   - 否则 spawn `node --import tsx <magicDir>/scripts/plan-status-bridge.ts`
 */
export function queryPlanStatus(): PlanStatusResult {
  const magicDir = process.env.MAGIC_DIR
  if (!magicDir) {
    return {
      stdout: '{"availability":"STATUS_UNAVAILABLE","source":"database","reason":"magicDir 未注入且无法从物理位置推导"}',
      exitCode: 3,
    }
  }
  const bridge = join(
    process.env.PROJECT_DIR || process.cwd(),
    magicDir,
    "scripts",
    "plan-status-bridge.ts"
  )
  if (!existsSync(bridge)) {
    return {
      stdout: '{"availability":"STATUS_UNAVAILABLE","source":"database","reason":"plan-status bridge missing"}',
      exitCode: 3,
    }
  }
  const r = spawnSync("node", ["--import", "tsx", bridge], {
    encoding: "utf-8",
    timeout: 10_000,
  })
  return { stdout: r.stdout ?? "", exitCode: r.status ?? -1 }
}

/**
 * 活跃 Plan 检测（对齐 bash detect_active_add）:
 *   - bridge 失败 → "__STATUS_UNAVAILABLE__::<reason>::database::none::none"（调用方 fail-closed）
 *   - 非 READY/isActive → null（对齐 bash return 1）
 *   - 活跃 → "plan::done/total::approval::none::none"
 */
export function detectActiveAdd(): string | null {
  const r = queryPlanStatus()
  if (r.exitCode !== 0) {
    let reason = "database status unavailable"
    try {
      const parsed = JSON.parse(r.stdout) as { reason?: string }
      if (parsed.reason) reason = parsed.reason
    } catch {
      /* 非 JSON 输出 → 默认 reason */
    }
    return `__STATUS_UNAVAILABLE__::${reason}::database::none::none`
  }
  let snapshot: {
    availability?: string
    isActive?: boolean
    planName?: string
    approvalStatus?: string
    progress?: { doneTasks?: number; totalTasks?: number }
  }
  try {
    snapshot = JSON.parse(r.stdout) as typeof snapshot
  } catch {
    return null
  }
  if (!(snapshot.availability === "READY" && snapshot.isActive === true)) return null
  const done = snapshot.progress?.doneTasks ?? 0
  const total = snapshot.progress?.totalTasks ?? 0
  const approval = snapshot.approvalStatus ?? "none"
  return `${snapshot.planName}::${done}/${total}::${approval}::none::none`
}

// ── 时间格式（对齐 bash date 工具链）──

/** 对齐 bash `date -Iseconds`：本地时间 + 时区偏移（如 2026-08-14T11:15:41+08:00） */
export function localIsoSeconds(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  const offsetMin = -d.getTimezoneOffset()
  const sign = offsetMin >= 0 ? "+" : "-"
  const offAbs = Math.abs(offsetMin)
  const off = `${sign}${pad(Math.floor(offAbs / 60))}:${pad(offAbs % 60)}`
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${off}`
  )
}

// ── Dev Action 追踪（对齐 bash common.sh 标记文件管理）──

/** 项目 hash（对齐 bash echo "${PROJECT_DIR:-$PWD}" | md5sum | cut -c1-8：echo 含换行）——标记文件命名的唯一算法 */
export function projectHash(): string {
  try {
    // bash echo 输出带 \n，md5 对象为 dir + 换行
    return createHash("md5")
      .update(`${process.env.PROJECT_DIR || process.cwd()}\n`)
      .digest("hex")
      .slice(0, 8)
  } catch {
    return "default"
  }
}

const DEV_FLAG = `/tmp/add_dev_${projectHash()}`

export function markDevAction(): void {
  try {
    writeFileSync(DEV_FLAG, "")
  } catch {
    /* ignore */
  }
}

export function hasDevAction(): boolean {
  return existsSync(DEV_FLAG)
}

export function clearDevAction(): void {
  try {
    unlinkSync(DEV_FLAG)
  } catch {
    /* ignore */
  }
}

// ── 验收完整度检查（对齐 bash check_add_completeness）──

/** 检查 handoff + add-route 的验收完整度，返回问题列表（无问题 → 空数组） */
export function checkAddCompleteness(handoff: string, addRoute: string): string[] {
  const issues: string[] = []

  // devlog（内容已回流至 handoff，检查 handoff 是否含验收结果）
  if (handoff && existsSync(handoff)) {
    const content = readFileSync(handoff, "utf-8")
    if (!/验收|收敛|闭环|本轮改了什么|devlog/.test(content)) {
      issues.push("  [ ] devlog 缺失（handoff 无验收记录）")
    }
    const unchecked = (content.match(/\[ \]/g) || []).length
    if (unchecked > 0) {
      issues.push(`  [ ] handoff ${unchecked} 项未勾选`)
    }
  }

  // add-route Step
  if (addRoute && existsSync(addRoute)) {
    const content = readFileSync(addRoute, "utf-8")
    const unchecked = (content.match(/\[ \]/g) || []).length
    if (unchecked > 0) {
      issues.push(`  [ ] add-route ${unchecked} Step 未闭环`)
    }
  }
  return issues
}

/**
 * 验收幂等保护（对齐 bash is_already_accepted）:
 *   add-route Step 8 区段含 "[x].*验证并更新项目状态" 且 handoff 含验收字样 → 已验收。
 */
export function isAlreadyAccepted(addRoute: string, handoff: string): boolean {
  if (addRoute && existsSync(addRoute)) {
    const content = readFileSync(addRoute, "utf-8")
    const step8 = content.match(/Step 8[\s\S]{0,2000}/)?.[0] ?? ""
    if (/\[x\].*验证并更新项目状态/.test(step8)) {
      if (handoff && existsSync(handoff)) {
        const h = readFileSync(handoff, "utf-8")
        if (/✅.*验收|收敛|全部闭环|全部.*完成/.test(h)) {
          return true
        }
      }
    }
  }
  return false
}
