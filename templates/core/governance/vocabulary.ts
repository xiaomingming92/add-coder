// vocabulary.ts — 从 vocabulary markdown 表格加载触发词（bash 版 vocabulary.sh 的 TS 同语义实现）
// 单一数据源: {MAGIC_DIR}/vocabulary/add-governance-vocabulary.md §类别 A-F 表格
// 协议层契约（Review P1 #5）: 仅当前 magicDir scope；magicDir 解析统一委托 common.ts
// （tryResolveMagicDir——唯一解析链的柔和变体，禁止第二套探测，禁止跨端扫描与 .add fallback）
//
// 设计范式: 函数式——纯函数流式变换（read → inRange 过滤 → 表格解析 → 结构化条目），
// 内部结构化类型 TriggerEntry（泛型 parse 收敛字段切分），外部序列化对齐 bash "prio::regex::action" 契约。

import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { tryResolveMagicDir } from "./common.js"

/** 结构化触发词条目（内部类型；输出契约由 serializeTrigger 序列化） */
export interface TriggerEntry {
  /** P0/P1/P2 优先级 */
  readonly priority: string
  /** 触发词正则（已去反引号、' / ' → '|'、trim） */
  readonly regex: string
  /** 响应文本（trim） */
  readonly action: string
}

/** 输出契约序列化: 优先级::触发词正则::响应文本（:: 避免与触发词内的 | 冲突） */
export function serializeTrigger(e: TriggerEntry): string {
  return `${e.priority}::${e.regex}::${e.action}`
}

/** 纯函数：vocabulary 文件路径（magicDir 未注入且无法推导 → ""，调用方静默返回空） */
function vocabularyFile(): string {
  const magicDir = tryResolveMagicDir()
  if (!magicDir) return ""
  return join(
    process.env.PROJECT_DIR || process.cwd(),
    magicDir,
    "vocabulary",
    "add-governance-vocabulary.md"
  )
}

/**
 * 泛型表格行解析器：把 IFS='|' 切分的行映射为结构化结果。
 * 字段语义（对齐 bash while IFS='|' read -r _ prio raw_trigger action）:
 *   cells[1]=prio、cells[2]=raw_trigger、cells[3]=action（xargs 等价 trim）
 */
function mapTableRow<T>(line: string, map: (prio: string, rawTrigger: string, action: string) => T | null): T | null {
  const cells = line.split("|")
  const prio = cells[1]?.trim() ?? ""
  const rawTrigger = cells[2] ?? ""
  const action = cells[3]?.trim() ?? ""
  // trigger 归一化: 去反引号、' * / *' → '|'、trim（对齐 bash sed 链）
  const trigger = rawTrigger.replace(/`/g, "").replace(/ *\/ */g, "|").trim()
  if (!trigger) return null
  return map(prio, trigger, action)
}

/**
 * 加载触发词（对齐 bash load_triggers 的 sed 范围/grep 行过滤/while 解析）:
 *   - 范围: ^## 类别 A: 文档类型 至 ^## 类别 [G-Z]
 *   - 行过滤: ^| (P0|P1|P2) 
 * 文件缺失/路径不可判定 → 空数组（与 bash return 1 等价，静默不阻断）
 */
export function loadTriggers(): TriggerEntry[] {
  const file = vocabularyFile()
  if (!file || !existsSync(file)) return []
  const lines = readFileSync(file, "utf-8").split("\n")
  const out: TriggerEntry[] = []
  let inRange = false
  for (const line of lines) {
    if (/^## 类别 A: 文档类型/.test(line)) inRange = true
    if (/^## 类别 [G-Z]/.test(line)) inRange = false
    if (!inRange) continue
    if (!/^\| (P0|P1|P2) /.test(line)) continue
    const entry = mapTableRow(line, (priority, regex, action) => ({ priority, regex, action }))
    if (entry) out.push(entry)
  }
  return out
}

/** 开发关键词检测行判定（Layer 2/3 分流特征：超长 regex 含 修.?bug|fix.?bug） */
function isDevKeywordLine(regex: string): boolean {
  return /修\.?bug|fix\.?bug/i.test(regex)
}

/**
 * 匹配触发词（对齐 bash match_trigger）:
 *   - 跳过开发关键词检测行
 *   - 不区分大小写正则匹配 prompt → "[ADD 触发] ${regex} → ${action}"
 *   - 非法正则静默跳过（与 bash grep -E 行为对齐）
 */
export function matchTrigger(prompt: string): string[] {
  return loadTriggers().flatMap(({ regex, action }) => {
    if (isDevKeywordLine(regex)) return []
    try {
      return new RegExp(regex, "i").test(prompt) ? [`[ADD 触发] ${regex} → ${action}`] : []
    } catch {
      return []
    }
  })
}

/**
 * 加载开发关键词（对齐 bash load_dev_keywords）:
 *   只取包含"开发|改功能"的开发关键词检测行，输出其 regex
 */
export function loadDevKeywords(): string[] {
  return loadTriggers()
    .filter((e) => serializeTrigger(e).includes("开发|改功能"))
    .map((e) => e.regex)
}
