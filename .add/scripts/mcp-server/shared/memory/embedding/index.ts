/*
 * Embedding 抽象与降级（Plan §8.1/§8.4，Spec §9）
 *
 * 提供者：none（默认，显式不可用）/ local-onnx / openai-compatible（Phase 5 轮 3）。
 * Vector adapter：pgvector / sqlite-vec（retrieval/vector/），能力检测失败即降级。
 * 契约：记忆系统任何环节不得因 embedding 缺失而阻塞 Gate（FTS-only 合法降级）。
 */
import { MemoryError } from "../domain/errors.js"
import type { ComponentHealth, RankedId, RecallFilter } from "../retrieval/types.js"

export interface EmbeddingProvider {
  readonly id: string // "none" | "local-onnx" | "openai-compatible" | "custom"
  readonly dimension: number
  embed(texts: string[]): Promise<number[][]>
  health(): Promise<ComponentHealth>
}

export interface VectorSearchAdapter {
  search(vector: number[], filter: RecallFilter, limit: number): Promise<RankedId[]>
  upsert(memoryId: string, vector: number[], model: string): Promise<void>
  health(): Promise<ComponentHealth>
}

/** 首版唯一 provider：显式不可用。调用方据此走 FTS-only 并标注 degradedMode */
export function createNoneEmbeddingProvider(): EmbeddingProvider {
  return {
    id: "none",
    dimension: 0,
    embed: (): Promise<number[][]> => Promise.reject(new MemoryError("ERR_EMBEDDING_DISABLED")),
    health: (): Promise<ComponentHealth> =>
      Promise.resolve({ component: "embedding", status: "disabled", detail: "EmbeddingProvider=none（首版定案，FTS-only）" }),
  }
}

/** Vector adapter capability 存根：health 报告 unavailable，search/upsert 拒绝 */
export function createUnavailableVectorAdapter(): VectorSearchAdapter {
  return {
    search: (): Promise<RankedId[]> =>
      Promise.reject(new MemoryError("ERR_EMBEDDING_DISABLED", "VectorSearchAdapter 未配置（Phase 5 接入）")),
    upsert: (): Promise<void> =>
      Promise.reject(new MemoryError("ERR_EMBEDDING_DISABLED", "VectorSearchAdapter 未配置（Phase 5 接入）")),
    health: (): Promise<ComponentHealth> =>
      Promise.resolve({ component: "vector-search", status: "unavailable", detail: "向量索引未启用（Phase 5 接入 pgvector/sqlite-vec）" }),
  }
}

/**
 * 维度真源校验（Review R5 回流）：provider 上报维度必须与 DB 侧声明维度一致，否则拒写。
 * declaredDim 来自 AddMemory.embeddingDim（写入路径的真源）。
 */
export function assertEmbeddingDimension(providerDim: number, declaredDim: number): void {
  if (declaredDim <= 0) return // 未声明维度：首写，由 provider 值落库
  if (providerDim !== declaredDim) {
    throw new MemoryError(
      "ERR_DIMENSION_MISMATCH",
      `嵌入维度不一致：provider=${providerDim} vs 声明=${declaredDim}（拒绝写入，避免脏向量）`,
    )
  }
}

export type EmbeddingMode = "none" | "local-onnx" | "openai-compatible"

export interface EmbeddingEnvConfig {
  mode?: string
  model?: string
  dimension?: number
  baseUrl?: string
  apiKey?: string
  cacheDir?: string
  remoteHost?: string
}

/** 从环境变量解析提供者配置（纯函数，便于测试与文档化） */
export function parseEmbeddingEnv(env: NodeJS.ProcessEnv = process.env): EmbeddingEnvConfig {
  const mode = (env.ADD_MEMORY_EMBEDDING ?? "none").toLowerCase()
  const dim = Number(env.ADD_MEMORY_EMBEDDING_DIM ?? "")
  return {
    mode,
    model: env.ADD_MEMORY_EMBEDDING_MODEL,
    dimension: Number.isFinite(dim) && dim > 0 ? Math.floor(dim) : undefined,
    baseUrl: env.ADD_MEMORY_EMBEDDING_BASE_URL,
    apiKey: env.ADD_MEMORY_EMBEDDING_API_KEY,
    cacheDir: env.ADD_MEMORY_EMBEDDING_CACHE_DIR,
    remoteHost: env.ADD_MEMORY_EMBEDDING_REMOTE_HOST,
  }
}

/**
 * 按配置装配提供者（默认 none → 行为与首版一致）。
 * local-onnx / openai-compatible 走动态 import，未配置的路径不加载任何重依赖。
 */
export async function createEmbeddingProviderFromConfig(
  config: EmbeddingEnvConfig = parseEmbeddingEnv(),
): Promise<EmbeddingProvider> {
  const mode = (config.mode ?? "none") as EmbeddingMode
  if (mode === "local-onnx") {
    const { createLocalOnnxEmbeddingProvider } = await import("./local-onnx.js")
    return createLocalOnnxEmbeddingProvider({
      model: config.model,
      cacheDir: config.cacheDir,
      remoteHost: config.remoteHost,
    })
  }
  if (mode === "openai-compatible") {
    if (!config.baseUrl) {
      throw new MemoryError("ERR_EMBEDDING_DISABLED", "openai-compatible 需要 ADD_MEMORY_EMBEDDING_BASE_URL")
    }
    const { createOpenAiCompatibleEmbeddingProvider } = await import("./openai-compatible.js")
    return createOpenAiCompatibleEmbeddingProvider({
      baseUrl: config.baseUrl,
      model: config.model ?? "text-embedding-3-small",
      apiKey: config.apiKey,
      dimension: config.dimension,
    })
  }
  return createNoneEmbeddingProvider()
}
