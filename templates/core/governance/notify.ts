// notify.ts — Hook 拦截事件写入 jsonl（bash 版 notify.sh 的 TS 同语义实现，零外部依赖）
// 用法: import 后在 exit 2 前调用 writeHookEvent
//
// 写入格式（7 字段 jsonl，真源 = hook-event-rules.toml）:
//   {"ts":"ISO8601","hook":"...","decision":"deny","cmd":"...","reason":"...","planKeyword":"...","planStatus":"..."}
//
// 磁盘管理（真源 = hook-event-rules.toml [event.file]）:
//   - 单文件 ≤256KB，超限轮转为 .old（覆盖，不累积多份）
//   - 总量 ≤512KB（当前 + 一个 .old）
//   - MCP Server 宕机不丢事件，重启后从文件恢复消费

import { existsSync, mkdirSync, renameSync, statSync, appendFileSync } from "node:fs"
import { join } from "node:path"
import { event, protocol } from "./rules.js"

/**
 * 写入 hook 事件（与 bash write_hook_event 逐字对齐）。
 * extra 为可选 JSON 片段（anchor_hit/struct_score/override 等），非空时以逗号拼接。
 * magicDirOverride 为可选参数（Task 8.1 AuditBridge 传入——默认 env.MAGIC_DIR 兜底声明真源，
 * Task 9.4 中立化: 兜底值从 hook-protocol-rules.toml [protocol.adapter_defaults] 读取，不锁死 .qoder）。
 */
export function writeHookEvent(
  hook: string,
  decision: string,
  cmd: string,
  reason: string,
  plan = "unknown",
  status = "none",
  extra = "",
  magicDirOverride?: string
): void {
  const defaults = protocol.adapter_defaults as { magic_dir_fallback?: string } | undefined
  const fallback = defaults?.magic_dir_fallback ?? ".qoder"
  const dir = join(magicDirOverride ?? (process.env.MAGIC_DIR || fallback), "reports")
  try {
    mkdirSync(dir, { recursive: true })
  } catch {
    /* mkdir 失败不阻断 */
  }
  const file = join(dir, "hook-events.jsonl")

  // 超过 rotate_bytes 自动轮转（真源: hook-event-rules.toml [event.file]）
  if (existsSync(file)) {
    let sz = 0
    try {
      sz = statSync(file).size
    } catch {
      sz = 0
    }
    if (sz > (event.file.rotate_bytes as number)) {
      try {
        renameSync(file, `${file}.old`)
      } catch {
        /* 轮转失败不阻断 */
      }
    }
  }

  // 时间格式对齐 bash: date -u +%Y-%m-%dT%H:%M:%SZ
  const ts = new Date().toISOString().replace(/\.\d+Z$/, "Z")
  const extraPart = extra ? `,${extra}` : ""
  const line =
    `{"ts":"${ts}","hook":"${hook}","decision":"${decision}","cmd":"${cmd}",` +
    `"reason":"${reason}","planKeyword":"${plan}","planStatus":"${status}"${extraPart}}\n`
  appendFileSync(file, line)
}
