import type { McpServer } from "@modelcontextprotocol/server"
import { join } from "path"
import { existsSync, watch, readFileSync, statSync } from "fs"
import { readFile } from "fs/promises"
import { PROJECT_ROOT, MAGIC_DIR } from "../shared/fs.js"
import { prisma } from "../shared/prisma.js"

// ── 类型定义 ──
interface HookEvent {
  ts: string
  hook: string
  decision: string
  cmd: string
  reason: string
  planKeyword: string
  planStatus: string
}

interface QueueState {
  events: HookEvent[]
  /** 文件 inode（检测轮转） */
  inode: number
  /** 文件已读字节数 */
  bytesRead: number
  /** flush 定时器 */
  timer: ReturnType<typeof setTimeout> | null
}

const REPORT_DIR = join(PROJECT_ROOT, MAGIC_DIR, "reports")
const JSONL_FILE = join(REPORT_DIR, "hook-events.jsonl")
const OVERFLOW_FILE = join(REPORT_DIR, "hook-events-overflow.jsonl")

// ── 内存缓冲队列 ──
const MAX_QUEUE = 50
let serverRef: McpServer | null = null

function createQueueState(): QueueState {
  const st = statSync(JSONL_FILE, { throwIfNoEntry: false })
  return {
    events: [],
    inode: st?.ino ?? 0,
    bytesRead: st?.size ?? 0,
    timer: null,
  }
}

const q: QueueState = createQueueState()

// ── jsonl 解析 ──
function parseJsonlLine(line: string): HookEvent | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  try {
    const obj = JSON.parse(trimmed) as HookEvent
    if (!obj.ts || !obj.hook) return null
    return obj
  } catch {
    return null
  }
}

// ── 去重 key ──
function dedupKey(e: HookEvent): string {
  return `${e.hook}::${e.ts}::${e.planKeyword}`
}

// ── 批量落库 ──
async function flushToDB(events: HookEvent[]): Promise<number> {
  if (events.length === 0) return 0
  const seen = new Set<string>()
  const unique = events.filter(e => {
    const k = dedupKey(e)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  if (unique.length === 0) return 0

  try {
    // 获取或创建 ai-assistant 用户
    const au = prisma.addUser as Record<string, (...a: unknown[]) => unknown>
    let userId: string
    try {
      const existing = await au.findUnique({ where: { username: "ai-assistant" }, select: { id: true } }) as { id: string } | null
      if (existing) {
        userId = existing.id
      } else {
        const created = await au.create({
          data: { id: "ai-assistant", username: "ai-assistant", email: "ai-assistant@internal" },
          select: { id: true },
        }) as { id: string }
        userId = created.id
      }
    } catch {
      userId = "ai-assistant"
    }

    const ops = prisma.devOperation as Record<string, (...a: unknown[]) => unknown>
    const data = unique.map(e => ({
      userId,
      action: "HOOK_INTERCEPT",
      targetType: e.hook,
      targetId: e.cmd.substring(0, 500),
      planKeyword: e.planKeyword,
      reason: `[${e.decision}] ${e.reason}`,
      afterState: JSON.stringify({ planStatus: e.planStatus }),
    }))

    await ops.createMany({ data })
    return unique.length
  } catch (err) {
    console.error("[hook-notify] flushToDB 失败:", err instanceof Error ? err.message : String(err))
    return 0
  }
}

// ── 消费溢出文件 ──
async function drainOverflowFile(): Promise<HookEvent[]> {
  const events: HookEvent[] = []
  try {
    if (!existsSync(OVERFLOW_FILE)) return events
    const content = await readFile(OVERFLOW_FILE, "utf-8")
    for (const line of content.split("\n")) {
      const ev = parseJsonlLine(line)
      if (ev) events.push(ev)
    }
    // 清空溢出文件
    const { writeFileSync } = await import("fs")
    writeFileSync(OVERFLOW_FILE, "", "utf-8")
  } catch {
    // 忽略，下次 flush 重试
  }
  return events
}

// ── 核心: flush ──
async function doFlush(): Promise<void> {
  // 1) drain 内存队列
  const memEvents = q.events.splice(0)
  // 2) drain 溢出文件
  const overflowEvents = await drainOverflowFile()
  // 3) 合并
  const allEvents = [...memEvents, ...overflowEvents]
  if (allEvents.length === 0) return

  const count = await flushToDB(allEvents)
  if (count > 0 && serverRef) {
    const noPlanCount = allEvents.filter(e => e.planKeyword === "no-active-plan").length
    const msg = `[Hook] ${count} 条拦截事件已审计落库（计划: ${[...new Set(allEvents.map(e => e.planKeyword))].join(", ")}）`
    serverRef.sendLoggingMessage({ level: "warning" as const, data: msg }).catch(() => {})
  }
}

// ── 入队 + 触发策略 ──
function enqueue(event: HookEvent): void {
  if (q.events.length >= MAX_QUEUE) {
    // 降级写入溢出文件
    try {
      const { appendFileSync } = require("fs") as typeof import("fs")
      appendFileSync(OVERFLOW_FILE, JSON.stringify(event) + "\n", "utf-8")
    } catch { /* 静默 */ }
    return
  }
  q.events.push(event)

  if (q.events.length >= MAX_QUEUE) {
    // 满 50 条立即 flush
    if (q.timer) { clearTimeout(q.timer); q.timer = null }
    void doFlush()
  } else if (!q.timer) {
    // 调度 2s 后 flush
    q.timer = setTimeout(() => {
      q.timer = null
      void doFlush()
    }, 2000)
  }
}

// ── fs.watch 回调 ──
function readNewLines(): void {
  try {
    const st = statSync(JSONL_FILE, { throwIfNoEntry: false })
    if (!st) return

    // 检测文件轮转（inode 变化或文件变小）
    if (st.ino !== q.inode || st.size < q.bytesRead) {
      q.inode = st.ino
      q.bytesRead = 0
    }

    if (st.size <= q.bytesRead) return

    // 只读增量部分
    const fd = require("fs").openSync(JSONL_FILE, "r")
    const buf = Buffer.alloc(st.size - q.bytesRead)
    require("fs").readSync(fd, buf, 0, buf.length, q.bytesRead)
    require("fs").closeSync(fd)

    const text = buf.toString("utf-8")
    for (const line of text.split("\n")) {
      const ev = parseJsonlLine(line)
      if (ev) enqueue(ev)
    }
    q.bytesRead = st.size
  } catch {
    // 文件可能被轮转删除，下次重试
  }
}

// ── 启动时全量扫描已有文件 ──
async function initialScan(): Promise<void> {
  const files = [JSONL_FILE, `${JSONL_FILE}.old`]
  for (const f of files) {
    if (!existsSync(f)) continue
    try {
      const content = await readFile(f, "utf-8")
      for (const line of content.split("\n")) {
        const ev = parseJsonlLine(line)
        if (ev) enqueue(ev)
      }
    } catch { /* skip */ }
  }
  // 初始化消费位点
  const st = statSync(JSONL_FILE, { throwIfNoEntry: false })
  if (st) {
    q.inode = st.ino
    q.bytesRead = st.size
  }
}

// ── 注册 ──
export function registerHookNotifications(server: McpServer) {
  serverRef = server

  // 启动通知
  server.sendLoggingMessage({
    level: "notice" as const,
    data: "ADD Hooks 治理卡位已激活，拦截事件将自动审计落库"
  }).catch(() => {})

  // 启动时扫描 + 建立 fs.watch
  void initialScan().then(() => {
    // 确保 jsonl 文件存在（fs.watch 要求文件已存在）
    try {
      const { mkdirSync, writeFileSync } = require("fs") as typeof import("fs")
      mkdirSync(REPORT_DIR, { recursive: true })
      if (!existsSync(JSONL_FILE)) writeFileSync(JSONL_FILE, "", "utf-8")
    } catch { /* ok */ }

    // 立即消费启动前已有事件
    void doFlush()

    // fs.watch 监听目录变化（文件可能后来才创建）
    try {
      watch(REPORT_DIR, (_event, filename) => {
        if (filename === "hook-events.jsonl" || filename === "hook-events.jsonl.old") {
          readNewLines()
        }
      })
    } catch { /* watch 可能不支持 */ }
  })

  // 进程退出时清空剩余队列
  const cleanup = () => { void doFlush() }
  process.on("exit", cleanup)
  process.on("SIGTERM", cleanup)
  process.on("SIGINT", cleanup)
}
