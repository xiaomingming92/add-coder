/*
 * Author       : xiaomingming wujixmm@gmail.com
 * Date         : 2026-08-07
 * Description  : embedding 模型预下载核心模块（add-coder-model-predownload Plan）
 *                模型名真源：src/caijuehub/dps-scoring-rules.toml [embedding] model（零硬编码）
 *                缓存检测与下载路径同源：env.cacheDir 优先，回退 HF_HUB_CACHE/HF_HOME/os.homedir 解析
 *                失败路径：主入口严格抛错（model:download），辅入口降级 warn（init/sync）
 *                超时控制：默认 5 分钟（Review P1 #1，transformers.js 默认不超时）
 */
import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { homedir } from "os";
import { parse } from "smol-toml";

export type ModelDownloadStatus = "already-cached" | "downloaded" | "skipped";

export interface ModelDownloadResult {
    /** skipped 时 model/cacheDir 为空串（review-implementation #2 契约注明） */
    status: ModelDownloadStatus;
    model: string;
    cacheDir: string;
}

/** 默认下载/推理验证超时（ms）：5 分钟（Review P1 #1） */
export const DEFAULT_DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * toml 候选路径：
 * - dist 打包形态：tsup 单入口（splitting:false）→ dist/index.js，dirname=dist → dist/caijuehub/
 * - src dev 形态：tsx 直跑 → src/lib/，dirname=src/lib → src/caijuehub/
 */
const TOML_CANDIDATES = [
    resolve(import.meta.dirname, "caijuehub/dps-scoring-rules.toml"),
    resolve(import.meta.dirname, "../caijuehub/dps-scoring-rules.toml"),
];

/**
 * 从 dps-scoring-rules.toml 读取 [embedding] model（唯一真源，零硬编码）。
 * 两候选路径均不存在 / 段缺失 / 值为空 → 抛错（含期望路径上下文），禁止兜底默认值。
 */
export function resolveEmbeddingModel(): string {
    const tomlPath = TOML_CANDIDATES.find((p) => existsSync(p));
    if (!tomlPath) {
        throw new Error(
            `dps-scoring-rules.toml 未找到（期望路径: ${TOML_CANDIDATES.join(" 或 ")}）`,
        );
    }
    const cfg = parse(readFileSync(tomlPath, "utf-8")) as Record<
        string,
        Record<string, unknown>
    >;
    const model = cfg.embedding?.model;
    if (typeof model !== "string" || model.length === 0) {
        throw new Error(`dps-scoring-rules.toml [embedding] model 未配置（${tomlPath}）`);
    }
    return model;
}

/**
 * 缓存根目录解析（与 @huggingface/transformers 默认解析同源）：
 * HF_HUB_CACHE → HF_HOME/hub → ~/.cache/huggingface/hub（os.homedir 跨平台，
 * Windows 下自动为 %USERPROFILE%\.cache\huggingface\hub）
 */
export function resolveCacheDir(): string {
    const hubCache = process.env.HF_HUB_CACHE;
    if (hubCache) return hubCache;
    const home = process.env.HF_HOME || join(homedir(), ".cache", "huggingface");
    return join(home, "hub");
}

/** 模型缓存目录名：models--{org}--{name}（兼容无 org 形态） */
function modelCacheName(model: string): string {
    const parts = model.split("/");
    const org = parts.length > 1 ? parts[0] : "models";
    const name = parts[parts.length - 1];
    return `models--${org}--${name}`;
}

/**
 * 同步缓存检测（供 sync 快速判断，零网络）。
 * 注意：与下载路径同源的最终确认在 ensureEmbeddingModel 内（动态 import 后读 env.cacheDir，Review P1 #2）。
 */
export function isModelCached(model: string): boolean {
    const cacheDir = resolveCacheDir();
    return existsSync(join(cacheDir, modelCacheName(model), "snapshots"));
}

/**
 * 确保 embedding 模型已下载：
 * - skip=true → skipped（不解析模型名、不联网）
 * - 缓存命中且 !force → already-cached
 * - 缺失 → 动态 import transformers（hf-mirror 镜像与 helpers.ts 一致）→ pipeline 加载
 *   → 一次小推理验证 → downloaded
 * - 超时（默认 5 分钟）或任一步抛错 → 异常上抛，由调用方决定降级策略（主入口抛错 / 辅入口 warn）
 */
export async function ensureEmbeddingModel(options?: {
    force?: boolean;
    skip?: boolean;
    timeoutMs?: number;
}): Promise<ModelDownloadResult> {
    const force = options?.force ?? false;
    const skip = options?.skip ?? false;
    const timeoutMs = options?.timeoutMs ?? DEFAULT_DOWNLOAD_TIMEOUT_MS;

    if (skip) {
        return { status: "skipped", model: "", cacheDir: "" };
    }

    const model = resolveEmbeddingModel();

    // 与下载路径同源的缓存判定：显式锚定用户级缓存目录（Review P1 #2）
    // ⚠️ transformers v3 默认 cacheDir 指向包内 .cache（pnpm 下 node_modules/.pnpm/...，
    //    重装即丢、多仓库不共享）——不显式设置则「CLI 预下载位置 ≠ 运行时期望位置」，预下载失效
    const { pipeline, env } = await import("@huggingface/transformers");
    env.cacheDir = resolveCacheDir();
    const cacheDir = env.cacheDir;
    const snapshotsDir = join(cacheDir, modelCacheName(model), "snapshots");
    if (!force && existsSync(snapshotsDir)) {
        return { status: "already-cached", model, cacheDir };
    }

    env.remoteHost = "https://hf-mirror.com";
    env.remotePathTemplate = "{model}/resolve/{revision}/";

    // 超时控制：下载 + 推理验证整体受 timeoutMs 约束（Review P1 #1）
    const run = (async () => {
        const extractor = await pipeline("feature-extraction", model);
        await extractor(["测试"], { pooling: "mean", normalize: true });
    })();

    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
            () => reject(new Error(`模型下载超时（${timeoutMs}ms）`)),
            timeoutMs,
        );
    });
    try {
        await Promise.race([run, timeout]);
    } finally {
        if (timer) clearTimeout(timer);
    }

    return { status: "downloaded", model, cacheDir };
}
