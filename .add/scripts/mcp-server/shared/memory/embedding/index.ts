/*
 * Embedding 抽象与降级（Plan §8.1/§8.4，Spec §9）
 *
 * 首版仅实现 none provider：embed 抛 ERR_EMBEDDING_DISABLED，health 返回 disabled。
 * Vector adapter 仅 capability detection 存根（Phase 5 才接 pgvector/sqlite-vec）。
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
    async embed(): Promise<number[][]> {
      throw new MemoryError("ERR_EMBEDDING_DISABLED")
    },
    async health(): Promise<ComponentHealth> {
      return { component: "embedding", status: "disabled", detail: "EmbeddingProvider=none（首版定案，FTS-only）" }
    },
  }
}

/** Vector adapter capability 存根：health 报告 unavailable，search/upsert 拒绝 */
export function createUnavailableVectorAdapter(): VectorSearchAdapter {
  return {
    async search(): Promise<RankedId[]> {
      throw new MemoryError("ERR_EMBEDDING_DISABLED", "VectorSearchAdapter 未配置（Phase 5 接入）")
    },
    async upsert(): Promise<void> {
      throw new MemoryError("ERR_EMBEDDING_DISABLED", "VectorSearchAdapter 未配置（Phase 5 接入）")
    },
    async health(): Promise<ComponentHealth> {
      return { component: "vector-search", status: "unavailable", detail: "向量索引未启用（Phase 5 接入 pgvector/sqlite-vec）" }
    },
  }
}
