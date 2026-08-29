/*
 * 轮次 4 Hook 闭环测试（Spec §10 / Plan §9.3）
 *
 * 覆盖：
 * - ADD_MEMORY_RECALL_MODE 三态（off/shadow/inject）行为
 * - session-start-guard L1 快照注入：新鲜度、token 预算截断、fail-open
 * - prompt-router 显式回忆意图提示（补充入口）
 * - post-tool-router 白名单采证入队 + dedupKey 幂等
 * - drainEvidenceQueue 偏移推进/重放幂等/坏行跳过
 * - runConsolidation 单步故障隔离
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync, appendFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"

import { recallMode, memoryMaxTokens, evidenceEnabled, MEMORY_DIR_NAME, L1_SNAPSHOT_FILE, EVIDENCE_QUEUE_FILE, EVIDENCE_OFFSET_FILE } from "../../templates/core/scripts/mcp-server/shared/memory/switches.js"
import { classifyEvidenceSource, buildEvidenceEvent, drainEvidenceQueue, readOffset } from "../../templates/core/scripts/mcp-server/shared/memory/jobs/evidence-collector.js"
import { runConsolidation } from "../../templates/core/scripts/mcp-server/shared/memory/jobs/consolidation.js"
import { SessionStartGuard } from "../../templates/core/governance/session-start-guard.js"
import { PromptRouter } from "../../templates/core/governance/prompt-router.js"
import { PostToolRouter } from "../../templates/core/governance/post-tool-router.js"

let tmp: string
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "mem-hooks-"))
  vi.stubEnv("MAGIC_DIR", ".codex")
  vi.stubEnv("ADD_MEMORY_RECALL_MODE", "shadow")
  vi.stubEnv("ADD_MEMORY_EVIDENCE", "on")
  vi.stubEnv("ADD_MEMORY_MAX_TOKENS", "600")
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  rmSync(tmp, { recursive: true, force: true })
})

function captureStdout() {
  const out: string[] = []
  vi.spyOn(process.stdout, "write").mockImplementation(((chunk: unknown) => {
    out.push(String(chunk))
    return true
  }) as never)
  return out
}

// 子类暴露 protected 扩展点
class TestSessionGuard extends SessionStartGuard {
  public callL1() { this.emitMemoryL1() }
}
class TestPromptRouter extends PromptRouter {
  public callHint(prompt: string) { this.maybeMemoryHint(prompt) }
}
class TestPostToolRouter extends PostToolRouter {
  public callEvidence(filePath: string) { this.emitMemoryEvidence(filePath) }
}

const SNAPSHOT = `[Memory L1 · 来源: AddMemory 治理库 · 生成于 2026-08-20T00:00:00.000Z]\n<agent-memory source="add-memory" trust="governed">\n- [DECISION] 迁移引擎（置信 0.90）\n  仓库使用 Atlas 做版本化迁移\n</agent-memory>\n`

function writeSnapshot(content = SNAPSHOT, ageMs = 0): string {
  const dir = join(tmp, ".codex", MEMORY_DIR_NAME)
  mkdirSync(dir, { recursive: true })
  const file = join(dir, L1_SNAPSHOT_FILE)
  writeFileSync(file, content, "utf-8")
  if (ageMs > 0) {
    const t = new Date(Date.now() - ageMs)
    utimesSync(file, t, t)
  }
  return file
}

describe("switches 三态", () => {
  it("RECALL_MODE 解析：off/shadow/inject，非法值回落 shadow", () => {
    expect(recallMode({ ADD_MEMORY_RECALL_MODE: "off" } as never)).toBe("off")
    expect(recallMode({ ADD_MEMORY_RECALL_MODE: "inject" } as never)).toBe("inject")
    expect(recallMode({ ADD_MEMORY_RECALL_MODE: "garbage" } as never)).toBe("shadow")
    expect(recallMode({} as never)).toBe("shadow") // 默认 shadow
  })
  it("MAX_TOKENS 默认 600，非法值回落", () => {
    expect(memoryMaxTokens({} as never)).toBe(600)
    expect(memoryMaxTokens({ ADD_MEMORY_MAX_TOKENS: "1200" } as never)).toBe(1200)
    expect(memoryMaxTokens({ ADD_MEMORY_MAX_TOKENS: "abc" } as never)).toBe(600)
  })
  it("EVIDENCE 默认 on，off 关闭", () => {
    expect(evidenceEnabled({} as never)).toBe(true)
    expect(evidenceEnabled({ ADD_MEMORY_EVIDENCE: "off" } as never)).toBe(false)
  })
})

describe("session-start-guard L1 注入", () => {
  it("off 模式：快照存在也不输出", () => {
    vi.stubEnv("ADD_MEMORY_RECALL_MODE", "off")
    writeSnapshot()
    const out = captureStdout()
    new TestSessionGuard(tmp).callL1()
    expect(out.join("")).toBe("")
  })
  it("shadow 模式：仅提示快照存在，不注入正文", () => {
    const file = writeSnapshot()
    const out = captureStdout()
    new TestSessionGuard(tmp).callL1()
    const text = out.join("")
    expect(text).toContain("shadow 模式未注入")
    expect(text).toContain(file)
    expect(text).not.toContain("<agent-memory")
  })
  it("inject 模式：注入带来源边界标签的快照", () => {
    vi.stubEnv("ADD_MEMORY_RECALL_MODE", "inject")
    writeSnapshot()
    const out = captureStdout()
    new TestSessionGuard(tmp).callL1()
    expect(out.join("")).toContain("<agent-memory")
    expect(out.join("")).toContain("DECISION")
  })
  it("inject 模式：过期快照（>7 天）不注入", () => {
    vi.stubEnv("ADD_MEMORY_RECALL_MODE", "inject")
    writeSnapshot(SNAPSHOT, 8 * 24 * 3600 * 1000)
    const out = captureStdout()
    new TestSessionGuard(tmp).callL1()
    expect(out.join("")).toBe("")
  })
  it("inject 模式：超预算截断并附显式标记", () => {
    vi.stubEnv("ADD_MEMORY_RECALL_MODE", "inject")
    vi.stubEnv("ADD_MEMORY_MAX_TOKENS", "10")
    writeSnapshot()
    const out = captureStdout()
    new TestSessionGuard(tmp).callL1()
    expect(out.join("")).toContain("已截断")
  })
  it("fail-open：快照不存在/目录损坏不抛异常", () => {
    const out = captureStdout()
    expect(() => new TestSessionGuard(tmp).callL1()).not.toThrow()
    expect(out.join("")).toBe("")
  })
})

describe("prompt-router 回忆意图提示", () => {
  it("回忆词命中 → 输出 recall_memory 调用建议", () => {
    const out = captureStdout()
    new TestPromptRouter(".codex").callHint("我们上次是怎么处理迁移的？")
    expect(out.join("")).toContain("recall_memory")
    expect(out.join("")).toContain("shadow")
  })
  it("off 模式：不提示", () => {
    vi.stubEnv("ADD_MEMORY_RECALL_MODE", "off")
    const out = captureStdout()
    new TestPromptRouter(".codex").callHint("之前的方案是什么？")
    expect(out.join("")).toBe("")
  })
  it("非回忆词：不提示", () => {
    const out = captureStdout()
    new TestPromptRouter(".codex").callHint("帮我写一个新功能")
    expect(out.join("")).toBe("")
  })
})

describe("post-tool-router 白名单采证", () => {
  it("白名单路径 → evidence-queue.jsonl 追加事件", () => {
    const docPath = join(tmp, ".codex", "plans", "x-plan-v1.md")
    mkdirSync(dirname(docPath), { recursive: true })
    writeFileSync(docPath, "# Plan\n内容", "utf-8")
    captureStdout()
    new TestPostToolRouter(tmp, ".codex").callEvidence(docPath)
    const queue = join(tmp, ".codex", MEMORY_DIR_NAME, EVIDENCE_QUEUE_FILE)
    expect(existsSync(queue)).toBe(true)
    const lines = readFileSync(queue, "utf-8").trim().split("\n")
    expect(lines).toHaveLength(1)
    const ev = JSON.parse(lines[0])
    expect(ev.sourceType).toBe("PLAN")
    expect(ev.sourceRef).toBe(docPath)
  })
  it("同文件同内容重复 emit → dedupKey 相同（job 侧 upsert 吸收）", () => {
    const docPath = join(tmp, ".codex", "specs", "s", "spec.md")
    mkdirSync(dirname(docPath), { recursive: true })
    writeFileSync(docPath, "# Spec", "utf-8")
    captureStdout()
    const router = new TestPostToolRouter(tmp, ".codex")
    router.callEvidence(docPath)
    router.callEvidence(docPath)
    const lines = readFileSync(join(tmp, ".codex", MEMORY_DIR_NAME, EVIDENCE_QUEUE_FILE), "utf-8").trim().split("\n")
    expect(lines).toHaveLength(2)
    expect(JSON.parse(lines[0]).dedupKey).toBe(JSON.parse(lines[1]).dedupKey)
  })
  it("非白名单路径 → 不入队", () => {
    const srcPath = join(tmp, "src", "index.ts")
    mkdirSync(dirname(srcPath), { recursive: true })
    writeFileSync(srcPath, "export {}", "utf-8")
    captureStdout()
    new TestPostToolRouter(tmp, ".codex").callEvidence(srcPath)
    expect(existsSync(join(tmp, ".codex", MEMORY_DIR_NAME, EVIDENCE_QUEUE_FILE))).toBe(false)
  })
  it("ADD_MEMORY_EVIDENCE=off → 不入队", () => {
    vi.stubEnv("ADD_MEMORY_EVIDENCE", "off")
    const docPath = join(tmp, ".codex", "plans", "x-plan-v1.md")
    mkdirSync(dirname(docPath), { recursive: true })
    writeFileSync(docPath, "# Plan", "utf-8")
    captureStdout()
    new TestPostToolRouter(tmp, ".codex").callEvidence(docPath)
    expect(existsSync(join(tmp, ".codex", MEMORY_DIR_NAME, EVIDENCE_QUEUE_FILE))).toBe(false)
  })
  it("classifyEvidenceSource 白名单边界", () => {
    expect(classifyEvidenceSource("/p/.codex/plans/a-plan-v1.md")).toBe("PLAN")
    expect(classifyEvidenceSource("/p/.codex/plans/a-add-route-v1.md")).toBe("PLAN")
    expect(classifyEvidenceSource("/p/.codex/specs/s/tasks.md")).toBe("SPEC")
    expect(classifyEvidenceSource("/p/.codex/plans/2026-08/19/x-handoff.md")).toBe("HANDOFF")
    expect(classifyEvidenceSource("/p/.codex/reviews/r.md")).toBe("DEV_OPERATION")
    expect(classifyEvidenceSource("/p/src/index.ts")).toBeNull()
    expect(classifyEvidenceSource("/p/README.md")).toBeNull()
  })
})

describe("drainEvidenceQueue 幂等与 fail-open", () => {
  function seedQueue(events: string[]): string {
    const dir = join(tmp, ".codex", MEMORY_DIR_NAME)
    mkdirSync(dir, { recursive: true })
    const file = join(dir, EVIDENCE_QUEUE_FILE)
    for (const e of events) appendFileSync(file, e + "\n", "utf-8")
    return file
  }
  const fakeEvidenceDb = () => {
    const calls: unknown[] = []
    return {
      calls,
      upsert: vi.fn(async (args: unknown) => { calls.push(args); return { id: "e1" } }),
    }
  }

  it("首次消费：全部落库 + offset 推进", async () => {
    const ev = buildEvidenceEvent("/p/.codex/plans/a-plan-v1.md", "# Plan")
    seedQueue([JSON.stringify(ev)])
    const db = fakeEvidenceDb()
    const r = await drainEvidenceQueue({ projectDir: tmp, magicDir: ".codex", repositoryRef: "add-coder", evidenceDb: db as never })
    expect(r.processed).toBe(1)
    expect(r.errors).toEqual([])
    expect(readOffset(tmp, ".codex")).toBe(r.newOffset)
    expect(db.upsert).toHaveBeenCalledOnce()
  })

  it("二次消费：无增量 → processed=0（offset 幂等）", async () => {
    const ev = buildEvidenceEvent("/p/.codex/plans/a-plan-v1.md", "# Plan")
    seedQueue([JSON.stringify(ev)])
    const db = fakeEvidenceDb()
    const deps = { projectDir: tmp, magicDir: ".codex", repositoryRef: "add-coder", evidenceDb: db as never }
    await drainEvidenceQueue(deps)
    const r2 = await drainEvidenceQueue(deps)
    expect(r2.processed).toBe(0)
    expect(db.upsert).toHaveBeenCalledOnce() // 没有重复消费
  })

  it("重放幂等：offset 回拨后同事件重放，upsert 同幂等键（不产生新行语义）", async () => {
    const ev = buildEvidenceEvent("/p/.codex/plans/a-plan-v1.md", "# Plan")
    seedQueue([JSON.stringify(ev)])
    const db = fakeEvidenceDb()
    const deps = { projectDir: tmp, magicDir: ".codex", repositoryRef: "add-coder", evidenceDb: db as never }
    await drainEvidenceQueue(deps)
    writeFileSync(join(tmp, ".codex", MEMORY_DIR_NAME, EVIDENCE_OFFSET_FILE), "0", "utf-8") // 模拟 offset 丢失重放
    const r = await drainEvidenceQueue(deps)
    expect(r.processed).toBe(1) // 重放了
    // 但 upsert where 键 = repositoryRef+sourceType+sourceRef+contentHash(dedupKey)，与首次一致 → DB 层幂等
    const where1 = (db.calls[0] as { where: Record<string, unknown> }).where
    const where2 = (db.calls[1] as { where: Record<string, unknown> }).where
    expect(JSON.stringify(where1)).toBe(JSON.stringify(where2))
  })

  it("坏行跳过不阻塞（fail-open 到行粒度）", async () => {
    const good = JSON.stringify(buildEvidenceEvent("/p/.codex/plans/a-plan-v1.md", "# Plan"))
    seedQueue(["{broken json", good])
    const db = fakeEvidenceDb()
    const r = await drainEvidenceQueue({ projectDir: tmp, magicDir: ".codex", repositoryRef: "add-coder", evidenceDb: db as never })
    expect(r.processed).toBe(1)
    expect(r.skipped).toBe(1)
    expect(r.errors.length).toBe(1)
  })
})

describe("runConsolidation 故障隔离", () => {
  it("快照步失败不影响 drain/报告返回", async () => {
    const deps = {
      projectDir: tmp,
      magicDir: ".codex",
      repositoryRef: "add-coder",
      lexical: [{ id: "boom", search: async () => { throw new Error("FTS down") }, health: async () => ({ component: "fts", status: "unavailable" as const }) }],
      fetchByIds: async () => [],
      fetchEvidenceSourceRefs: async () => new Map<string, string[]>(),
      audit: {
        createRecall: async () => ({ id: "r1" }),
        createRecallItem: async () => ({}),
      },
      memoryDb: { findMany: vi.fn(async () => []), findFirst: vi.fn(async () => null), create: vi.fn() } as never,
      evidenceDb: { upsert: vi.fn(async () => ({ id: "e1" })) } as never,
      linkDb: { findFirst: vi.fn(async () => null), create: vi.fn() } as never,
      metricDb: { findMany: vi.fn(async () => []) } as never,
    }
    const report = await runConsolidation(deps as never)
    expect(report.snapshot).toBeNull()
    expect(report.errors.some((e) => e.includes("snapshot"))).toBe(true)
    expect(report.drain).toBeDefined()
    expect(report.duplicates).toEqual([])
  })
})
