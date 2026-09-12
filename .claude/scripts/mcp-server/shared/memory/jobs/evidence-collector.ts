/*
 * Evidence 自动采集（Spec §10/§11，Plan §9.2 PostToolUse 行）
 *
 * 两段式：
 *  ① Hook 侧（同步 ≤200ms，无 DB）：白名单判定 + 事件入队（evidence-queue.jsonl append-only）
 *     —— classifyEvidenceSource / buildEvidenceEvent 为纯函数，供 post-tool-router 直接引用
 *  ② Job 侧（异步，可重试）：drainEvidenceQueue 消费队列 → upsert Evidence（幂等键
 *     repositoryRef+sourceType+sourceRef+contentHash，与 add.prisma @@unique 一一对应）
 *     消费进度落 evidence-queue.offset（字节偏移），重放幂等：同偏移不重复处理，
 *     同事件重复消费由 upsert 幂等吸收。
 */
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, openSync, readFileSync, readSync, closeSync, statSync, writeFileSync, renameSync } from "node:fs"
import { dirname, join } from "node:path"
import type { AddMemoryEvidenceRow, TableDelegate } from "../../db-types.js"
import { EVIDENCE_OFFSET_FILE, EVIDENCE_QUEUE_FILE, MEMORY_DIR_NAME } from "../switches.js"

// ── ① Hook 侧纯函数（无 IO 之外的依赖，无 DB） ──

export type EvidenceSourceType = "PLAN" | "SPEC" | "HANDOFF" | "DEV_OPERATION"

export interface EvidenceEvent {
  dedupKey: string
  sourceType: EvidenceSourceType
  sourceRef: string
  excerpt: string
  occurredAt: string
}

/** 白名单分类：命中返回 sourceType，未命中返回 null（spec §10：按白名单采集） */
export function classifyEvidenceSource(filePath: string): EvidenceSourceType | null {
  const p = filePath.replace(/\\/g, "/")
  if (/(^|\/)plans\/[^/]*-plan-v\d+\.md$/.test(p)) return "PLAN"
  if (/(^|\/)plans\/[^/]*-add-route-v\d+\.md$/.test(p)) return "PLAN"
  if (/(^|\/)specs\/.+\.md$/.test(p)) return "SPEC"
  if (/handoff[^/]*\.md$/i.test(p)) return "HANDOFF"
  if (/(^|\/)reviews\/.+\.md$/.test(p)) return "DEV_OPERATION"
  return null
}

/** 构造采证事件（幂等 key = sha256(sourceType|sourceRef|excerpt)）：同文件同内容重复写入被吸收 */
export function buildEvidenceEvent(filePath: string, excerpt: string, occurredAt = new Date()): EvidenceEvent {
  const sourceType = classifyEvidenceSource(filePath)
  if (!sourceType) throw new Error(`非白名单路径: ${filePath}`)
  const sourceRef = filePath
  const dedupKey = createHash("sha256")
    .update(`${sourceType}|${sourceRef}|${excerpt}`, "utf8")
    .digest("hex")
    .slice(0, 32)
  return { dedupKey, sourceType, sourceRef, excerpt: excerpt.slice(0, 500), occurredAt: occurredAt.toISOString() }
}

// ── ② Job 侧消费（异步、可重试） ──

export interface DrainDeps {
  projectDir: string
  magicDir: string
  repositoryRef: string
  evidenceDb: Pick<TableDelegate<AddMemoryEvidenceRow>, "upsert">
}

export interface DrainResult {
  processed: number
  skipped: number
  errors: string[]
  newOffset: number
}

/** 读 offset 标记（缺失/损坏 → 0，从头重放；upsert 幂等保证安全） */
export function readOffset(projectDir: string, magicDir: string): number {
  try {
    const f = join(projectDir, magicDir, MEMORY_DIR_NAME, EVIDENCE_OFFSET_FILE)
    if (!existsSync(f)) return 0
    const n = Number(readFileSync(f, "utf-8").trim())
    return Number.isFinite(n) && n >= 0 ? n : 0
  } catch {
    return 0
  }
}

/**
 * 消费 evidence 队列：从上次偏移继续，逐行 upsert Evidence。
 * fail-open 粒度到行：坏行跳过并计入 errors，不阻塞后续。
 */
export async function drainEvidenceQueue(deps: DrainDeps): Promise<DrainResult> {
  const queueFile = join(deps.projectDir, deps.magicDir, MEMORY_DIR_NAME, EVIDENCE_QUEUE_FILE)
  const result: DrainResult = { processed: 0, skipped: 0, errors: [], newOffset: readOffset(deps.projectDir, deps.magicDir) }
  if (!existsSync(queueFile)) return result

  const size = (() => { try { return statSync(queueFile).size } catch { return 0 } })()
  if (size <= result.newOffset) return result // 无增量

  // 按偏移读取增量字节（避免大文件全量加载）
  const fd = openSync(queueFile, "r")
  let chunk: string
  try {
    const buf = Buffer.alloc(size - result.newOffset)
    readSync(fd, buf, 0, buf.length, result.newOffset)
    chunk = buf.toString("utf-8")
  } finally {
    closeSync(fd)
  }

  let cursor = result.newOffset
  for (const line of chunk.split("\n")) {
    const lineBytes = Buffer.byteLength(line, "utf-8") + 1 // + '\n'
    cursor += lineBytes
    const trimmed = line.trim()
    if (!trimmed) continue
    let ev: EvidenceEvent
    try {
      ev = JSON.parse(trimmed) as EvidenceEvent
    } catch {
      result.skipped++
      result.errors.push(`坏行@${cursor - lineBytes}: JSON 解析失败`)
      continue
    }
    try {
      await deps.evidenceDb.upsert({
        where: {
          repositoryRef_sourceType_sourceRef_contentHash: {
            repositoryRef: deps.repositoryRef,
            sourceType: ev.sourceType,
            sourceRef: ev.sourceRef,
            contentHash: ev.dedupKey,
          },
        },
        create: {
          repositoryRef: deps.repositoryRef,
          sourceType: ev.sourceType,
          sourceRef: ev.sourceRef,
          excerpt: ev.excerpt,
          contentHash: ev.dedupKey,
          occurredAt: new Date(ev.occurredAt),
        } as Partial<AddMemoryEvidenceRow>,
        update: {},
      })
      result.processed++
    } catch (e) {
      result.skipped++
      result.errors.push(`落库失败 ${ev.sourceRef}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // 原子推进 offset（先写后改：offset 落后只会重放，upsert 幂等吸收）
  result.newOffset = cursor
  const offsetFile = join(deps.projectDir, deps.magicDir, MEMORY_DIR_NAME, EVIDENCE_OFFSET_FILE)
  mkdirSync(dirname(offsetFile), { recursive: true })
  const tmp = `${offsetFile}.tmp-${process.pid}`
  writeFileSync(tmp, String(cursor), "utf-8")
  renameSync(tmp, offsetFile)
  return result
}
