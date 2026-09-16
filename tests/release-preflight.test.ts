/*
 * 发版前置校验用例 — 事故复现：0.3.35 → 0.3.37 跳过 0.3.36（双重 bump）
 *
 * 纯逻辑用例（注入 deps，无网络、无真实仓库）：把"哪些状态必须拦住"钉成断言。
 * 关键的一条是把 2026-09-15 的真实状态（仓库 0.3.36 / registry 0.3.35 已发、随后 CI patch → 0.3.37）
 * 还原成测试输入 —— 若哪天有人再手工预 bump，这条用例会红。
 */
import { describe, expect, it } from "vitest"
import { compareSemver, runPreflight, type PreflightDeps } from "../scripts/release-preflight.js"

function deps(over: Partial<PreflightDeps> = {}): PreflightDeps {
  return {
    repoVersion: "0.3.37",
    srcHashVersion: "0.3.37",
    registryLatest: "0.3.37",
    tagExists: () => true,
    worktreeClean: () => true,
    ...over,
  }
}

const failed = (r: { checks: { ok: boolean; name: string }[] }): string[] =>
  r.checks.filter((c) => !c.ok).map((c) => c.name)

describe("release-preflight · 跨端不变量", () => {
  it("对齐状态（仓库 == registry == src-hash，tag 在）→ 放行", () => {
    const r = runPreflight(deps())
    expect(r.ok).toBe(true)
    expect(failed(r)).toEqual([])
  })

  it("手工预 bump（仓库 0.3.36 领先 registry 0.3.35）→ 拦截，并给出回退指引", () => {
    const r = runPreflight(deps({ repoVersion: "0.3.36", srcHashVersion: "0.3.36", registryLatest: "0.3.35" }))
    expect(r.ok).toBe(false)
    expect(failed(r)).toEqual(["① 仓库版本 == registry latest"])
    const c = r.checks.find((x) => !x.ok)
    expect(c?.detail).toContain("疑似手工 bump")
    expect(c?.fix).toContain("回退到 0.3.35")
  })

  it("事故原样复现：仓库 0.3.36（已手工 bump）+ CI patch 前的 registry 0.3.35 → 必须拦在 bump 之前", () => {
    // 若这条守卫当时在，0.3.36 就会由 CI 自己 bump 发布，而不是被 patch 成 0.3.37
    const r = runPreflight(deps({ repoVersion: "0.3.36", srcHashVersion: "0.3.36", registryLatest: "0.3.35" }))
    expect(r.ok).toBe(false)
    expect(r.checks[0].name).toBe("① 仓库版本 == registry latest")
  })

  it("手工 publish（registry 领先仓库）→ 拦截（双向拦截，不只看领先方向）", () => {
    const r = runPreflight(deps({ repoVersion: "0.3.37", srcHashVersion: "0.3.37", registryLatest: "0.3.38" }))
    expect(r.ok).toBe(false)
    expect(r.checks.find((c) => !c.ok)?.detail).toContain("疑似手工 publish")
  })

  it("registry 查询失败 → 拦截（不得当作通过）", () => {
    const r = runPreflight(deps({ registryLatest: null }))
    expect(r.ok).toBe(false)
    expect(r.checks.find((c) => !c.ok)?.detail).toContain("不得跳过")
  })

  it("仓库内部真源滞后（包 0.3.37 / src-hash 0.3.36，实测 tag 形态）→ 拦截", () => {
    const r = runPreflight(deps({ srcHashVersion: "0.3.36" }))
    expect(r.ok).toBe(false)
    expect(failed(r)).toEqual(["② package.json == src-hash._version"])
  })

  it("上一版 tag 缺失（手工 publish 的历史缺口：0.3.33/0.3.34 无 tag）→ 拦截并给出补 tag 指引", () => {
    const r = runPreflight(deps({ repoVersion: "0.3.34", srcHashVersion: "0.3.34", registryLatest: "0.3.34", tagExists: (t) => t !== "v0.3.34" }))
    expect(r.ok).toBe(false)
    const c = r.checks.find((x) => !x.ok)
    expect(c?.name).toBe("③ tag v0.3.34 存在")
    expect(c?.fix).toContain("git tag v0.3.34")
  })

  it("--worktree：工作区脏 → 仅在开启该检查时拦截", () => {
    const dirty = deps({ worktreeClean: () => false })
    expect(runPreflight(dirty).ok).toBe(true)
    const r = runPreflight(dirty, { requireWorktree: true })
    expect(r.ok).toBe(false)
    expect(failed(r)).toEqual(["④ 工作区干净"])
  })

  it("compareSemver：主/次/修订比较（含 prerelease 前缀截断）", () => {
    expect(compareSemver("0.3.37", "0.3.37")).toBe(0)
    expect(compareSemver("0.3.36", "0.3.35")).toBe(1)
    expect(compareSemver("0.3.35", "0.3.37")).toBe(-1)
    expect(compareSemver("0.4.0", "0.3.99")).toBe(1)
    expect(compareSemver("1.0.0", "0.3.37")).toBe(1)
    expect(compareSemver("0.3.37-rc.1", "0.3.37")).toBe(0)
  })
})
