#!/usr/bin/env tsx
// gen-contributors.ts — 贡献者墙生成器（声明式真源 → 生成 → 幂等校验）
//
// 真源：docs/contributors.toml（人工登记：生态贡献者 / 维护者 / 文案与排序无法自动判定）
// 产物：CONTRIBUTING.md 的头像墙、docs/ACKNOWLEDGEMENTS.md 的总览表（各由标记区间界定）
//
// 用法：
//   tsx scripts/gen-contributors.ts --write          # 写盘（npm run contributors）
//   tsx scripts/gen-contributors.ts --check          # 幂等校验，不写盘（npm run contributors:check，已随 npm test 跑）
//   tsx scripts/gen-contributors.ts --check --audit  # 追加「未登记提交作者」审计（npm run contributors:audit）
//
// 设计取舍：
//   - 默认**不联网、不读 git**：输出纯由真源派生 → 确定性、可在离线 / CI 无 token 环境稳定校验
//   - 提交作者审计（--audit）才读 `git log`，映射依据是真源里的 emails（邮箱无法反查 login，故不猜）
//   - 生成区只替换标记之间，墙的位置与周边正文永远不受生成器影响
import { execSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { parse } from "smol-toml"

export interface Contributor {
  login: string
  form: "maintainer" | "code" | "ecosystem" | "reporter"
  role: string
  cell: string
  summary: string
  emails?: string[]
  evidence?: string[]
  hidden?: boolean
  sort?: number
}

export interface Manifest {
  ignore_emails?: string[]
  person?: Contributor[]
}

export interface Target {
  file: string
  start: string
  end: string
  render: (persons: Contributor[]) => string
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
export const MANIFEST_PATH = join(ROOT, "docs/contributors.toml")

const WALL_START = "<!-- CONTRIBUTORS:WALL:START -->"
const WALL_END = "<!-- CONTRIBUTORS:WALL:END -->"
const TABLE_START = "<!-- CONTRIBUTORS:TABLE:START -->"
const TABLE_END = "<!-- CONTRIBUTORS:TABLE:END -->"

/** 读取真源（唯一事实源） */
export function readManifest(path = MANIFEST_PATH): Manifest {
  return parse(readFileSync(path, "utf-8")) as Manifest
}

/** 参与展示的人：按 sort 升序（并列时按 login 字典序，保证稳定输出），排除 hidden */
export function visiblePersons(manifest: Manifest): Contributor[] {
  return (manifest.person ?? [])
    .filter((p) => !p.hidden)
    .sort((a, b) => (a.sort ?? 999) - (b.sort ?? 999) || a.login.localeCompare(b.login))
}

function cellWidth(count: number): number {
  return Math.max(1, Math.floor(100 / count))
}

/** 头像墙（HTML 表格；GitHub 白名单属性：align/width/br/sub） */
export function renderWall(persons: Contributor[]): string {
  const total = persons.length + 1 // + 「你的位置」格
  const width = cellWidth(total)
  const cells = persons.map((p) => {
    const profile = `https://github.com/${p.login}`
    return [
      `    <td align="center" width="${width}%">`,
      `      <a href="${profile}"><img src="https://github.com/${p.login}.png?size=160" width="88" height="88" alt="@${p.login}" /></a><br/>`,
      `      <sub><b>@${p.login}</b></sub><br/>`,
      `      <sub>${p.cell}</sub>`,
      `    </td>`,
    ].join("\n")
  })
  cells.push(
    [
      `    <td align="center" width="${width}%">`,
      `      <a href="https://github.com/xiaomingming92/add-coder/issues"><img src="https://img.shields.io/badge/Issue%20%2F%20PR-welcome-2ea44f?style=flat-square" alt="Issue / PR welcome" /></a><br/>`,
      `      <sub><b>你的位置</b></sub><br/>`,
      `      <sub><a href="#核心开发规范必读">读过规范就能上</a></sub>`,
      `    </td>`,
    ].join("\n"),
  )
  return ["<table>", "  <tr>", ...cells, "  </tr>", "</table>"].join("\n")
}

/** 总览表（Markdown 表格；单元格里的竖线转义，避免表格断裂） */
export function renderTable(persons: Contributor[]): string {
  const esc = (s: string) => s.replace(/\|/g, "\\|")
  const rows = persons.map(
    (p) => `| [@${p.login}](https://github.com/${p.login}) | ${esc(p.role)} | ${esc(p.summary)} |`,
  )
  return ["| 贡献者 | 形态 | 明细 |", "|--------|------|------|", ...rows].join("\n")
}

export function targets(): Target[] {
  return [
    {
      file: join(ROOT, "CONTRIBUTING.md"),
      start: WALL_START,
      end: WALL_END,
      render: renderWall,
    },
    {
      file: join(ROOT, "docs/ACKNOWLEDGEMENTS.md"),
      start: TABLE_START,
      end: TABLE_END,
      render: renderTable,
    },
  ]
}

/** 把标记之间的内容替换为生成结果（标记本身保留；缺失标记 → 抛错并给出修复指引） */
export function renderFile(target: Target, persons: Contributor[], current: string): string {
  const startAt = current.indexOf(target.start)
  const endAt = current.indexOf(target.end)
  if (startAt < 0 || endAt < 0 || endAt < startAt) {
    throw new Error(
      `${target.file} 缺少生成标记：请补上 ${target.start} / ${target.end}（生成器只替换两者之间的内容）`,
    )
  }
  const head = current.slice(0, startAt + target.start.length)
  const tail = current.slice(endAt)
  return `${head}\n${target.render(persons)}\n${tail}`
}

/** 未登记的提交作者（依据真源 emails + ignore_emails；邮箱无法反查 login，故只报邮箱） */
export function unknownAuthors(manifest: Manifest): string[] {
  const known = new Set<string>(manifest.ignore_emails ?? [])
  for (const p of manifest.person ?? []) for (const e of p.emails ?? []) known.add(e)
  const seen = new Set<string>()
  const out = execSync("git log --all --format=%ae", { cwd: ROOT, encoding: "utf-8" })
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
  for (const email of out) if (!known.has(email)) seen.add(email)
  return [...seen].sort()
}

export interface RunResult {
  ok: boolean
  changed: string[]
  unknown: string[]
  messages: string[]
}

/** 生成 / 校验主流程 */
export function run(opts: { write: boolean; audit: boolean }): RunResult {
  const manifest = readManifest()
  const persons = visiblePersons(manifest)
  const changed: string[] = []
  const messages: string[] = []

  for (const target of targets()) {
    const current = readFileSync(target.file, "utf-8")
    const next = renderFile(target, persons, current)
    if (next !== current) {
      changed.push(target.file)
      if (opts.write) writeFileSync(target.file, next, "utf-8")
    }
  }

  const unknown = opts.audit ? unknownAuthors(manifest) : []
  if (opts.write && changed.length) messages.push(`已生成：${changed.map((f) => f.replace(ROOT + "/", "")).join("、")}`)
  if (!opts.write && changed.length) {
    messages.push(
      `生成区与真源不一致（共 ${changed.length} 个文件）：${changed.map((f) => f.replace(ROOT + "/", "")).join("、")}`,
      "修复：npm run contributors（改真源 docs/contributors.toml，勿手改生成区）",
    )
  }
  if (unknown.length) {
    messages.push(
      `发现未登记的提交作者邮箱（共 ${unknown.length} 个）：${unknown.join(", ")}`,
      "处理：在 docs/contributors.toml 登记（新增 [[person]] 或补 emails），或加入 ignore_emails",
    )
  }

  // 写盘模式：落盘成功即成功（未登记作者只作提示）；校验模式：生成区滞后或存在未登记作者即失败
  const ok = opts.write ? true : changed.length === 0 && unknown.length === 0
  return { ok, changed, unknown, messages }
}

function isMain(): boolean {
  const entry = process.argv[1]
  return !!entry && resolve(entry) === resolve(fileURLToPath(import.meta.url))
}

if (isMain()) {
  const args = process.argv.slice(2)
  const write = args.includes("--write")
  const check = args.includes("--check") || !write
  const audit = args.includes("--audit")
  const result = run({ write: !check, audit })
  for (const m of result.messages) console.log(m)
  if (result.ok) console.log(`✅ 贡献者墙与真源一致（${visiblePersons(readManifest()).length} 人）`)
  process.exit(result.ok ? 0 : 1)
}
