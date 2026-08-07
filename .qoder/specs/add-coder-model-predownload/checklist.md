# Checklist: add-coder-model-predownload

> **证据规范**：每项 [x] 必须附带可验证证据。不得空勾选、不得推测通过。
> - `[T]` = 编译期验证—证据: 命令+结果（如 `tsc=0`）
> - `[R]` = 运行时验证—证据: 部署后确认（如 `model:download` 实际下载）
> - `[E]` = 静态检查—证据: grep/diff 输出

## 一、编译与 Lint 门禁

- [x] [T] `npx tsc --noEmit` 零错误 — 证据: tsc=0 error|审计: cmsihd2da000knllzdiaw1w0a
- [x] [T] `npx eslint src/` 零 error — 证据: eslint=0|审计: cmsihd2da000knllzdiaw1w0a
- [x] [E] 模型名零硬编码 — 证据: `grep -rn "Xenova" src/lib/model-predownload.ts` 无匹配（模型名必须来自 toml）|审计: cmsihd2da000knllzdiaw1w0a
- [x] [E] 无兜底默认模型名 — 证据: `resolveEmbeddingModel` 无 `?? "Xenova/..."` 或 `||` fallback（仅 options 默认值 3 处）|审计: cmsihd2da000knllzdiaw1w0a

## ADD 规则合规检查

- [x] [E] ADD-1 可观测性优先 — 证据: 下载过程有状态输出（skipped/already-cached/downloaded），失败路径有 warn 输出
- [x] [E] ADD-2 打点标记对称 — 证据: ensureEmbeddingModel 每次调用有明确返回状态，无"只进不出"路径
- [x] [E] ADD-6 失败路径等价审计 — 证据: catch 块含错误消息（不静默吞掉），init/sync 与 model:download 失败处理差异有注释说明
- [x] [E] Plan/Spec 一致性 — 证据: check_spec_sync 结果（附录派生副本/跨 Plan 声明）|审计: cmsihd2da000knllzdiaw1w0a
- [x] [E] Plan/Spec 修订记录 — 证据: record_dev_operation 审计ID（回流 5/5 + 实现期发现 2 次修订）|审计: cmsihd2da000knllzdiaw1w0a

## 跨项目联调检查（涉及多仓库时必做）

### 格式契约

- [x] [T] `ensureEmbeddingModel` 返回的 `ModelDownloadResult` 三字段（status/model/cacheDir）与 Spec §2 定义一致
- [x] [T] `--skip-model` / `--model` / `--force` 三个 CLI 选项在 index.ts 注册名与 init.ts/sync.ts 消费名一致

### 框架版本

- [x] [T] `@huggingface/transformers@3.8.1` 的 `pipeline`/`env.remoteHost`/`env.remotePathTemplate` API 与 add-coder 运行环境一致（helpers.ts 同款用法，实机下载验证）
- [x] [T] `smol-toml` 已存在于 dependencies（package.json 校验，不新增依赖）

### 环境变量

- [x] [T] 不引入新环境变量（模型名来自 toml，镜像地址与 helpers.ts 一致硬编码为 hf-mirror.com；缓存目录尊重 HF_HUB_CACHE/HF_HOME 既有变量）

### E2E curl

- [R] `add-coder model:download` 实际下载成功 — 证据: `~/.cache/huggingface/hub/models--Xenova--bge-small-zh-v1.5/snapshots/` 存在模型文件
- [R] 二次执行幂等 — 证据: 输出 `already-cached` 且无网络下载
- [R] `add-coder sync` 缓存存在时无警告 — 证据: 控制台输出无 warn
- [R] `add-coder init --dry-run --skip-model` 不触发下载 — 证据: 控制台无下载日志

---

> **流程衔接（AI 执行指令）**：
>
> 当所有 `[T]` 编译期检查项均为 `[x]` 时（`[R]` 项可保持 `[ ]`），AI 必须执行：
>
> 0. **落库同步**：调用 `plan_track({ planName: "add-coder-model-predownload-plan-v1" })` 将 checklist 路径同步到 PlanRecord 表
> 1. **读取** `review-implementation-template.md`，逐项填写实现审查内容
> 2. **读取** `review-runtime-template.md`，复制为 `.qoder/reviews/add-coder-model-predownload-review-runtime.md`
>    - 替换占位符（标题、关联文档路径）
>    - §1 发现列表初始化为 "尚无运行时发现"
>    - §1 末尾自动插入本 checklist 中所有 `[R]` 项的清单，标记为 "待运行时验证"
> 3. **提示用户**："review-runtime.md 已就绪，包含 N 项运行时验证。部署后 `npm run dev` 启动时会扫描此文件。"
