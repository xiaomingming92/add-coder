/*
 * OpenAI 兼容嵌入提供者（Plan §3.4 轮 3 Task 3.1）
 *
 * 适用于任意 /v1/embeddings 兼容端点（本地 vLLM / 自建网关 / 官方 API）。
 * 契约同 local-onnx：维度以首次响应为准（配置项 dimension 仅作期望值校验），
 * 任何失败收敛为 ERR_EMBEDDING_DISABLED，不阻塞 Gate。
 */
import { MemoryError } from "../domain/errors.js"
import type { ComponentHealth } from "../retrieval/types.js"
import type { EmbeddingProvider } from "./index.js"

export interface OpenAiCompatibleOptions {
  baseUrl: string
  model: string
  apiKey?: string
  /** 期望维度（可选）：与首次响应不一致时报 ERR_DIMENSION_MISMATCH */
  dimension?: number
  timeoutMs?: number
  /** 测试注入 */
  fetchImpl?: typeof fetch
}

export function createOpenAiCompatibleEmbeddingProvider(
  opts: OpenAiCompatibleOptions,
): EmbeddingProvider {
  const doFetch = opts.fetchImpl ?? fetch
  const endpoint = `${opts.baseUrl.replace(/\/+$/, "")}/embeddings`
  let dimension = opts.dimension ?? 0
  let lastError: string | null = null

  return {
    id: "openai-compatible",
    get dimension(): number {
      return dimension
    },
    async embed(texts: string[]): Promise<number[][]> {
      if (texts.length === 0) return []
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15_000)
      let payload: { data?: { embedding?: number[] }[] }
      try {
        const res = await doFetch(endpoint, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(opts.apiKey ? { authorization: `Bearer ${opts.apiKey}` } : {}),
          },
          body: JSON.stringify({ model: opts.model, input: texts }),
          signal: controller.signal,
        })
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`)
        }
        payload = (await res.json()) as { data?: { embedding?: number[] }[] }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error)
        throw new MemoryError("ERR_EMBEDDING_DISABLED", `兼容端点调用失败（${endpoint}）：${lastError}`)
      } finally {
        clearTimeout(timer)
      }

      const vectors = (payload.data ?? []).map((d) => d.embedding ?? []).filter((v) => v.length > 0)
      if (vectors.length === 0) {
        throw new MemoryError("ERR_EMBEDDING_DISABLED", `兼容端点未返回向量（model=${opts.model}）`)
      }
      const dim = vectors[0].length
      if (dimension !== 0 && dimension !== dim) {
        throw new MemoryError("ERR_DIMENSION_MISMATCH", `期望维度 ${dimension}，实收 ${dim}`)
      }
      dimension = dim
      lastError = null
      return vectors
    },
    health(): Promise<ComponentHealth> {
      if (dimension > 0) {
        return Promise.resolve({ component: "embedding", status: "ok", detail: `openai-compatible model=${opts.model} dim=${dimension}` })
      }
      return Promise.resolve({
        component: "embedding",
        status: lastError ? "unavailable" : "degraded",
        detail: lastError
          ? `兼容端点不可用：${lastError}`
          : `兼容端点未调用（model=${opts.model}，endpoint=${endpoint}）`,
      })
    },
  }
}
