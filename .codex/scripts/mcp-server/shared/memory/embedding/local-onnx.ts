/*
 * 本地 ONNX 嵌入提供者（Plan §3.4 轮 3 Task 3.1 / Spec §6 §VectorCapability）
 *
 * 关键约束：
 *  1. **可选依赖**：@huggingface/transformers 与模型权重都可能在目标机器缺失——加载失败
 *     必须收敛为 ERR_EMBEDDING_DISABLED（调用方据此走 fts-only），绝不抛裸异常阻塞 Gate；
 *  2. **维度以模型元数据为真源**：dimension 由首次推理的实际输出长度决定（不硬编码），
 *     与 DB 侧 AddMemory.embeddingDim 不一致时由调用方拒绝写入（Review R5 回流）；
 *  3. 惰性加载：不在模块顶层 import/下载模型，首次 embed 时才初始化。
 */
import { MemoryError } from "../domain/errors.js"
import type { ComponentHealth } from "../retrieval/types.js"
import type { EmbeddingProvider } from "./index.js"

/** 默认模型：中文小模型（真源维度 512，与 Plan R5「维度真源」一致） */
export const DEFAULT_LOCAL_ONNX_MODEL = "Xenova/bge-small-zh-v1.5"

export interface LocalOnnxOptions {
  model?: string
  /** 显式缓存目录；缺省复用 HF_HUB_CACHE → HF_HOME/hub → ~/.cache/huggingface/hub */
  cacheDir?: string
  /** 镜像站（内网/受限网络） */
  remoteHost?: string
  /** 测试注入：直接给定 pipeline 工厂 */
  loadPipeline?: (model: string) => Promise<(texts: string[]) => Promise<number[][]>>
}

export interface LocalOnnxProvider extends EmbeddingProvider {
  /** 首次推理后可用；未初始化时为 0（调用方以 assertEmbeddingDimension 校验） */
  readonly resolvedDimension: number
}

export function createLocalOnnxEmbeddingProvider(opts: LocalOnnxOptions = {}): LocalOnnxProvider {
  const model = opts.model ?? DEFAULT_LOCAL_ONNX_MODEL
  let embedFn: ((texts: string[]) => Promise<number[][]>) | null = null
  let dimension = 0

  async function ensureLoaded(): Promise<(texts: string[]) => Promise<number[][]>> {
    if (embedFn) return embedFn
    try {
      if (opts.loadPipeline) {
        embedFn = await opts.loadPipeline(model)
      } else {
        const { pipeline, env } = await import("@huggingface/transformers")
        if (opts.cacheDir) env.cacheDir = opts.cacheDir
        if (opts.remoteHost) env.remoteHost = opts.remoteHost
        const extractor = await pipeline("feature-extraction", model)
        embedFn = async (texts: string[]) => {
          const result = await extractor(texts, { pooling: "mean", normalize: true })
          const list = result.tolist() as number[][]
          return list.length === texts.length ? list : [list as unknown as number[]]
        }
      }
      return embedFn
    } catch (error) {
      throw new MemoryError(
        "ERR_EMBEDDING_DISABLED",
        `本地 ONNX 模型不可用（model=${model}）：${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  return {
    id: "local-onnx",
    get dimension(): number {
      return dimension
    },
    get resolvedDimension(): number {
      return dimension
    },
    async embed(texts: string[]): Promise<number[][]> {
      if (texts.length === 0) return []
      const fn = await ensureLoaded()
      let vectors: number[][]
      try {
        vectors = await fn(texts)
      } catch (error) {
        throw new MemoryError(
          "ERR_EMBEDDING_DISABLED",
          `本地 ONNX 推理失败（model=${model}）：${error instanceof Error ? error.message : String(error)}`,
        )
      }
      const dim = vectors[0]?.length ?? 0
      if (dim === 0) {
        throw new MemoryError("ERR_EMBEDDING_DISABLED", `本地 ONNX 返回空向量（model=${model}）`)
      }
      // 维度真源：以模型实际输出为准；同一 provider 内必须自洽
      if (dimension !== 0 && dimension !== dim) {
        throw new MemoryError("ERR_DIMENSION_MISMATCH", `provider 维度漂移：${dimension} → ${dim}`)
      }
      dimension = dim
      return vectors
    },
    health(): Promise<ComponentHealth> {
      if (embedFn && dimension > 0) {
        return Promise.resolve({ component: "embedding", status: "ok", detail: `local-onnx model=${model} dim=${dimension}` })
      }
      return Promise.resolve({
        component: "embedding",
        status: "degraded",
        detail: `local-onnx 未初始化（model=${model}）；首次 embed 时加载，失败则降级 fts-only`,
      })
    },
  }
}
