# add-coder 模型预下载 Spec

> 对应 Plan: `.qoder/plans/2026-08/07/add-coder-model-predownload-plan-v1.md`

---

## Plan→Spec 映射

> 与 Plan §3.4 表格一一对应。DPS 检测此表判断映射覆盖度。

| # | Plan 决策 | 文件 | 关键变更 |
|---|------|------|------|
| 1 | 新增预下载核心模块：模型名从 dps-scoring-rules.toml 读取（零硬编码、缺失报错） | `src/lib/model-predownload.ts` | 新建模块：smol-toml 解析 [embedding] model |
| 2 | 幂等缓存检测 + 下载执行 + 小推理验证（hf-mirror 镜像配置与 helpers.ts 一致） | `src/lib/model-predownload.ts` | 新建模块：缓存判定 + pipeline 加载 + 推理验证 |
| 3 | CLI 新命令 model:download + init --skip-model + sync --model | `src/cli/index.ts` | 注册 1 新命令 + 2 个新选项 |
| 4 | init 挂入自动下载，失败仅 warn 不阻断 | `src/cli/commands/init.ts` | finalize 前调用 ensureEmbeddingModel，catch 降级 |
| 5 | sync 默认检测提示，--model 下载，失败不阻断 | `src/cli/commands/sync.ts` | 流程尾部插入检测/下载逻辑 |
| 6 | README 命令文档同步 | `README.md` | CLI 命令章节补充说明 |

---

## 1. 模型名解析（resolveEmbeddingModel）

> **Plan 决策**:（见上方映射表第 1 行）
> **文件**: `src/lib/model-predownload.ts`

### 类型/接口定义

```typescript
export function resolveEmbeddingModel(): string
```

实现要点：
- ~~运行时路径解析：`resolve(import.meta.dirname, "../caijuehub/dps-scoring-rules.toml")`（dist 打包后 toml 位于 dist/caijuehub/，tsup 构建插件已复制）~~ → 两候选路径：`resolve(import.meta.dirname, "caijuehub/dps-scoring-rules.toml")`（dist 形态：tsup 单入口 splitting:false → dist/index.js，dirname=dist）与 `resolve(import.meta.dirname, "../caijuehub/dps-scoring-rules.toml")`（src dev 形态：tsx 直跑 src/lib）[2026-08-07 修订: 实现核验 tsup 单入口事实]
- ~~开发态路径解析：`resolve(import.meta.dirname, "../../../src/caijuehub/dps-scoring-rules.toml")`（tsx 直跑 src 时）~~（合并入上一条候选路径）[2026-08-07 修订: 实现核验 tsup 单入口事实]
- 两条路径都探不到文件 → 抛 Error（含期望路径提示），禁止 fallback 默认模型名
- smol-toml `parse()` 解析；`[embedding]` 段缺失或 `model` 为空 → 抛错

### WHEN-THEN

- WHEN dist/caijuehub/dps-scoring-rules.toml 存在 → THEN 返回其 `[embedding] model` 字符串
- WHEN 源码路径存在（tsx 直跑） → THEN 返回其 `[embedding] model` 字符串
- WHEN 两路径均不存在或段缺失/为空 → THEN 抛出带路径上下文的 Error（不返回兜底值）

---

## 2. 缓存检测与下载（isModelCached / ensureEmbeddingModel）

> **Plan 决策**:（见映射表第 2 行）
> **文件**: `src/lib/model-predownload.ts`

### 类型/接口定义

```typescript
export type ModelDownloadStatus = "already-cached" | "downloaded" | "skipped";

export interface ModelDownloadResult {
  status: ModelDownloadStatus;
  model: string;
  cacheDir: string;
}

export function isModelCached(model: string): boolean;
export async function ensureEmbeddingModel(options?: {
  force?: boolean;
  skip?: boolean;
  timeoutMs?: number;  // 默认 5 分钟 [回流: Review P1 #1]
}): Promise<ModelDownloadResult>;
```

实现要点：
- 缓存判定：~~`~/.cache/huggingface/hub/models--{org}--{name}/snapshots/` 存在（org/name 从 `Xenova/bge-small-zh-v1.5` 拆 `Xenova` + `bge-small-zh-v1.5`，兼容无 org 形态）~~ → **显式设置 `env.cacheDir = resolveCacheDir()`**（锚定用户级缓存：HF_HUB_CACHE → HF_HOME/hub → os.homedir()/.cache/huggingface/hub），再按 `models--{org}--{name}/snapshots/` 判定（org 拆分兼容无 org 形态）[2026-08-07 修订: Review P1 #2 + 实现验证 transformers v3 默认包内 .cache]
- **helpers.ts 同源锚定**：模板 `getEmbeddings()` 动态 import 后同样显式设置 `env.cacheDir`（同一解析链）——transformers v3 默认 cacheDir 指向包内 .cache（重装即丢），不锚定则 CLI 预下载的模型无法被运行时复用 [2026-08-07 修订: 实现期发现]
- `skip: true` → 返回 `{ status: "skipped" }`（不解析模型名、不联网）
- 缓存命中且非 force → `{ status: "already-cached" }`
- 未命中 → 动态 `import("@huggingface/transformers")`：
  - `env.remoteHost = "https://hf-mirror.com"`
  - `env.remotePathTemplate = "{model}/resolve/{revision}/"`
  - `pipeline("feature-extraction", model)` 加载权重 → 执行一次 `["测试"]` 小推理验证（pooling: "mean", normalize: true）→ `{ status: "downloaded" }`
- 下载/推理验证过程受 `timeoutMs` 约束（默认 5 分钟），超时抛错 [回流: Review P1 #1]
- 任一步抛错 → 错误向上抛出（由调用方决定降级策略）

### WHEN-THEN

- WHEN 调用 `ensureEmbeddingModel({ skip: true })` → THEN 立即返回 `skipped`，无网络/磁盘操作
- WHEN 缓存目录已存在且未传 `force` → THEN 返回 `already-cached`，不触发下载
- WHEN 缓存缺失且传 `force` → THEN 重新走 pipeline 下载
- WHEN 下载成功 → THEN 返回 `downloaded`，缓存目录出现模型文件
- WHEN 下载抛错（网络/磁盘） → THEN 异常上抛，调用方按策略处理
- WHEN 下载/推理验证超过 `timeoutMs`（默认 5 分钟） → THEN 视为下载失败抛错，调用方走 warn 降级 [回流: Review P1 #1]

---

## 3. CLI 命令注册

> **Plan 决策**:（见映射表第 3 行）
> **文件**: `src/cli/index.ts`

### 类型/接口定义

```typescript
interface ModelDownloadOptions { force?: boolean }
export async function modelDownloadCommand(options: ModelDownloadOptions): Promise<void>
```

命令注册：
- `program.command("model:download")` + `.option("--force", "强制重新下载")` → `modelDownloadCommand`
- `init` 增加 `.option("--skip-model", "跳过 embedding 模型预下载")` → InitOptions 增加 `skipModel?: boolean`
- `sync` 增加 `.option("--model", "检测到缺失时下载 embedding 模型")` → SyncOptions 增加 `model?: boolean`

### WHEN-THEN

- WHEN 执行 `add-coder model:download` → THEN 调用 `ensureEmbeddingModel()`，成功打印模型名+状态，失败抛错非零退出
- WHEN 执行 `add-coder model:download` → THEN 输出末尾提示「以 `add-coder generate` 生成的配置为准」[回流: Review P2 #4]
- WHEN 执行 `add-coder model:download --force` → THEN 强制重新下载（即使缓存存在）
- WHEN 执行 `add-coder init --skip-model` → THEN 不触发下载（透传 skipModel）
- WHEN 执行 `add-coder sync --model` → THEN 触发下载（而非仅提示）

---

## 4. init 集成

> **Plan 决策**:（见映射表第 4 行）
> **文件**: `src/cli/commands/init.ts`

### 类型/接口定义

```typescript
interface InitOptions { adapter?: string; config?: string; force?: boolean; dryRun?: boolean; stack?: string; skipModel?: boolean; }
```

实现要点：
- `initCommand` 主流程在 `finalize` 之后（或 prepare 完成后）调用：
  ```typescript
  if (!options.dryRun) {
    try {
      const r = await ensureEmbeddingModel({ skip: options.skipModel });
      if (r.status !== "skipped") console.log(`模型预下载: ${r.status} (${r.model})`);
    } catch (e) {
      console.warn(`⚠️  模型预下载失败（不影响主流程，首次 DPS 调用会自动补下载）: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  ```
- dry-run 模式不执行下载（仅提示）

### WHEN-THEN

- WHEN 执行 `add-coder init` 且缓存缺失 → THEN 自动下载模型，控制台打印进度/结果
- WHEN 执行 `add-coder init --skip-model` → THEN 打印 `skipped`，无网络操作
- WHEN 下载抛错 → THEN 打印 warn 后 init 主流程继续执行（不退出非零）
- WHEN 执行 `add-coder init --dry-run` → THEN 不触发下载

---

## 5. sync 集成

> **Plan 决策**:（见映射表第 5 行）
> **文件**: `src/cli/commands/sync.ts`

### 类型/接口定义

```typescript
interface SyncOptions { adapter?: string; interactive?: boolean; patch?: boolean; model?: boolean; }
```

实现要点：
- `syncCommand` 流程末尾（patch 分支与普通分支均执行）调用：
  ```typescript
  const model = resolveEmbeddingModel();  // 解析失败仅 warn，不阻断
  if (isModelCached(model)) { /* 无提示或简短 OK */ }
  else if (options.model) { try { await ensureEmbeddingModel(); } catch (e) { console.warn(...) } }
  else { console.log(`模型未预下载: 运行 \`add-coder model:download\` 提前下载（首次 DPS 调用也会自动下载）`); }
  ```
- `--model` 下载失败仅 warn，不阻断 sync 主流程

> **降级边界声明 [回流: Review P2 #3]**：辅入口（init/sync）对**下载失败**降级 warn 不阻断，与零兜底规范（配置缺失即报错）不冲突——零兜底针对 `resolveEmbeddingModel` 的配置缺失，降级针对 `ensureEmbeddingModel` 的下载失败。主入口 `model:download` 保持严格抛错。

### WHEN-THEN

- WHEN 执行 `add-coder sync` 且模型已缓存 → THEN 无警告输出（或仅简短提示）
- WHEN 执行 `add-coder sync` 且模型缺失 → THEN 打印提示建议运行 `add-coder model:download`
- WHEN 执行 `add-coder sync --model` 且模型缺失 → THEN 执行下载，失败 warn 不阻断
- WHEN `resolveEmbeddingModel()` 抛错（toml 缺失） → THEN warn 后继续 sync 主流程

---

## 6. README 文档

> **Plan 决策**:（见映射表第 6 行）
> **文件**: `README.md`

### 内容要求

- CLI 命令章节新增 `model:download` 说明（含 `--force`）
- `init` 命令说明补充 `--skip-model`
- `sync` 命令说明补充 `--model`
- 说明缓存位置 `~/.cache/huggingface/hub/` 与"多仓库共享、仅需一次下载"

### WHEN-THEN

- WHEN 读者查阅 README 命令章节 → THEN 能找到三个新能力的使用说明
