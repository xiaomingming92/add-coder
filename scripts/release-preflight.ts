// release-preflight.ts — 发版前置校验（CI 与本地共用的单一真源）
//
// 为什么需要它（2026-09-15 事故复盘）：0.3.35 → 0.3.37 直接跳过 0.3.36。
// 根因是**双重 bump**：仓库被手工预 bump 到 0.3.36，随后 `release.yml` 又按 patch 规则
// `npm version patch`（0.3.36 → 0.3.37）并发布 —— 0.3.36 只活在仓库里，从未上 npm。
// 原有的"发布不变量"只比对**仓库内部**（package.json vs src-hash），挡不住"仓库 vs registry"漂移。
//
// 本文件把跨端不变量固化为四条（全部通过才允许发版）：
//   ① 仓库版本 == registry latest  —— 双向拦截：手工 bump（仓库领先）/ 手工 publish（registry 领先）
//   ② package.json == src-hash._version —— 防 tag 指向的提交里真源滞后一版
//   ③ tag v<版本> 已存在 —— 防"上一个版本不是经 CI 发布"
//   ④ 工作区干净（可选：--worktree，本地建议开，CI 上由前置步骤自行归零）
//
// 用法：
//   npx tsx scripts/release-preflight.ts            # CI：断言 ①②③
//   npx tsx scripts/release-preflight.ts --worktree # 本地：追加 ④
// 纯逻辑与 IO 分离：runPreflight 只吃注入的 deps，用例无需网络与真实仓库。

import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { runCommand } from "../src/lib/run-command.js"

export interface PreflightCheck {
  name: string
  ok: boolean
  detail: string
  /** 失败时的可操作修复指引 */
  fix: string
}

export interface PreflightDeps {
  /** 仓库 package.json 版本 */
  repoVersion: string
  /** templates/.add-coder-src-hash.json 的 _version */
  srcHashVersion: string
  /** registry 上的 latest；null = 查询失败（不得当作"通过"） */
  registryLatest: string | null
  /** tag v<version> 是否存在 */
  tagExists: (tag: string) => boolean
  /** 工作区是否干净（仅 --worktree 时消费） */
  worktreeClean?: () => boolean
}

export interface PreflightOptions {
  requireWorktree?: boolean
}

/** semver 比较（仅主/次/修订，用于判定"领先/落后"） */
export function compareSemver(a: string, b: string): number {
  const pa = a.split("-")[0].split(".").map((n) => parseInt(n, 10) || 0)
  const pb = b.split("-")[0].split(".").map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0) ? 1 : -1
  }
  return 0
}

export function runPreflight(deps: PreflightDeps, opts: PreflightOptions = {}): { ok: boolean; checks: PreflightCheck[] } {
  const checks: PreflightCheck[] = []
  const v = deps.repoVersion

  // ① 仓库 ↔ registry 一致
  if (!deps.registryLatest) {
    checks.push({
      name: "① 仓库版本 == registry latest",
      ok: false,
      detail: "无法查询 registry latest（网络失败或包名错误）——不得跳过该断言",
      fix: "本地执行 `npm view add-coder version` 确认网络与包名后重试",
    })
  } else {
    const cmp = compareSemver(v, deps.registryLatest)
    checks.push(
      cmp === 0
        ? { name: "① 仓库版本 == registry latest", ok: true, detail: `${v} == ${deps.registryLatest}`, fix: "" }
        : {
            name: "① 仓库版本 == registry latest",
            ok: false,
            detail:
              cmp > 0
                ? `仓库 ${v} 领先 registry ${deps.registryLatest}：疑似手工 bump（CI 是唯一 bump 入口）`
                : `仓库 ${v} 落后 registry ${deps.registryLatest}：疑似手工 publish（或 registry 已由他处发布）`,
            fix:
              cmp > 0
                ? `把 package.json 回退到 ${deps.registryLatest}（撤销手工 bump 提交），改由 release.yml 的 bump 选项决定下一版`
                : `先对齐仓库版本到 ${deps.registryLatest}（cherry-pick/同步已在 registry 的提交），再走 release.yml`,
          },
    )
  }

  // ② 仓库内部：包版本 == 模板真源版本
  checks.push(
    deps.srcHashVersion === v
      ? { name: "② package.json == src-hash._version", ok: true, detail: `${v} == ${deps.srcHashVersion}`, fix: "" }
      : {
          name: "② package.json == src-hash._version",
          ok: false,
          detail: `package.json=${v} 而模板真源=${deps.srcHashVersion}`,
          fix: "npx tsx scripts/gen-src-hash.ts 后一起提交（release.yml 的 bump 步骤已内联）",
        },
  )

  // ③ 上一版 tag 必须存在（证明上一版是经 CI 发布）
  const tag = `v${v}`
  checks.push(
    deps.tagExists(tag)
      ? { name: `③ tag ${tag} 存在`, ok: true, detail: `${tag} 已在本地 tags 中`, fix: "" }
      : {
          name: `③ tag ${tag} 存在`,
          ok: false,
          detail: `tag ${tag} 不存在：上一个版本不是经 CI 发布（可能手工 publish）`,
          fix: `在对应 bump 提交上补 tag：git tag ${tag} <commit> && git push origin ${tag}（补历史缺口后再发版）`,
        },
  )

  // ④ 工作区干净（可选）
  if (opts.requireWorktree) {
    const clean = deps.worktreeClean?.() ?? true
    checks.push(
      clean
        ? { name: "④ 工作区干净", ok: true, detail: "无未提交改动", fix: "" }
        : { name: "④ 工作区干净", ok: false, detail: "存在未提交改动", fix: "先提交或 stash，再发版" },
    )
  }

  return { ok: checks.every((c) => c.ok), checks }
}

// ────────────────────────── CLI 外壳（IO 注入点） ──────────────────────────

function readJson(rel: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(process.cwd(), rel), "utf-8")) as Record<string, unknown>
}

function main(): void {
  const requireWorktree = process.argv.includes("--worktree")
  const pkg = readJson("package.json")
  const repoVersion = String(pkg.version ?? "")
  const pkgName = String(pkg.name ?? "")
  const srcHash = readJson("templates/.add-coder-src-hash.json")
  const srcHashVersion = String(srcHash._version ?? "")

  const registry = runCommand("npm", ["view", pkgName, "version"], { cwd: process.cwd(), timeout: 60000 })
  const registryLatest = registry.status === 0 ? String(registry.stdout ?? "").trim() || null : null

  const deps: PreflightDeps = {
    repoVersion,
    srcHashVersion,
    registryLatest,
    tagExists: (tag) => runCommand("git", ["rev-parse", "-q", "--verify", `refs/tags/${tag}`], { cwd: process.cwd(), timeout: 15000 }).status === 0,
    worktreeClean: () => (runCommand("git", ["status", "--porcelain"], { cwd: process.cwd(), timeout: 15000 }).stdout ?? "").trim() === "",
  }

  const { ok, checks } = runPreflight(deps, { requireWorktree })
  console.log(`=== 发版前置校验（${pkgName} ${repoVersion}）===`)
  for (const c of checks) {
    console.log(`${c.ok ? "✅" : "❌"} ${c.name} — ${c.detail}`)
    if (!c.ok && c.fix) console.log(`   ↳ 修复：${c.fix}`)
  }
  if (!ok) {
    console.error("发版前置校验未通过：**禁止手工 bump / 手工 publish**，请按上面的修复指引对齐后由 release.yml 统一发版")
    process.exit(1)
  }
  console.log("✅ 全部通过：可以发版（release.yml 将执行 bump → 打 tag → publish）")
}

const invokedDirectly = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (invokedDirectly) main()
