# add-coder-model-predownload-plan-v1

> **Plan/Spec 边界提醒**：Plan 回答"改什么、为什么改、改哪里"——写到让 Review 能判断方向对不对、有没有遗漏维度的程度（文件路径 + Task 验收标准 + 架构维度全覆盖）。**不要**在 Plan 中写完整 TS 类型定义、WHEN-THEN 场景、精确函数签名——那是 Spec 的职责。

## PLAN 元信息

- **Plan 名称**: add-coder-model-predownload-v1
- **启动时间**: 2026-08-07T00:00:00+08:00
- **主导 AI**: Qoder
- **关联文档**:
  - ADD Route: `.qoder/plans/2026-08/07/add-coder-model-predownload-add-route-v1.md`
  - Handoff: `.qoder/plans/2026-08/07/add-coder-model-predownload-handoff-v1.md`（Step 8 生成）
  - Review: `.qoder/reviews/add-coder-model-predownload-review-v1.md`
- **ADD-7 审计策略**:

| 文件 | targetType | action | beforeState | afterState | 状态 |
|-----|-----------|--------|------------|-----------|------|
| src/lib/model-predownload.ts | COMPONENT | COMPONENT_CREATED | 不存在 | 新增预下载核心模块（resolveEmbeddingModel/isModelCached/ensureEmbeddingModel） | 待实施 |
| src/cli/index.ts | COMPONENT | COMPONENT_MODIFIED | 仅 init/sync/status/stack 四命令 | 新增 model:download 命令 + init --skip-model + sync --model 选项 | 待实施 |
| src/cli/commands/init.ts | COMPONENT | COMPONENT_MODIFIED | init 流程无模型下载步骤 | finalize 前挂入 ensureEmbeddingModel（--skip-model 可跳过，失败仅警告） | 待实施 |
| src/cli/commands/sync.ts | COMPONENT | COMPONENT_MODIFIED | sync 流程无模型检测 | 默认仅检测缺失并提示，--model 触发下载（失败不阻断） | 待实施 |
| README.md | DOC | DOC_UPDATED | 无模型预下载说明 | CLI 命令说明补充 model:download / init --skip-model / sync --model | 待实施 |

---

## HITL 计划总览（一次性提交人类审核）

> **规则**：AI 先在此表中列出 Plan 的全部关键决策，等待人类一次性拍板后再展开详细设计。
> 禁止跳过此表直接写正文——这是方向校准入口。

| 维度 | 内容 | 人类决策 |
|------|------|:---:|
| 影响模块 | CLI 命令层（init/sync/index）+ 新增 lib 模块 + README 文档 | ✅ 同意 |
| 预估文件数 | 5 个文件（1 新建 / 4 修改） | ✅ 同意 |
| 架构变更 | 新增 lib 模块 `model-predownload.ts`（无运行时架构变更，纯 CLI 工具链） | ✅ 同意 |
| 新增依赖 | 无（复用已有 `smol-toml` + 已有 `@huggingface/transformers`） | ✅ 同意 |
| 风险等级 | 🟢低（纯增量功能，不触碰 MCP server 运行链路与模板渲染） | ✅ 同意 |
| 预计轮次 | 2 轮（轮 1 核心模块，轮 2 CLI 集成 + 文档） | ✅ 同意 |
| Review | **生成 Review**（用户指定） | ✅ 同意 |

> **人类确认后**：AI 在下方展开完整 Plan 设计。

---

## 一、背景与目标

### 1.1 问题现状

1. add-coder 的 MCP server（`templates/core/scripts/mcp-server/tools/gateway/helpers.ts`，渲染到各 magicDir）中 `getEmbeddings()` 首次被调用时，通过 `@huggingface/transformers` 的 `pipeline("feature-extraction", "Xenova/bge-small-zh-v1.5")` **自动下载模型**（约 90MB，走 hf-mirror.com）。
2. 该模型**没有预下载机制**：用户第一次触发 DPS 评分/网关功能时会被迫等待 1-2 分钟下载，网络波动时静默失败，且无任何提示。
3. 模型名 `Xenova/bge-small-zh-v1.5` 的唯一真源在 `src/caijuehub/dps-scoring-rules.toml` 的 `[embedding] model`（经 `add-coder generate` 转录进 `DPS_SCORING_CONFIG.EMBEDDING_MODEL`），但**没有任何 CLI 命令主动消费它**。

### 1.2 目标

1. 新增模型预下载能力：
   - `add-coder init`：自动检测并下载 embedding 模型（`--skip-model` 可跳过）
   - `add-coder sync`：默认仅检测缺失并提示；`--model` 触发下载
   - `add-coder model:download`：独立命令手动下载（`--force` 强制重下）
2. **幂等**：本地缓存已存在则跳过（不重复下载）。
3. **失败不阻断**：init/sync 中下载失败仅 warn，主流程继续（运行时首次调用会自动补下载兜底）；显式 `model:download` 失败才抛错退出。
4. **零硬编码**：模型名从 `dps-scoring-rules.toml` 读取，与 generate 链路同源；缺失即报错，无兜底默认值。

---

## 二、方案选型（如有多个候选方案）

### 2.1 候选方案对比

| 方案 | 无额外手动步骤 | CI/脚本可复用 | 可控重下 | 实现成本 | 结论 |
|------|:---:|:---:|:---:|:---:|------|
| A: 项目内独立脚本 scripts/predownload-model.ts，用户手动跑 | ❌ | 🟡 | ❌ | 低 | ✗ 用户仍要手动，与问题现状无本质区别 |
| B: CLI 集成（init 自动 + sync 检测 + model:download 独立命令） | ✅ | ✅ | ✅ | 中 | ✅ 采纳 |
| C: 仅 init 挂入下载，无独立命令 | ✅ | 🟡 | ❌ | 低 | ✗ sync 场景与手动重下无入口 |

### 2.2 选型理由

- B 方案把"环境就绪"纳入 init/sync 的既有职责（init 已做 db-ensure、依赖安装等环境准备），符合用户"init/sync 时走脚本拉模型"的诉求。
- 独立 `model:download` 命令为 CI 预拉取、`--force` 重下提供显式入口，也作为 sync 提示的指向目标。
- ~~不触碰 MCP server 运行链路（`helpers.ts`）——运行时的自动下载兜底保留，双保险。~~ → helpers.ts 增加与 CLI 同源的 `env.cacheDir` 锚定（3 行，不改推理逻辑）：实现期发现 transformers v3 默认 cacheDir 指向**包内 .cache**（pnpm 下 node_modules/.pnpm/...，重装即丢、多仓库不共享）——不锚定则「CLI 预下载位置 ≠ 运行时期望位置」，预下载功能失效 [2026-08-07 修订: 实现验证 transformers v3 默认缓存位置]

---

## 三、架构设计

### 3.1 数据流转（文件级，标注关键行号与回退路径）

```
src/caijuehub/dps-scoring-rules.toml  [embedding] model  ← 唯一真源
  │  （tsup 构建时已复制 → dist/caijuehub/dps-scoring-rules.toml）
  ▼
src/lib/model-predownload.ts  resolveEmbeddingModel()
  │  smol-toml parse（与 transcribe.ts 同库）；段缺失/值为空 → 抛错（零兜底）
  ▼
src/lib/model-predownload.ts  ensureEmbeddingModel(force?, skip?, timeoutMs?)
  ├─ skip=true ────────────────→ 返回 status: "skipped"
  ├─ 缓存已存在（且 !force）     → 返回 status: "already-cached"
  └─ 缺失 → 动态 import @huggingface/transformers
        env.remoteHost = "https://hf-mirror.com"（与 helpers.ts 一致）
        env.remotePathTemplate 指向模型的 resolve/revision 路径（与 helpers.ts 一致）
        pipeline("feature-extraction", model) 加载 → 执行一次小推理验证
        → 返回 status: "downloaded"
  │
  └─ 任一步抛错 → 由调用方决策：
        init/sync：catch → console.warn（不阻断主流程）
        model:download 独立命令：抛出 → 非零退出
```

**回退路径**：任何下载失败场景下，运行时 `getEmbeddings()` 首次调用仍会自动补下载（helpers.ts 既有行为不变）——本功能是优化体验，不是唯一路径。

**超时控制 [回流: Review P1 #1]**：`ensureEmbeddingModel` 增加 `timeoutMs` 选项（默认 5 分钟，透传给下载/推理验证过程）；断网/慢网时超时视为下载失败，抛错走调用方 warn 降级路径，避免 `init` 长时间挂起（transformers.js 默认不超时）。

### 3.2 组件关系

```
src/cli/index.ts（命令注册）
  ├── init --skip-model → src/cli/commands/init.ts → ensureEmbeddingModel(skip)
  ├── sync --model     → src/cli/commands/sync.ts → isModelCached / ensureEmbeddingModel
  └── model:download [--force] → ensureEmbeddingModel(force)
```

### 3.3 数据模型变更

无（纯 CLI 工具链，不涉及数据库/模板渲染/运行时）。

### 3.4 Plan→Spec 实施映射

| Plan 设计决策 | Spec 实施 | 文件 | 关键变更 |
|------|------|------|------|
| 新增预下载核心模块：模型名从 dps-scoring-rules.toml 读取（零硬编码、缺失报错） | Spec §1 resolveEmbeddingModel | `src/lib/model-predownload.ts` | 新建模块：smol-toml 解析 [embedding] model |
| 幂等缓存检测 + 下载执行 + 小推理验证（hf-mirror 镜像配置与 helpers.ts 一致） | Spec §1 ensureEmbeddingModel/isModelCached | `src/lib/model-predownload.ts` | 新建模块：缓存判定 + pipeline 加载 + 推理验证 |
| CLI 新命令 model:download + init --skip-model + sync --model | Spec §2 命令注册 | `src/cli/index.ts` | 注册 1 新命令 + 2 个新选项 |
| init 挂入自动下载，失败仅 warn 不阻断 | Spec §3 init 集成 | `src/cli/commands/init.ts` | finalize 前调用 ensureEmbeddingModel，catch 降级 |
| sync 默认检测提示，--model 下载，失败不阻断 | Spec §4 sync 集成 | `src/cli/commands/sync.ts` | 流程尾部插入检测/下载逻辑 |
| README 命令文档同步 | Spec §5 文档 | `README.md` | CLI 命令章节补充说明 |

---

## 四、实施 Task 概要

> **Plan/Tasks 边界**：本文是概要表（Task # + 文件 + 说明 + 验收），供 HITL 审核和架构概览。
> 详细子任务拆解 + 验证证据见 `.qoder/specs/add-coder-model-predownload/tasks.md`（含 Plan→Task 映射表）。

```
轮次 1: 预下载核心模块
  └── Task 1.1: 新增 src/lib/model-predownload.ts（模型名解析 + 缓存检测 + 下载执行）（1 文件）
        │  tsc --noEmit 独立验证（无消费者也可编译）
        ▼
轮次 2: CLI 集成 + 文档
  ├── Task 2.1: index.ts 注册 model:download / --skip-model / --model（1 文件）
  │     │  消费轮 1 导出的 ensureEmbeddingModel
  │     ▼
  ├── Task 2.2: init.ts 挂入自动下载（1 文件）
  │     │  消费轮 1 导出函数
  │     ▼
  ├── Task 2.3: sync.ts 挂入检测/下载（1 文件）
  │     │  消费轮 1 导出函数
  │     ▼
  └── Task 2.4: README.md 命令说明更新（1 文件）
        │  tsc + eslint 独立验证
        ▼
    端到端验证：model:download 实际下载 + init/sync 幂等回归
```

> **详细子任务 + 验证证据见 tasks.md**——Plan 只定义轮次边界和依赖顺序，不展开每个 Task 的子步骤。

---

## 五、验收标准

- [ ] `npx tsc --noEmit` 零错误（add-coder 仓库）
- [ ] `npx eslint src/` 零 error
- [ ] `add-coder model:download` 首次执行成功下载模型，`~/.cache/huggingface/hub/models--Xenova--bge-small-zh-v1.5/snapshots/` 出现模型文件
- [ ] 二次执行幂等：输出 `already-cached`，不重复下载
- [ ] `add-coder init --skip-model`（dry-run 验证）不触发下载
- [ ] `add-coder sync` 检测到缓存存在时无警告提示
- [ ] `add-coder sync --model` 在缓存缺失时触发下载，成功后 `~/.cache/huggingface/hub/models--Xenova--bge-small-zh-v1.5/snapshots/` 出现模型文件 [2026-08-07 补充: Review 前评估小建议 #2]
- [ ] `add-coder model:download --force` 在缓存已存在时强制重下（验证重下动作发生） [2026-08-07 补充: Review 前评估小建议 #2]
- [ ] 模型名零硬编码：修改 dps-scoring-rules.toml 的 [embedding] model 后，下载目标随之变化（以代码 grep 无硬编码为准）
- [ ] 下载失败（模拟断网）时 init/sync 不中断退出

> **降级边界声明 [回流: Review P2 #3]**：主入口 `model:download` 严格抛错（非零退出，零兜底）；辅入口 `init`/`sync` 对模型预下载失败**降级 warn 不阻断**主流程——这是「次要入口不阻断主流程」的设计取舍，与「模型名缺失即报错（零兜底）」不冲突：零兜底针对**配置缺失**（resolveEmbeddingModel 抛错），降级针对**下载失败**（ensureEmbeddingModel 抛错）。
>
> **模型源一致性提示 [回流: Review P2 #4]**：`model:download` 输出中提示「以 `add-coder generate` 生成的配置为准」（用户改渲染产物未跑 generate 时可能存在模型不一致，提示不阻断）。
>
> **skip 可观测输出 [回流: Review P2 #5]**：`init --skip-model` 也打印一行状态（如 `模型预下载: skipped`），不静默（ADD-1）。

> **缓存路径实现约束（2026-08-07 补充 + 回流: Review P1 #2）**：缓存检测不得硬编码 `~/.cache/...` 字符串。实现优先级：**① 加载 transformers 后读 `env.cacheDir`（与下载路径同源，杜绝「检测说已缓存但库仍重下」的不一致）；② 库未暴露时回退 `os.homedir()` 拼接 `/.cache/huggingface/hub`（兼容 Windows `%USERPROFILE%\.cache\huggingface\hub`）**。检测路径与下载路径必须同源。

---

## 六、关联文档

| 文档 | 路径 |
|------|------|
| ADD Route | `.qoder/plans/2026-08/07/add-coder-model-predownload-add-route-v1.md` |
| Handoff | `.qoder/plans/2026-08/07/add-coder-model-predownload-handoff-v1.md`（Step 8 生成） |
| Review | `.qoder/reviews/add-coder-model-predownload-review-v1.md` |
| Spec | `.qoder/specs/add-coder-model-predownload/spec.md` |
| Tasks | `.qoder/specs/add-coder-model-predownload/tasks.md` |
| Checklist | `.qoder/specs/add-coder-model-predownload/checklist.md` |
