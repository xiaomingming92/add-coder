/*
 * @Author       : xiaomingming wujixmm@gmail.com
 * @Date         : 2026-07-31 15:15:00
 * @LastEditors  : xiaomingming wujixmm@gmail.com
 * @LastEditTime : 2026-07-31 15:15:00
 * @FilePath     : /farm-agent/.qoder/scripts/mcp-server/tools/gateway/helpers.ts
 * @Description  : 
 */
import { DPS_SCORING_CONFIG as CFG } from "../../shared/dps-scoring.strategy.js";
import { homedir } from "os";
import { join } from "path";

// ═══════════════ DPS 算法：共享辅助函数 ═══════════════

export function tokenize(text: string): Set<string> {
  if (!text) return new Set();
  const cleaned = text
    .replace(/#{1,6}\s/g, " ")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\|/g, " ")
    .replace(/[-=]{3,}/g, " ")
    .replace(/>\s/g, " ");
  const seg = new Intl.Segmenter("zh-CN", { granularity: "word" });
  const tokens = [...seg.segment(cleaned)]
    .filter(
      (s) =>
        s.isWordLike &&
        s.segment.length > 1 &&
        !/^[\s\d\p{P}]+$/u.test(s.segment),
    )
    .map((s) => s.segment.toLowerCase());
  return new Set(tokens);
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  const smaller = a.size < b.size ? a : b;
  const larger = a.size < b.size ? b : a;
  for (const t of smaller) if (larger.has(t)) intersection++;
  return intersection / (a.size + b.size - intersection || 1);
}

export function tfVector(tokens: Set<string>, globalTokens: Set<string>[]): number[] {
  const vocab = new Map<string, number>();
  let idx = 0;
  for (const ts of globalTokens)
    for (const t of ts) if (!vocab.has(t)) vocab.set(t, idx++);
  const N = globalTokens.length;
  const vec = new Array(vocab.size).fill(0),
    maxTf = Math.max(1, tokens.size);
  for (const [t, i] of vocab) {
    if (!tokens.has(t)) continue;
    let df = 0;
    for (const ts of globalTokens) if (ts.has(t)) df++;
    vec[i] = (1 / maxTf) * (Math.log((N + 1) / (df + 1)) + 1);
  }
  return vec;
}

export function shannonEntropy(freq: Map<string, number>): number {
  let total = 0;
  for (const v of freq.values()) total += v;
  if (total === 0) return 0;
  let entropy = 0;
  for (const v of freq.values()) {
    const p = v / total;
    entropy -= p * Math.log2(p);
  }
  return Math.min(entropy, 10);
}

export function dengPenalty(text: string): number {
  const markers = /可能|大概|也许|待定|TBD|TODO|暂未|未确定|不确定|后续|待补充|视情况/g;
  const matches = text.match(markers);
  return matches ? Math.min(matches.length * 0.05, 0.3) : 0;
}

export function fftWeights(scores: number[][]): number[] {
  const N = scores.length;
  if (N < CFG.FFT_COLD_START) return [...CFG.FFT_DEFAULT_WEIGHTS];
  const weights = [0, 1, 2, 3].map((dim) => {
    const signal = scores.map((s) => s[dim]);
    const X = signal.map((_, k) => {
      let re = 0, im = 0;
      for (let n = 0; n < N; n++) {
        const angle = (-2 * Math.PI * k * n) / N;
        re += signal[n] * Math.cos(angle);
        im += signal[n] * Math.sin(angle);
      }
      return re * re + im * im;
    });
    const dc = X[0], total = X.reduce((a, b) => a + b, 0);
    return (total - dc) / (total || 1);
  });
  const sum = weights.reduce((a, b) => a + b, 0);
  return sum > 0 ? weights.map((w) => w / sum) : [0.25, 0.25, 0.25, 0.25];
}

// ═══════════════ Embedding pipeline（单例） ═══════════════

let _embedPipeline: { embed: (texts: string[]) => Promise<number[][]> } | null = null;

export async function getEmbeddings(texts: string[]): Promise<number[][]> {
  if (!_embedPipeline) {
    const { pipeline, env } = await import("@huggingface/transformers");
    // 与 add-coder CLI `model:download` 预下载同源：锚定用户级缓存（HF_HUB_CACHE → HF_HOME/hub → ~/.cache/huggingface/hub）
    // ⚠️ transformers v3 默认 cacheDir 指向包内 .cache（重装即丢）——不锚定则 CLI 预下载的模型无法复用
    const hubCache = process.env.HF_HUB_CACHE;
    const home = process.env.HF_HOME || join(homedir(), ".cache", "huggingface");
    env.cacheDir = hubCache || join(home, "hub");
    env.remoteHost = "https://hf-mirror.com";
    env.remotePathTemplate = "{model}/resolve/{revision}/";
    const extractor = await pipeline("feature-extraction", CFG.EMBEDDING_MODEL);
    _embedPipeline = {
      embed: async (t: string[]) => {
        const result = await extractor(t, { pooling: "mean", normalize: true });
        const list = result.tolist() as number[][];
        return list.length === t.length ? list : [list as unknown as number[]];
      },
    };
  }
  return _embedPipeline.embed(texts);
}
