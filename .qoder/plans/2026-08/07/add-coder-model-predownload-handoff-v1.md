# add-coder — 2 轮原子事务交接手册（model-predownload）

> **适用场景**：多轮原子事务变更，每轮独立收敛。embedding 模型预下载能力。
>
> **用途**：每个新对话开始时，把对应Round章节粘贴给 LLM。它需要明确自己正在执行哪个原子工程事务、上游事务已经提交了什么、当前事务的文件边界是什么、验证标准是什么、完成后记录哪些 ADD-7 审计。

---

## 全局元信息

- **父 Plan**: [add-coder-model-predownload-plan-v1.md](./add-coder-model-predownload-plan-v1.md)
- **原子事务拓扑**: [add-coder-model-predownload-add-route-v1.md](./add-coder-model-predownload-add-route-v1.md)
- **目标仓库**: `/home/xmm/ai/add-coder`
- **总文件数**: 6 个真源文件（新增 1 + 修改 5，不含 4 个 magic 目录派生副本）
- **Round数**: 2 轮局部闭包
- **拆分原则**: 以业务原子闭包为主，以对话上下文容量为辅

```text
第1轮 ── 预下载核心模块（src/lib/model-predownload.ts）
            │
            ▼
第2轮 ── CLI 集成 + 文档（index.ts / init.ts / sync.ts / README.md / helpers.ts）
```

---

## 原子事务边界说明

本手册中的"轮"按轮次级闭包划分（ADD 范式 §0.7）：

- **轮次级闭包**：一轮内的文件集合形成独立边界——该轮修改的文件不会被其他轮次回头修改，该轮的验证不依赖"下一轮补齐"。轮次之间是生产者-消费者关系，不是互相修补。
- **独立验证**：每轮完成后可通过 `tsc --noEmit` + `eslint` + checklist [T] 项独立验证。

因此：

- 第1轮（核心模块）与第2轮（CLI 集成）依赖同一闭环但拆成两轮——因为核心模块无消费者也可独立编译（文件边界独立，互不跨轮修改）。
- 第2轮是第1轮收敛后的验证合流；第1轮禁止提前实现第2轮的 CLI 命令注册。
- 每一轮完成后必须能够独立证明收敛，不能依赖"下一轮再补齐"才能成立。

### 交接手册与 spec 的优先级

- 本 handoff 是新对话的入口索引，负责说明Round位置、上下游依赖、文件边界、高风险误区、恢复关键词和审计闭环。
- 具体实现细节以 `.qoder/specs/add-coder-model-predownload/spec.md`、`tasks.md`、`checklist.md` 为准。
- 如果 handoff 摘要与 spec/tasks/checklist 存在颗粒度差异，以 spec/tasks/checklist 为准，不允许按 handoff 的简写自行简化实现。
- 每轮完成后的 ADD-7 不只写入 `record_dev_operation`，还必须用 `query_audit_logs` 按 action/targetId/keyword 回查确认落库。

---

## <第1轮> 预下载核心模块

### 你当前的位置

你是第 1 轮。无上游轮次，本轮是起点，只做 `src/lib/model-predownload.ts` 核心模块。

### 上游已完成

- 无（本轮为起点）。前置依赖：`dps-scoring-rules.toml` `[embedding] model` 真源存在（L66）、`@huggingface/transformers@3.8.1` + `smol-toml@1.7.0` 已在 dependencies。

### 恢复上下文审计查询（新 AI Session 首次启动必读）

> 以下 `query_audit_logs(...)` 是 MCP 工具调用，直接复制粘贴参数调用即可。共 2 条审计记录可恢复本轮完整开发上下文。

#### 第一步：搜索代码文件的改动记录

```text
query_audit_logs({ targetId: "src/lib/model-predownload.ts" })
```
→ 返回 1 条：MODIFY（MODULE_CREATED）。beforeState 不存在，afterState 核心模块三函数 + 超时 + 缓存同源。

#### 第二步：搜索文档变更记录

```text
query_audit_logs({ keyword: "add-coder-model-predownload" })
```
→ 返回全部 10 条本 Plan 审计记录（含回流 DOC_UPDATED、add-route DOC_CREATED、轮次 MODIFY）。

#### 恢复顺序建议

```
1. session-init SKILL（强制前置）
2. query_audit_logs({ keyword: "add-coder-model-predownload" })  → 全部审计记录
3. read ".qoder/specs/add-coder-model-predownload/spec.md"
4. read ".qoder/specs/add-coder-model-predownload/tasks.md"
5. read ".qoder/specs/add-coder-model-predownload/checklist.md"
```

### 原子事务目标

覆盖 `add-coder-model-predownload-plan-v1` 的 Task 1.1。新增核心模块：模型名解析（零硬编码）+ 缓存检测（同源）+ 下载执行（超时控制）。

### spec 文件

- `.qoder/specs/add-coder-model-predownload/spec.md`（§1/§2）
- `.qoder/specs/add-coder-model-predownload/tasks.md`
- `.qoder/specs/add-coder-model-predownload/checklist.md`

### 架构文档

- 无 docs/knowledge 架构体系（CLI 工具仓），以 README.md 命令说明为准（第 2 轮更新）。

### 你要改的文件（1 个：1 新建）

| 文件 | 操作 | 改什么 |
|------|------|--------|
| `src/lib/model-predownload.ts` | 新建 | resolveEmbeddingModel / resolveCacheDir / isModelCached / ensureEmbeddingModel（含 timeoutMs 超时 + env.cacheDir 显式锚定） |

### 核心设计

```text
toml [embedding] model（唯一真源）→ resolveEmbeddingModel()（双候选路径：dist/index.js + src dev）
缓存解析链：HF_HUB_CACHE → HF_HOME/hub → os.homedir()/.cache/huggingface/hub（零硬编码）
ensureEmbeddingModel：skip 短路 → env.cacheDir 显式锚定（transformers v3 默认包内 .cache 陷阱）→ 缓存命中短路 → pipeline 下载 + 小推理验证 → timeoutMs（默认 5 分钟）兜底
失败路径：异常上抛，调用方决策（主入口抛错 / 辅入口 warn）
```

### 关键契约细化

- `src/lib/model-predownload.ts` 模型名禁止硬编码/兜底默认值（零兜底，缺失即抛错）。
- `src/lib/model-predownload.ts` `ModelDownloadResult` 三字段 status/model/cacheDir；skipped 时 model/cacheDir 为空串（review-implementation #2）。
- `src/lib/model-predownload.ts` 缓存检测必须与下载路径同源（env.cacheDir 显式锚定）。

### 高风险误区

- 禁止硬编码 `~/.cache/huggingface/hub` 字符串（必须 os.homedir + HF_HOME/HF_HUB_CACHE 回退链）。
- 禁止依赖 transformers 默认 cacheDir（v3 默认包内 .cache，重装即丢、多仓库不共享）。
- **禁止提前实现第 2 轮的 CLI 命令注册**（index.ts/init.ts/sync.ts 不在本轮改）。

### ADD-7 审计记录

| action | targetType | targetId | 说明 | 状态 |
|--------|-----------|----------|------|:--:|
| `MODIFY` | MODULE | `src/lib/model-predownload.ts` | 核心模块创建 + tsc/冒烟验证 | ✅ cmsih7mvz000jnllzpfw9yfaj |

**恢复关键词**：
```text
query_audit_logs({ keyword: "add-coder-model-predownload" })
→ 返回全部 10 条本 Plan ADD-7 审计记录
```

### 验证标准

#### 已完成验证

- `resolveEmbeddingModel()` 返回 `Xenova/bge-small-zh-v1.5`（tsx 冒烟，toml 读取）
- `resolveCacheDir()` 返回 `/home/xmm/.cache/huggingface/hub`（os.homedir 解析）
- `isModelCached()` 未缓存时 false（tsx 冒烟）
- `npx tsc --noEmit` 0 error
- tasks.md 1.1.1-1.1.4 全部 `[x]`

#### 未执行的端到端验证（保留给运行时复测）

- [ ] `ensureEmbeddingModel` 实机下载（第 2 轮验证，因需 build 后 CLI 入口）

### 完成后记录 ADD-7 审计

| 文件 | action |
|------|--------|
| `src/lib/model-predownload.ts` | `MODIFY` |

完成后一键验证：
```text
query_audit_logs({ keyword: "add-coder-model-predownload" })
→ 确认 10 条全部落库
```

---

## <第2轮> CLI 集成 + 文档

### 你当前的位置

你是第 2 轮。上游第 1 轮已完成核心模块（resolveEmbeddingModel / isModelCached / ensureEmbeddingModel 三函数就绪）。本轮只做 CLI 集成 + 文档 + 运行时同源锚定。

### 上游已完成

- `src/lib/model-predownload.ts` 核心模块（三函数 + 超时 + 缓存同源），tsc=0，冒烟验证通过（审计 cmsih7mvz000jnllzpfw9yfaj）。

### 恢复上下文审计查询（新 AI Session 首次启动必读）

> 以下 `query_audit_logs(...)` 是 MCP 工具调用，直接复制粘贴参数调用即可。共 7 条审计记录可恢复本轮完整开发上下文。

#### 第一步：搜索代码文件的改动记录

```text
query_audit_logs({ targetId: "src/cli/index.ts" })
```
→ 返回 1 条：MODIFY（命令注册 + modelDownloadCommand）。

```text
query_audit_logs({ targetId: "templates/core/scripts/mcp-server/tools/gateway/helpers.ts" })
```
→ 返回 1 条：MODIFY（实现期发现：env.cacheDir 同源锚定）。

#### 第二步：搜索文档变更记录

```text
query_audit_logs({ keyword: "DOC_MODIFIED" })
```
→ 返回 2 条：README.md 命令说明、tasks/checklist 勾选同步。

#### 第三步：按行动词搜索

```text
query_audit_logs({ keyword: "FIX" })
```
→ 返回 1 条：package.json 冲突标记修复（stash pop 遗留，0.3.19）。

#### 恢复顺序建议

```
1. session-init SKILL（强制前置）
2. query_audit_logs({ keyword: "add-coder-model-predownload" })  → 全部审计记录
3. read ".qoder/specs/add-coder-model-predownload/spec.md"
4. read ".qoder/specs/add-coder-model-predownload/tasks.md"
5. read ".qoder/specs/add-coder-model-predownload/checklist.md"
```

### 原子事务目标

覆盖 `add-coder-model-predownload-plan-v1` 的 Task 2.1-2.4。CLI 命令注册（model:download/--skip-model/--model）+ init/sync 挂入 + README 文档 + helpers.ts 同源锚定。

### spec 文件

- `.qoder/specs/add-coder-model-predownload/spec.md`（§3-§6）
- `.qoder/specs/add-coder-model-predownload/tasks.md`
- `.qoder/specs/add-coder-model-predownload/checklist.md`

### 架构文档

- `README.md` — init 示例后补充模型预下载说明（已更新）。

### 你要改的文件（5 个：5 修改）

| 文件 | 操作 | 改什么 |
|------|------|--------|
| `src/cli/index.ts` | 修改 | model:download 命令（--force）+ init --skip-model + sync --model 注册 |
| `src/cli/commands/init.ts` | 修改 | InitOptions.skipModel + finalize 后挂入 ensureEmbeddingModel（dry-run 不执行，失败 warn） |
| `src/cli/commands/sync.ts` | 修改 | SyncOptions.model + maybeModelDownload 两分支挂入（patch/普通） |
| `README.md` | 修改 | 命令说明补充 |
| `templates/core/scripts/mcp-server/tools/gateway/helpers.ts` | 修改 | env.cacheDir 同源锚定（实现期发现，模板 + 4 magic 副本经 npm run sync） |

### 核心设计

```text
index.ts 注册 3 入口：model:download（主入口，失败非零退出 + generate 一致性提示）
init：finalize 后 ensureEmbeddingModel({ skip })，失败 warn 不阻断，skip 也打印状态
sync：maybeModelDownload（默认提示 / --model 下载），resolve 失败 warn 降级（辅入口边界）
helpers.ts：env.cacheDir 与 CLI 同解析链（HF_HUB_CACHE → HF_HOME/hub → os.homedir）
```

### 关键契约细化

- `src/cli/commands/init.ts` 模型下载挂入点必须在 finalize 之后（dbFail 时 process.exit(1) 已拦截，失败不继续）。
- `src/cli/commands/sync.ts` maybeModelDownload 必须 patch 与普通两分支均覆盖。
- `templates/core/scripts/mcp-server/tools/gateway/helpers.ts` 只加 cacheDir 锚定（3 行），禁止改推理逻辑。
- 降级边界：主入口 model:download 严格抛错；辅入口 init/sync 下载失败仅 warn（EXIT=0）。

### 高风险误区

- 禁止把模型下载放在 finalize 之前（dbFail 场景会误触发）。
- 禁止在 helpers.ts 改动推理逻辑（pooling/normalize 参数不变）。
- 禁止硬编码缓存路径（与第 1 轮契约一致）。
- **禁止跳过 npm run sync**（helpers.ts 模板修改必须同步 4 个 magic 目录）。

### ADD-7 审计记录

| action | targetType | targetId | 说明 | 状态 |
|--------|-----------|----------|------|:--:|
| `MODIFY` | COMPONENT | `src/cli/index.ts` | 命令注册 + modelDownloadCommand | ✅ cmsihd2da000knllzdiaw1w0a |
| `MODIFY` | COMPONENT | `src/cli/commands/sync.ts` | maybeModelDownload 两分支 | ✅ cmsihsov6000onllz0mykj1ow |
| `MODIFY` | TEMPLATE | `templates/.../helpers.ts` | 同源 cacheDir 锚定 | ✅ cmsihslln000nnllzfa4l4h5m |
| `DOC_MODIFIED` | DOC | `README.md` | 命令说明 | ✅ cmsihsrjq000pnllz2mcbv89w |

**恢复关键词**：
```text
query_audit_logs({ keyword: "add-coder-model-predownload" })
→ 返回全部 10 条本 Plan ADD-7 审计记录
```

### 验证标准

#### 已完成验证

- build 后 `--help` 三命令冒烟（model:download / init --skip-model / sync --model）
- `model:download` 实机下载成功（~90MB → /home/xmm/.cache/huggingface/hub）+ 二次幂等 already-cached
- `npx tsc --noEmit` 0 error + `npx eslint src/` 0 error
- `npm run sync` 模板同步 4 magic 目录
- tasks.md 2.1-2.4 全部 `[x]`、checklist 11 项 [T]/[E] 全勾

#### 未执行的端到端验证（保留给运行时复测）

- [ ] `init --skip-model` 不触发下载（dry-run）
- [ ] `sync` 缓存缺失提示 / `sync --model` 触发下载
- [ ] 下载失败（模拟断网）init/sync 不中断退出
- [ ] 用户项目 MCP 运行时复用预下载缓存（helpers.ts 同源锚定生效）
- [ ] Windows 真机缓存路径 `%USERPROFILE%\.cache\huggingface\hub`

### 完成后记录 ADD-7 审计

| 文件 | action |
|------|--------|
| `src/cli/index.ts` / `src/cli/commands/init.ts` / `src/cli/commands/sync.ts` | `MODIFY` |
| `templates/core/scripts/mcp-server/tools/gateway/helpers.ts` | `MODIFY` |
| `README.md` | `DOC_MODIFIED` |

完成后一键验证：
```text
query_audit_logs({ keyword: "add-coder-model-predownload" })
→ 确认 10 条全部落库
```

---

## 每轮收敛判定补充规则

> 以下规则与 `add-paradigm` SKILL Step 8 收敛条件并列，是每轮原子事务完成的强制性前置条件。

### checklist 证据要求

- [x] **全部项已勾选**（[T]/[E] 项全勾，[R] 项保留待运行时验证并注明）
- [x] **每项勾选有可验证证据**（tsc=0 / eslint=0 / 实机下载 / grep 零硬编码）
- [x] **未执行项诚实保留**（8 项 [R] 流转 review-runtime.md）
- [x] **证据可直接获取**（query_audit_logs 按 planKeyword 可查 10 条）

### tasks 证据要求

- [x] **全部任务已完成**（tasks.md 15 项全 `[x]`）
- [x] **每个任务有对应的 checklist 项覆盖**
- [x] **task 完成状态与 ADD-7 审计记录一致**（10 条 record_dev_operation）

### 收敛声明规则

当前Round AI 不得自行声明"本轮已收敛"。收敛声明只能由以下角色做出：

1. **开发者确认** — 开发者审核 checklist/tasks 证据后宣布收敛
2. **Review AI 确认** — 独立的 review AI Session 通过 `query_audit_logs` 验证后宣布收敛

---

## 附录：每轮启动模板

新对话开始时，直接把下面内容 + 对应Round章节粘贴给 LLM：

```text
## 上下文

你在执行 add-coder 模型预下载改进的 [第N轮]。
上游 [第1轮~第N-1轮] 已完成。
先读 .qoder/plans/2026-08/07/add-coder-model-predownload-handoff-v1.md 的 <第N轮> 章节。

## 启动操作（按顺序）

1. 执行 session-init SKILL
2. 执行 add-paradigm SKILL（含 Step 0 文档先行）
3. 读本轮对应 .qoder/specs/add-coder-model-predownload/spec.md
4. 读本轮对应 .qoder/specs/add-coder-model-predownload/tasks.md
5. 读本轮对应 .qoder/specs/add-coder-model-predownload/checklist.md
6. 按 tasks.md 顺序执行代码修改
7. 每完成一个 Task：读 checklist.md → 逐项验证 → **附可验证证据** → 勾选
8. 每完成一个文件修改：record_dev_operation 写入 ADD-7 审计
9. 写入审计后：query_audit_logs 按 action/targetId/keyword 回查确认落库
10. 全部代码完成后：按本轮 handoff 的 ADD-7 恢复关键词逐项回查，确认当前Round可被下一轮恢复
11. 收敛后：回到 add-paradigm SKILL Step 0.6，验收后回看架构文档，标记偏差点，通知开发者决策

## 关键提醒

- 当前执行的是 [第N轮]/2
- 当前Round是一个原子工程事务，不允许拆到下一轮补齐
- handoff 是入口索引；具体实现以 spec/tasks/checklist 为准
- 架构文档同步：代码执行前（Step 0）更新架构文档 → 代码执行后（Step 0.6）回看架构文档确认一致性
- checklist 证据要求：每项勾选必须有可验证证据，不得空勾选或"推测通过"。未执行项必须诚实保留为未勾选状态
- tasks 证据要求：全部任务完成后，每个 task 必须有对应的 checklist 验证记录
- 禁止自行声明收敛：收敛声明只能由开发者或 Review AI 做出，执行 AI 不得自我判定"本轮已收敛"
- 禁止简化代码实现
- 禁止跳过 MCP 回查；只写 record_dev_operation 不算审计闭环完成
- 保持与上游文件修改兼容，特别注意 handoff 中标记的历史修改文件
```
