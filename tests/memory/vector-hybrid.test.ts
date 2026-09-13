/*
 * 轮 3 契约测试：EmbeddingProvider / VectorSearchAdapter / hybrid 排序版本
 *（Spec §6 §VectorCapability + §7 §HybridRecall）
 *
 * 覆盖验收项：
 *  - 维度真源校验：provider 维度 ≠ 声明维度 → ERR_DIMENSION_MISMATCH（拒写）
 *  - provider 不可用 → ERR_EMBEDDING_DISABLED（不阻塞调用方，降级 fts-only）
 *  - 双后端 capability：扩展/表缺失 → unavailable/degraded，绝不抛
 *  - 双后端契约：ensureSchema 幂等 DDL、upsert/search 参数与维度校验
 *  - hybrid：向量通道真正参与 → rankingVersion=v2 + fusedChannels 含 vector；向量故障 → 保持 v1
 */
import { describe, expect, it, vi } from "vitest"
import {
  assertEmbeddingDimension,
  parseEmbeddingEnv,
  createEmbeddingProviderFromConfig,
  createNoneEmbeddingProvider,
  type VectorSearchAdapter,
} from "../../templates/core/scripts/mcp-server/shared/memory/embedding/index.js"
import { createLocalOnnxEmbeddingProvider } from "../../templates/core/scripts/mcp-server/shared/memory/embedding/local-onnx.js"
import { createOpenAiCompatibleEmbeddingProvider } from "../../templates/core/scripts/mcp-server/shared/memory/embedding/openai-compatible.js"
import {
  PG_VECTOR_TABLE,
  createPgVectorAdapter,
  pgVectorLiteral,
  pgVectorSchemaDdl,
} from "../../templates/core/scripts/mcp-server/shared/memory/retrieval/vector/pgvector.js"
import {
  SQLITE_VEC_TABLE,
  createSqliteVecAdapter,
  sqliteVecSchemaDdl,
} from "../../templates/core/scripts/mcp-server/shared/memory/retrieval/vector/sqlite-vec.js"
import { recallPipeline } from "../../templates/core/scripts/mcp-server/shared/memory/retrieval/pipeline.js"
import type { RawQuerier, RecallFilter } from "../../templates/core/scripts/mcp-server/shared/memory/retrieval/types.js"

const filter: RecallFilter = {
  repositoryRef: "repo",
  statuses: ["ACTIVE"],
  scopeCtx: { repository: "repo" },
  now: new Date("2026-09-13T00:00:00Z"),
}

// ───────────────────────── 3.1 EmbeddingProvider ─────────────────────────

describe("维度真源校验（Review R5）", () => {
  it("一致则放行；不一致抛 ERR_DIMENSION_MISMATCH；未声明维度（首写）放行", () => {
    expect(() => assertEmbeddingDimension(512, 512)).not.toThrow()
    expect(() => assertEmbeddingDimension(512, 0)).not.toThrow()
    expect(() => assertEmbeddingDimension(384, 512)).toThrow(/ERR_DIMENSION_MISMATCH/)
  })
})

describe("EmbeddingProvider 配置解析与装配", () => {
  it("默认 none；未知模式回落 none", async () => {
    expect(parseEmbeddingEnv({}).mode).toBe("none")
    const provider = await createEmbeddingProviderFromConfig({ mode: "unknown" })
    expect(provider.id).toBe("none")
  })

  it("openai-compatible 缺 baseUrl → ERR_EMBEDDING_DISABLED（配置错误不静默）", async () => {
    await expect(createEmbeddingProviderFromConfig({ mode: "openai-compatible" }))
      .rejects.toThrow(/ERR_EMBEDDING_DISABLED/)
  })

  it("环境变量解析：维度与端点", () => {
    const cfg = parseEmbeddingEnv({
      ADD_MEMORY_EMBEDDING: "openai-compatible",
      ADD_MEMORY_EMBEDDING_BASE_URL: "http://localhost:8000/v1",
      ADD_MEMORY_EMBEDDING_MODEL: "bge-m3",
      ADD_MEMORY_EMBEDDING_DIM: "1024",
    })
    expect(cfg).toMatchObject({ mode: "openai-compatible", baseUrl: "http://localhost:8000/v1", model: "bge-m3", dimension: 1024 })
  })

  it("none provider：embed 抛 ERR_EMBEDDING_DISABLED，health=disabled（FTS-only 合法降级）", async () => {
    const p = createNoneEmbeddingProvider()
    await expect(p.embed(["x"])).rejects.toThrow(/ERR_EMBEDDING_DISABLED/)
    expect((await p.health()).status).toBe("disabled")
  })
})

describe("local-onnx provider（注入 pipeline，不下载模型）", () => {
  it("维度以模型实际输出为真源（首次推理后可用）", async () => {
    const p = createLocalOnnxEmbeddingProvider({
      loadPipeline: () => Promise.resolve((texts) => Promise.resolve(texts.map(() => [0.1, 0.2, 0.3]))),
    })
    expect(p.dimension).toBe(0)
    const vectors = await p.embed(["a", "b"])
    expect(vectors).toHaveLength(2)
    expect(p.dimension).toBe(3)
    expect(p.resolvedDimension).toBe(3)
    expect((await p.health()).status).toBe("ok")
  })

  it("模型加载失败 → ERR_EMBEDDING_DISABLED（不抛裸异常）", async () => {
    const p = createLocalOnnxEmbeddingProvider({
      loadPipeline: () => Promise.reject(new Error("model not found")),
    })
    await expect(p.embed(["x"])).rejects.toThrow(/ERR_EMBEDDING_DISABLED/)
  })

  it("同一 provider 内维度漂移 → ERR_DIMENSION_MISMATCH", async () => {
    let call = 0
    const p = createLocalOnnxEmbeddingProvider({
      loadPipeline: () =>
        Promise.resolve(() => {
          call++
          return Promise.resolve([[0.1, 0.2], [0.1, 0.2, 0.3]][call - 1] ? [call === 1 ? [0.1, 0.2] : [0.1, 0.2, 0.3]] : [])
        }),
    })
    await p.embed(["a"])
    await expect(p.embed(["b"])).rejects.toThrow(/ERR_DIMENSION_MISMATCH/)
  })
})

describe("openai-compatible provider（注入 fetch）", () => {
  const okFetch = (dim: number) =>
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: [{ embedding: Array.from({ length: dim }, () => 0.5) }] }),
      } as Response),
    )

  it("happy path：端点与鉴权头正确，维度由响应决定", async () => {
    const fetchImpl = okFetch(1024)
    const p = createOpenAiCompatibleEmbeddingProvider({
      baseUrl: "http://localhost:8000/v1/",
      model: "bge-m3",
      apiKey: "k",
      fetchImpl: fetchImpl,
    })
    await p.embed(["你好"])
    expect(p.dimension).toBe(1024)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, { headers: Record<string, string>; body: string }]
    expect(url).toBe("http://localhost:8000/v1/embeddings")
    expect(init.headers.authorization).toBe("Bearer k")
    expect(JSON.parse(init.body)).toEqual({ model: "bge-m3", input: ["你好"] })
  })

  it("期望维度不符 → ERR_DIMENSION_MISMATCH", async () => {
    const p = createOpenAiCompatibleEmbeddingProvider({
      baseUrl: "http://x/v1", model: "m", dimension: 512,
      fetchImpl: okFetch(1024),
    })
    await expect(p.embed(["a"])).rejects.toThrow(/ERR_DIMENSION_MISMATCH/)
  })

  it("HTTP 失败 → ERR_EMBEDDING_DISABLED，health 报 unavailable", async () => {
    const p = createOpenAiCompatibleEmbeddingProvider({
      baseUrl: "http://x/v1", model: "m",
      fetchImpl: vi.fn(() => Promise.resolve({ ok: false, status: 503 } as Response)),
    })
    await expect(p.embed(["a"])).rejects.toThrow(/ERR_EMBEDDING_DISABLED/)
    expect((await p.health()).status).toBe("unavailable")
  })
})

// ───────────────────────── 3.2 VectorSearchAdapter（双后端契约） ─────────────────────────

describe("pgvector 适配器", () => {
  it("DDL 幂等且含扩展/表/HNSW 索引；维度非法直接拒绝", () => {
    const ddl = pgVectorSchemaDdl(512)
    expect(ddl[0]).toMatch(/CREATE EXTENSION IF NOT EXISTS vector/i)
    expect(ddl[1]).toContain(`"embedding" vector(512)`)
    expect(ddl[2]).toMatch(/USING hnsw/i)
    expect(() => pgVectorSchemaDdl(0)).toThrow(/ERR_DIMENSION_MISMATCH/)
  })

  it("向量字面量可被 pgvector 解析（数值归一，NaN→0）", () => {
    expect(pgVectorLiteral([1, 2.5, Number.NaN])).toBe("[1,2.5,0]")
  })

  const makeQuerier = (handler: (sql: string, params: unknown[]) => unknown[]) => {
    const calls: { sql: string; params: unknown[] }[] = []
    const querier: RawQuerier = {
      query: <T>(sql: string, params: unknown[]): Promise<T[]> => {
        calls.push({ sql, params })
        return Promise.resolve(handler(sql, params) as T[])
      },
    }
    return { querier, calls }
  }

  it("capability：扩展缺失 → unavailable；扩展在但表缺失 → degraded；齐备 → ok", async () => {
    expect((await createPgVectorAdapter({ querier: makeQuerier(() => []).querier, dimension: 512, model: "m" }).capability()).status)
      .toBe("unavailable")

    const { querier: q2 } = makeQuerier((sql) => (sql.includes("pg_extension") ? [{ name: "vector" }] : [{ name: null }]))
    expect((await createPgVectorAdapter({ querier: q2, dimension: 512, model: "m" }).capability()).status).toBe("degraded")

    const { querier: q3 } = makeQuerier((sql) => (sql.includes("pg_extension") ? [{ name: "vector" }] : [{ name: PG_VECTOR_TABLE }]))
    expect((await createPgVectorAdapter({ querier: q3, dimension: 512, model: "m" }).capability()).status).toBe("ok")
  })

  it("ensureSchema 顺序执行 3 条 DDL", async () => {
    const { querier, calls } = makeQuerier(() => [])
    const adapter = createPgVectorAdapter({ querier, dimension: 512, model: "bge" })
    expect(await adapter.ensureSchema()).toEqual({ statements: 3 })
    expect(calls).toHaveLength(3)
  })

  it("upsert 维度不符 → ERR_DIMENSION_MISMATCH；正常路径参数含 model 与 dim", async () => {
    const { querier, calls } = makeQuerier(() => [])
    const adapter = createPgVectorAdapter({ querier, dimension: 3, model: "bge" })
    await expect(adapter.upsert("m1", [1, 2], "bge")).rejects.toThrow(/ERR_DIMENSION_MISMATCH/)
    await adapter.upsert("m1", [1, 2, 3], "bge")
    expect(calls[0].params).toEqual(["m1", "bge", 3, "[1,2,3]"])
  })

  it("search 按仓库/状态/模型过滤并返回 RankedId", async () => {
    const { querier, calls } = makeQuerier(() => [
      { memory_id: "a", score: 0.9 },
      { memory_id: "b", score: 0.5 },
    ])
    const adapter = createPgVectorAdapter({ querier, dimension: 3, model: "bge" })
    const hits = await adapter.search([0.1, 0.2, 0.3], filter, 5)
    expect(hits).toEqual([
      { memoryId: "a", rank: 1, score: 0.9 },
      { memoryId: "b", rank: 2, score: 0.5 },
    ])
    expect(calls[0].sql).toContain("<=>")
    expect(calls[0].sql).toContain('m."repositoryRef" = $2')
    expect(calls[0].params.slice(1)).toEqual(["repo", ["ACTIVE"], "bge", 5])
  })
})

describe("sqlite-vec 适配器", () => {
  it("DDL 使用 vec0 虚表且维度内联", () => {
    const ddl = sqliteVecSchemaDdl(512)
    expect(ddl[0]).toContain(`USING vec0`)
    expect(ddl[0]).toContain("float[512]")
    expect(() => sqliteVecSchemaDdl(-1)).toThrow(/ERR_DIMENSION_MISMATCH/)
  })

  it("capability：vec0 未注册 → unavailable（绝不抛）；注册 → ok", async () => {
    const absent: RawQuerier = { query: () => Promise.resolve([]) }
    expect((await createSqliteVecAdapter({ querier: absent, dimension: 512, model: "m" }).capability()).status)
      .toBe("unavailable")
    const present: RawQuerier = { query: () => Promise.resolve([{ ok: 1 }]) }
    expect((await createSqliteVecAdapter({ querier: present, dimension: 512, model: "m" }).capability()).status).toBe("ok")
  })

  it("upsert 双写（向量表 + meta 表）且维度受校验", async () => {
    const calls: { sql: string; params: unknown[] }[] = []
    const querier: RawQuerier = {
      query: <T>(sql: string, params: unknown[]): Promise<T[]> => {
        calls.push({ sql, params })
        return Promise.resolve([] as T[])
      },
    }
    const adapter = createSqliteVecAdapter({ querier, dimension: 3, model: "bge" })
    await expect(adapter.upsert("m", [1, 2], "bge")).rejects.toThrow(/ERR_DIMENSION_MISMATCH/)
    await adapter.upsert("m", [1, 2, 3], "bge")
    expect(calls).toHaveLength(2)
    expect(calls[0].sql).toContain(`${SQLITE_VEC_TABLE}(memory_id, embedding)`)
    expect(calls[0].params[1]).toBe("[1,2,3]")
    expect(calls[1].sql).toContain(`${SQLITE_VEC_TABLE}_meta`)
  })

  it("search 以余弦距离排序并转 score", async () => {
    const querier: RawQuerier = {
      query: () => Promise.resolve([{ memory_id: "x", distance: 0.2 }]),
    }
    const adapter = createSqliteVecAdapter({ querier, dimension: 3, model: "bge" })
    const hits = await adapter.search([1, 0, 0], filter, 3)
    expect(hits[0].memoryId).toBe("x")
    expect(hits[0].score).toBeCloseTo(0.8, 6)
  })
})

// ───────────────────────── 3.3 hybrid rankingVersion ─────────────────────────

function pipelineDeps(vector: VectorSearchAdapter | null) {
  return {
    lexical: [
      {
        id: "fake-fts",
        search: () => Promise.resolve([{ memoryId: "m1", rank: 1, score: 0.9 }]),
        health: () => Promise.resolve({ component: "fake-fts", status: "ok" as const }),
      },
    ],
    vector,
    fetchByIds: () =>
      Promise.resolve([
        {
          id: "m1", kind: "CONSTRAINT", status: "ACTIVE", topic: "t", content: "c",
          summary: null, scopeType: "REPOSITORY", scopeValue: "repo", repositoryRef: "repo",
          importance: 0.9, confidence: 0.9, validUntil: null, supersedes: [],
        },
      ]),
    fetchEvidenceSourceRefs: () => Promise.resolve(new Map([["m1", ["plan.md"]]])),
  }
}

const okVector = (): VectorSearchAdapter => ({
  search: () => Promise.resolve([{ memoryId: "m1", rank: 1, score: 0.8 }]),
  upsert: () => Promise.resolve(),
  health: () => Promise.resolve({ component: "vector-search", status: "ok" as const }),
})

const brokenVector = (): VectorSearchAdapter => ({
  search: () => Promise.reject(new Error("extension dropped")),
  upsert: () => Promise.resolve(),
  health: () => Promise.resolve({ component: "vector-search", status: "unavailable" as const }),
})

describe("hybrid 排序版本与通道标记（Spec §7）", () => {
  const input = {
    query: "q", stage: "dps", repositoryRef: "repo",
    scopeCtx: { repository: "repo" }, maxTokens: 600,
  }

  it("向量通道参与 → rankingVersion=memory-rank-v2 且 fusedChannels 含 vector", async () => {
    const result = await recallPipeline(input, pipelineDeps(okVector()))
    expect(result.rankingVersion).toBe("memory-rank-v2")
    expect(result.fusedChannels).toEqual(["lexical", "vector"])
  })

  it("无向量适配器 → 保持 memory-rank-v1，仅 lexical 通道", async () => {
    const result = await recallPipeline(input, pipelineDeps(null))
    expect(result.rankingVersion).toBe("memory-rank-v1")
    expect(result.fusedChannels).toEqual(["lexical"])
  })

  it("向量故障 → 不阻塞召回，回落 v1（降级而非报错）", async () => {
    const result = await recallPipeline(input, pipelineDeps(brokenVector()))
    expect(result.rankingVersion).toBe("memory-rank-v1")
    expect(result.fusedChannels).toEqual(["lexical"])
    expect(result.items).toHaveLength(1)
  })
})
