/*
 * Memory 子系统发布开关（Spec §10，Plan §9.3）
 *
 * 约束：governance Hook（同步 spawn 子进程，≤200ms 预算）与 jobs（异步）共用本模块，
 * 因此全部函数必须是同步、纯环境变量读取，禁止任何 IO/DB 访问。
 *
 * 开关：
 * - ADD_MEMORY_RECALL_MODE = off | shadow | inject（默认 shadow：召回可执行并落审计，但 Hook 不注入上下文）
 * - ADD_MEMORY_MAX_TOKENS：L1 注入 token 预算（默认 600）
 * - ADD_MEMORY_EVIDENCE = off | on（默认 on：PostToolUse 白名单采证入队）
 */

export type RecallMode = "off" | "shadow" | "inject"

export function recallMode(env: NodeJS.ProcessEnv = process.env): RecallMode {
  const v = (env.ADD_MEMORY_RECALL_MODE ?? "shadow").toLowerCase()
  return v === "off" || v === "inject" ? v : "shadow"
}

export function memoryMaxTokens(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.ADD_MEMORY_MAX_TOKENS ?? 600)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 600
}

export function evidenceEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.ADD_MEMORY_EVIDENCE ?? "on").toLowerCase() !== "off"
}

/** 记忆工作目录（快照 + 事件队列所在）：${magicDir}/memory/ */
export const MEMORY_DIR_NAME = "memory"
/** L1/L2 快照文件名 */
export const L1_SNAPSHOT_FILE = "l1-context.md"
export const L2_SNAPSHOT_FILE = "l2-context.md"
/** PostToolUse 采证事件队列（jsonl，append-only，由 consolidation job 消费） */
export const EVIDENCE_QUEUE_FILE = "evidence-queue.jsonl"
/** evidence 队列消费进度标记（已处理字节偏移） */
export const EVIDENCE_OFFSET_FILE = "evidence-queue.offset"
/** L1 快照新鲜度上限（毫秒，默认 7 天）：过期不注入 */
export const L1_SNAPSHOT_TTL_MS = 7 * 24 * 60 * 60 * 1000
