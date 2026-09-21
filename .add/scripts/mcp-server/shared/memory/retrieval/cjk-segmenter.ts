/*
 * CJK 分词器（主通道 + 兜底）— Plan add-coder-memory-cjk-bigram-baseline 轮 4（人类裁决：完整上 jieba）
 *
 * 路线（与 farm-agent `src/lib/memory/cjk-segmenter.ts` 的 2026-09-18 人类裁定对齐）：
 *   ① **jieba 为主**：`@node-rs/jieba`（native，optionalDependency）+ 可选用户词典；
 *   ② **bigram 兜底**：`cjk-tokenize.ts`（纯函数、零依赖）——jieba 不可用时自动降级，**不是错误**。
 *
 * 为什么"主 + 兜底"而不是二选一：
 *   · jieba 给的是**词级 token**（IDF/BM25 才有判别力、索引不膨胀），但依赖原生二进制与词典版本；
 *   · bigram 是**地板**（1-2 字查询可索引、OOV 不惧、天然读写同源），但 token 数≈字符数、判别力弱；
 *   · add-coder 的 memory 代码**模板分发到六端用户项目**，native 依赖在 pnpm 严格布局 / 非主流平台可能根本装不上
 *     ⇒ 必须有一条"装不上也能跑"的路径，且**必须显式告知当前用的是哪条**（降级明示原则）。
 *
 * 契约：**写入侧与查询侧必须调用同一函数**（读写同源）；返回 `method` 供召回结果透出，
 * `method === "bigram"` 即视为降级，须能被 `get_memory_health` / recall 审计观察到。
 */
import { existsSync, readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { join } from "node:path"
import { MAGIC_DIR, PROJECT_ROOT } from "../../env.js"
import { expandForQuery, tokenize } from "./cjk-tokenize.js"

export type SegmentMethod = "jieba" | "bigram"

export interface SegmentResult {
  /** token 数组（与写入侧同一实现产出） */
  terms: string[]
  /** 实际使用的分词器：`jieba` = 主通道；`bigram` = 兜底（降级） */
  method: SegmentMethod
  /** 用户词典是否已加载（仅 jieba 路径有意义） */
  userDict?: boolean
}

/** 用户词典（可选注入）：每行一条术语，或 `术语 词频`（jieba 用户词典格式） */
export const USER_DICT_PATH = ["data", "jieba", "userdict.txt"] as const

interface JiebaLike {
  cut(text: string, hmm?: boolean): string[]
  cutForSearch(text: string, hmm?: boolean): string[]
}

let jieba: JiebaLike | null | undefined
let userDictLoaded = false
let loadFailureReason: string | null = null

/**
 * 构建实例：`@node-rs/jieba` v2 是 **class 形式** —— `Jieba.withDict(dict)`，
 * 内置词典在子路径 `@node-rs/jieba/dict`（`Uint8Array`）；v2 未暴露 `addWord`，
 * 故用户词典走「内置词典文本 + 追加用户行 → 合并 bytes」再 `withDict`。
 */
function buildJieba(req: NodeRequire): JiebaLike {
  const { Jieba } = req("@node-rs/jieba") as { Jieba: { withDict: (dict: Uint8Array) => JiebaLike } }
  const { dict } = req("@node-rs/jieba/dict") as { dict: Uint8Array }

  const userPath = join(PROJECT_ROOT, MAGIC_DIR, ...USER_DICT_PATH)
  if (existsSync(userPath)) {
    try {
      const userLines = readFileSync(userPath, "utf-8")
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith("#"))
      if (userLines.length > 0) {
        const baseDictPath = req.resolve("@node-rs/jieba/dict.txt") as string
        const merged = Buffer.concat([
          readFileSync(baseDictPath),
          Buffer.from("\n" + userLines.join("\n"), "utf8"),
        ])
        userDictLoaded = true
        return Jieba.withDict(new Uint8Array(merged))
      }
    } catch (error) {
      // 用户词典损坏 → 退回内置词典，但留下原因（禁止静默）
      loadFailureReason = `userdict 读取失败（已退回内置词典）: ${error instanceof Error ? error.message : String(error)}`
    }
  }
  return Jieba.withDict(dict)
}

function loadJieba(): JiebaLike | null {
  if (jieba !== undefined) return jieba
  try {
    // 同步加载语义：@node-rs/jieba 导出同步 `cut`；用 createRequire 避免顶层 await 影响调用方。
    // 注意：本模块是 ESM，**不能**用裸 `require`（运行时 ReferenceError 会被下面的 catch 吞掉 →
    //      即使 jieba 装好了也会永远走兜底），必须用 node:module 的 createRequire。
    const req = createRequire(import.meta.url)
    jieba = buildJieba(req)
  } catch (error) {
    // 装不上（未声明 / 平台不匹配 / pnpm 严格布局不可达）→ 兜底，不抛错
    jieba = null
    loadFailureReason = error instanceof Error ? error.message : String(error)
  }
  return jieba
}

/** jieba 不可用时的原因（诊断用；`get_memory_health` / 召回审计可透出） */
export function jiebaUnavailableReason(): string | null {
  return loadFailureReason
}

/**
 * 统一分词入口（**写入侧与查询侧都必须调它**）。
 * jieba 可用 → 词级 token；不可用或切分为空 → bigram 兜底。
 */
export function segmentForMatch(text: string): SegmentResult {
  const instance = loadJieba()
  if (instance) {
    try {
      const terms = instance
        // 检索场景用 `cutForSearch`：除整词外还产出子词（召回优先）
        .cutForSearch(text, true)
        .map((t) => t.trim().toLowerCase())
        // 噪声过滤（2026-09-21 实测修正）：
        //  · 必须含**字母/数字/CJK**——jieba 的 cutForSearch 会把 "：" "（" 这类标点也切出来，
        //    而 bigram 契约只匹配 CJK 连续段，两者若不一致就会让索引里塞满无意义 token；
        //  · 单字符拉丁（如 "地块A" 切出的 "a"）噪声大，丢弃；CJK 单字保留（与 bigram 契约一致）。
        .filter((t) => /[\p{L}\p{N}]/u.test(t) && !(t.length === 1 && /^[\x00-\x7f]$/.test(t)))
      if (terms.length > 0) {
        return { terms: [...new Set(terms)], method: "jieba", userDict: userDictLoaded }
      }
      loadFailureReason = "jieba 切分返回空结果，已走 bigram 兜底"
    } catch (error) {
      // 切分异常 → 落到兜底，但记录原因（禁止静默降级）
      loadFailureReason = `jieba 切分异常（已走 bigram 兜底）: ${error instanceof Error ? error.message : String(error)}`
    }
  }
  return { terms: tokenize(text), method: "bigram" }
}

/** 文档侧：展开为空格分隔 token 串（写入期落 `searchText`），并回报所用分词器 */
export function expandForIndexWithMethod(text: string): { text: string; method: SegmentMethod } {
  const { terms, method } = segmentForMatch(text)
  return { text: terms.join(" "), method }
}

/** 查询侧：token 数组（与 `expandForIndexWithMethod` 同一实现） */
export function expandForQueryWithMethod(query: string): SegmentResult {
  return segmentForMatch(query)
}

export { expandForQuery, tokenize }
