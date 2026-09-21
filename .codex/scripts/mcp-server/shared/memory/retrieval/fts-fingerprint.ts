// fts-fingerprint.ts — 记忆检索「分词器 + 词典」指纹（Plan 轮 2 Task 2.7 真源）
//
// 为什么在 templates 侧：指纹要同时被 **MCP 工具（get_memory_health）** 与 **CLI（memory:reindex --probe）** 消费，
// 而 templates 是随包分发的真源；`src/lib/memory-fts-fingerprint.ts` 只是面向仓根上下文的再导出。
//
// 语义：`searchText` 是写入期产出的 token 串。分词器实现或用户词典一变，历史行的 token 就与查询侧不同源
// —— 表现为"索引在、命中不了"，且**不报错**。指纹给出可判定信号：能否证明历史 token 与当前分词器同源。
//   ① jieba 版本（未装 → "bigram"）② 用户词典内容哈希（不存在 → "none"）③ tokenization 契约版本
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"

/** tokenization 规则（滑窗/过滤/上限/检索语义）变更时必须递增 */
export const TOKENIZATION_CONTRACT_VERSION = 1

export interface FtsFingerprint {
  value: string
  parts: { jieba: string; userDict: string; contract: number }
}

export function computeFtsFingerprint(input: {
  projectRoot: string
  magicDir: string
  jiebaVersion?: string | null
  userDictPath?: string
}): FtsFingerprint {
  const userDictPath =
    input.userDictPath ?? join(input.projectRoot, input.magicDir, "data", "jieba", "userdict.txt")
  let userDict = "none"
  if (existsSync(userDictPath)) {
    userDict = createHash("sha256").update(readFileSync(userDictPath)).digest("hex").slice(0, 12)
  }
  const jieba = input.jiebaVersion ?? detectJiebaVersion()
  const value = createHash("sha256")
    .update(`tokenization-v${TOKENIZATION_CONTRACT_VERSION}|${jieba ?? "bigram"}|${userDict}`)
    .digest("hex")
    .slice(0, 12)
  return { value, parts: { jieba: jieba ?? "bigram", userDict, contract: TOKENIZATION_CONTRACT_VERSION } }
}

/** 探测已安装的 jieba 版本；未安装 → null（表示走 bigram 兜底） */
export function detectJiebaVersion(): string | null {
  try {
    const req = createRequire(import.meta.url)
    const pkg = req("@node-rs/jieba/package.json") as { version?: string }
    return pkg.version ?? "unknown"
  } catch {
    return null
  }
}

export interface RecordedFingerprint {
  fingerprint: string
  recordedAt: string
  parts: FtsFingerprint["parts"]
}

export function fingerprintMarkerPath(projectRoot: string, magicDir: string): string {
  return join(projectRoot, magicDir, "memory", "fts-fingerprint.json")
}

export function readRecordedFingerprint(projectRoot: string, magicDir: string): RecordedFingerprint | null {
  const p = fingerprintMarkerPath(projectRoot, magicDir)
  if (!existsSync(p)) return null
  try {
    return JSON.parse(readFileSync(p, "utf-8")) as RecordedFingerprint
  } catch {
    return null
  }
}

export function writeRecordedFingerprint(
  projectRoot: string,
  magicDir: string,
  fingerprint: FtsFingerprint,
  now: Date = new Date(),
): string {
  const p = fingerprintMarkerPath(projectRoot, magicDir)
  mkdirSync(dirname(p), { recursive: true })
  const payload: RecordedFingerprint = {
    fingerprint: fingerprint.value,
    recordedAt: now.toISOString(),
    parts: fingerprint.parts,
  }
  writeFileSync(p, JSON.stringify(payload, null, 2) + "\n", "utf-8")
  return p
}

export interface FingerprintCheck {
  requiresReindex: boolean
  reason: string
  current: FtsFingerprint
  recorded: RecordedFingerprint | null
}

/**
 * 比对当前指纹与已记录指纹：
 * 未记录（首次部署/标记缺失）→ requiresReindex=true（历史 token 来源未知，不能假定同源）；
 * 不一致（jieba 版本/词典/契约变化）→ true + 差异明细；一致 → false。
 */
export function checkFtsFingerprint(projectRoot: string, magicDir: string): FingerprintCheck {
  const current = computeFtsFingerprint({ projectRoot, magicDir })
  const recorded = readRecordedFingerprint(projectRoot, magicDir)
  if (!recorded) {
    return { requiresReindex: true, reason: "未记录指纹（无法证明历史 searchText 与当前分词器同源）", current, recorded }
  }
  if (recorded.fingerprint !== current.value) {
    const diff = (["jieba", "userDict", "contract"] as const)
      .filter((k) => recorded.parts?.[k] !== current.parts[k])
      .map((k) => `${k}: ${String(recorded.parts?.[k])} → ${String(current.parts[k])}`)
      .join("; ")
    return { requiresReindex: true, reason: `指纹不一致（${diff}）`, current, recorded }
  }
  return { requiresReindex: false, reason: "指纹一致", current, recorded }
}
