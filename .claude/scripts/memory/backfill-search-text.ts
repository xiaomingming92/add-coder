/*
 * backfill-search-text.ts — 存量记忆行的检索展开文本回填（真源，随模板分发到 `{magicDir}/scripts/memory/`）
 *
 * 为什么需要：`searchText` 是**写入期**产出的检索列（主通道索引建立在其 tsvector 表达式上）。
 * 本次升级之前写入的存量行该列为空 ⇒ 主通道对它们完全不可见（"旧数据检索不到"）。
 *
 * 三种模式：
 *   --probe    只统计与抽样，不改库；缺失为 0 时打印收敛结论
 *   --apply    分页回填；**只处理 searchText 为空串的行**（幂等：重复执行为 no-op）
 *   --refresh  重算**所有非空行**的 searchText（分词器/用户词典变更后把历史 token 统一到当前口径）
 * 失败行：打印清单（id + 原因）并以**非零退出码**结束；有失败/遗漏时**不写指纹标记**（避免假装同源）。
 *
 * 用法（工作目录 = 项目根）：
 *   PROJECT_ROOT=$PWD MAGIC_DIR=.codex DATABASE_URL="postgresql://…" \
 *   npx tsx "${MAGIC_DIR}/scripts/memory/backfill-search-text.ts" --probe|--apply [--refresh] [--limit N]
 */
const args = process.argv.slice(2)
const hasFlag = (n: string) => args.includes(n)
const argValue = (n: string) => {
  const i = args.indexOf(n)
  return i >= 0 ? args[i + 1] : undefined
}

const mode = hasFlag("--apply") ? "apply" : hasFlag("--probe") ? "probe" : null
const refresh = hasFlag("--refresh")
if (!mode) {
  console.error("usage: backfill-search-text.ts --probe|--apply [--refresh] [--limit N]")
  process.exit(2)
}
const pageSize = Number(argValue("--limit") ?? "500")

const { prisma } = await import("../mcp-server/shared/prisma.js")
const { expandForIndexWithMethod } = await import("../mcp-server/shared/memory/retrieval/cjk-segmenter.js")
const { computeFtsFingerprint, writeRecordedFingerprint } = await import(
  "../mcp-server/shared/memory/retrieval/fts-fingerprint.js"
)

/** 缺失 = searchText 为空串，且原始字段非空（原文为空的行本就不该有 token） */
const missingWhere = { searchText: "", NOT: { AND: [{ topic: "" }, { content: "" }] } }

async function probe(): Promise<void> {
  const missing = await prisma.addMemory.count({ where: missingWhere })
  const total = await prisma.addMemory.count()
  const sample = await prisma.addMemory.findMany({
    where: missingWhere,
    select: { id: true, topic: true, kind: true },
    take: 5,
  })
  console.log(JSON.stringify({ mode: "probe", total, missing, sample }, null, 2))
}

async function apply(): Promise<number> {
  let processed = 0
  const failures: { id: string; reason: string }[] = []
  for (;;) {
    // 动态 import 的 prisma client 不带类型信息 ⇒ 显式标注行类型（此处断言是必要的，不是冗余）
    const rows = (await prisma.addMemory.findMany({
      where: missingWhere,
      select: { id: true, topic: true, content: true },
      take: pageSize,
      orderBy: { id: "asc" },
    })) as { id: string; topic: string; content: string }[]
    if (rows.length === 0) break
    for (const row of rows) {
      try {
        const { text, method } = expandForIndexWithMethod(`${row.topic} ${row.content}`)
        if (!text) {
          failures.push({ id: row.id, reason: `展开为空（分词器=${method}）` })
          continue
        }
        await prisma.addMemory.update({ where: { id: row.id }, data: { searchText: text } })
        processed++
      } catch (error) {
        failures.push({ id: row.id, reason: error instanceof Error ? error.message : String(error) })
      }
    }
  }
  console.log(JSON.stringify({ mode: "apply", processed, failed: failures.length, failures: failures.slice(0, 20) }, null, 2))
  return failures.length
}

/** `--refresh`：重算所有非空行的 searchText（分词器固定后用它把历史 token 统一到当前口径） */
async function refreshAll(): Promise<number> {
  let scanned = 0
  const failures: { id: string; reason: string }[] = []
  for (;;) {
    const rows = (await prisma.addMemory.findMany({
      where: { NOT: { AND: [{ topic: "" }, { content: "" }] } },
      select: { id: true, topic: true, content: true, searchText: true },
      take: pageSize,
      orderBy: { id: "asc" },
      skip: scanned,
    })) as { id: string; topic: string; content: string; searchText: string }[]
    if (rows.length === 0) break
    for (const row of rows) {
      try {
        const { text } = expandForIndexWithMethod(`${row.topic} ${row.content}`)
        if (text !== row.searchText) {
          await prisma.addMemory.update({ where: { id: row.id }, data: { searchText: text } })
        }
      } catch (error) {
        failures.push({ id: row.id, reason: error instanceof Error ? error.message : String(error) })
      }
    }
    scanned += rows.length
  }
  console.log(JSON.stringify({ mode: "refresh", scanned, failed: failures.length, failures: failures.slice(0, 20) }, null, 2))
  return failures.length
}

const failures = mode === "probe" ? 0 : refresh ? await refreshAll() : await apply()
if (mode === "probe") await probe()
const stillMissing = await prisma.addMemory.count({ where: missingWhere })
console.log(JSON.stringify({ stillMissing }))

// 指纹标记写入：回填/刷新无失败且无遗漏时，"全部 searchText 均由当前分词器产出"这一事实才成立。
// 有失败/遗漏则**不写**（否则 probe 会永远提示"需重索引"，告警不可消除 = 噪音化）。
if (mode === "apply" && failures === 0 && stillMissing === 0) {
  const projectRoot = process.env.PROJECT_ROOT ?? process.cwd()
  const magicDir = process.env.MAGIC_DIR ?? ".codex"
  const path = writeRecordedFingerprint(projectRoot, magicDir, computeFtsFingerprint({ projectRoot, magicDir }))
  console.log(JSON.stringify({ fingerprintRecorded: path }))
} else if (mode === "apply") {
  console.log(JSON.stringify({ fingerprintRecorded: null, reason: "仍有失败/遗漏，不写指纹（避免假装同源）" }))
}

// 动态 import 的类型面不含 $disconnect ⇒ 显式取方法（此处断言必要）
const disconnect = (prisma as unknown as { $disconnect?: () => Promise<void> }).$disconnect
if (typeof disconnect === "function") await disconnect.call(prisma)
process.exit(failures > 0 ? 1 : 0)

export {} // 标记为 ES 模块（本文件用顶层 await，需显式 export 才会被 TS 当作 module）
