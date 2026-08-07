# add-coder-model-predownload-review-v1

## Review 元信息

- **Review 对象**: `add-coder-model-predownload-plan-v1.md`（Plan 方案评审）
- **对比方案**: 方案 B（CLI 集成）vs 方案 A（独立脚本）vs 方案 C（仅 init）
- **Review 时间**: 2026-08-07
- **Review 类型**: 方案选型 + 架构决策
- **前置阅读**: `.qoder/plans/2026-08/07/add-coder-model-predownload-plan-v1.md`、`.qoder/specs/add-coder-model-predownload/spec.md`、`src/caijuehub/dps-scoring-rules.toml`

---

## HITL 发现总览（一次性提交人类审核）

> **规则**：AI 必须先在此表中列出 **所有发现**，等待人类一次性审核通过后再逐项推进。
> 禁止边发现边修改——这是批量审批入口，不是逐条对话。

| # | 严重度 | 类别 | 发现摘要 | 建议措施 | 人类决策 |
|---|:---:|------|---------|---------|:---:|
| 1 | 🟡 中 | 健壮性 | `ensureEmbeddingModel` 下载无超时控制：断网/慢网时 `init` 可能长时间挂起（transformers.js 下载默认不超时） | 增加超时参数（默认 5 分钟），超时抛错走 warn 降级路径 | ✅ 接受 |
| 2 | 🟡 中 | 兼容性 | 缓存检测硬编码 `~/.cache/huggingface/hub/`，与 transformers.js v3 实际缓存解析（`HF_HOME`/`env.cacheDir`/XDG 覆盖）存在不一致风险：检测说"已缓存"但库仍重新下载，或反之 | `isModelCached` 的 cacheDir 从 transformers `env.cacheDir`（加载后）读取，而非硬编码；检测路径与下载路径同源 | ✅ 接受 |
| 3 | 🟢 低 | 规范 | Spec §5 `sync` 中 `resolveEmbeddingModel()` 失败仅 warn——与"配置缺失即报错"零兜底规范表面冲突（实际为"次要入口不阻断主流程"的设计取舍） | Plan/Spec 中显式声明：主入口（model:download）严格抛错，辅入口（sync 检测）降级 warn 的边界与理由 | ✅ 接受 |
| 4 | 🟢 低 | 一致性 | 预下载模型名来自 npm 包内 toml，运行时 DPS 用的 EMBEDDING_MODEL 来自各 magicDir 渲染产物——若用户改渲染产物未跑 generate，存在模型不一致可能 | `model:download` 输出中提示"以 `add-coder generate` 生成的配置为准"（不阻断） | ✅ 接受 |
| 5 | 🟢 低 | 可观测性 | `init --skip-model` 时无任何输出，用户无法感知跳过动作 | skip 时也打印一行（如 `模型预下载: skipped`），保持状态可观测（ADD-1） | ✅ 接受 |

> **审批记录（2026-08-07）**：HITL PLAN_REVIEW round 2 TONGYI（`cmsih1wtd000gnllzjw11gl0g`）。5 项发现全部接受，已回流 Plan §3.1/§五 + Spec §2/§3/§4/§5（`[回流: Review]` 标记，回流完整度 5/5）。

> **人类确认后**：AI 在下方逐条展开详细分析。每一条展开时必须引用上方编号。

---

## 1. 问题复现

add-coder 的 MCP server `getEmbeddings()` 首次调用时自动下载 `Xenova/bge-small-zh-v1.5`（约 90MB，hf-mirror.com），存在三个问题：
1. 下载时机不可控：用户首次触发 DPS 功能时才被迫等待 1-2 分钟；
2. 无预下载入口：CI/离线环境无法提前拉取；
3. 无幂等与失败提示：网络波动时静默失败。

Plan 提出 CLI 集成方案（init 自动 + sync 检测 + model:download 独立命令）解决以上问题。本次 Review 聚焦方案完备性与边界条件。

---

## 2. 方案对比（如有多个方案）

### 2.1 方案 A（独立脚本 scripts/predownload-model.ts）

- 优点：实现成本最低、不触碰 CLI 面
- 缺点：用户仍需手动执行、无幂等/无 --force、CI 复用性差、与 init/sync 无集成

### 2.2 方案 B（CLI 集成，Plan 采纳）

- 优点：环境就绪职责与 init（db-ensure/依赖安装）一致；`model:download` 提供显式入口；`--force` 可控重下；失败不阻断 init/sync（运行时自动补下载兜底）
- 缺点：CLI 面增加 1 命令 + 2 选项；需处理缓存路径一致性、超时等边界（见发现 #1/#2）

### 2.3 方案 C（仅 init 挂入）

- 缺点：sync 场景与手动重下无入口，CI 预拉取不友好

**选型结论**：方案 B 正确。三入口覆盖"安装自动 / 增量提示 / 显式重下"全部场景。

---

## 3. 决策结论

方向正确，具备执行基础。以下 5 项发现需在进入 Step 1 前闭环（2 项 🟡 必改，3 项 🟢 建议改）：

- #1 下载超时控制（🟡 P1）：`ensureEmbeddingModel` 增加 `timeoutMs` 选项，默认 5 分钟；超时视为下载失败走 warn 降级
- #2 缓存路径同源（🟡 P1）：`isModelCached` 的 cacheDir 通过加载 `env` 后的 `env.cacheDir` 获取（与下载同源），不做路径硬编码；若库未暴露则回退默认路径并在注释说明
- #3 sync 降级边界声明（🟢 P2）：Spec §5 补充"辅入口降级"与零兜底规范的边界说明
- #4 模型源一致性提示（🟢 P2）：`model:download` 输出提示以 generate 产物为准
- #5 skip 可观测输出（🟢 P2）：`init --skip-model` 打印一行 skipped 状态

---

## 4. 影响评估

### 4.1 受影响文件

- `src/lib/model-predownload.ts`（新增，含 #1/#2 修改）
- `src/cli/index.ts`（新增 model:download 命令 + 2 选项）
- `src/cli/commands/init.ts`（挂入下载，#5）
- `src/cli/commands/sync.ts`（挂入检测，#3）
- `README.md`（命令说明）

### 4.2 数据流影响

- 新增数据流：`dps-scoring-rules.toml` → `resolveEmbeddingModel()` → `ensureEmbeddingModel()` → 本地缓存 `~/.cache/huggingface/hub/`（多仓库共享）
- 无运行时数据流变更（MCP server `getEmbeddings()` 链路不动）

### 4.3 回滚风险

- 🟢 低：纯增量功能。回滚 = 移除 5 处变更，不影响既有 init/sync 行为（未挂入前行为不变）；模型缓存文件可保留（幂等复用）
