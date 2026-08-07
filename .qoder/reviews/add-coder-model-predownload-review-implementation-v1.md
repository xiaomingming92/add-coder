# add-coder-model-predownload-review-implementation-v1

## Review 元信息

- **Review 对象**: add-coder-model-predownload 实现（src/lib/model-predownload.ts + CLI 集成 + helpers.ts 同源锚定）
- **关联方案 review**: `.qoder/reviews/add-coder-model-predownload-review-v1.md`
- **Review 时间**: 2026-08-07
- **Review 类型**: 实现 review（ADD 0.1.2 / ADD-10 语义对齐）
- **前置阅读**: `.qoder/plans/2026-08/07/add-coder-model-predownload-plan-v1.md`、`.qoder/specs/add-coder-model-predownload/spec.md`、`checklist.md`

---

## HITL 发现总览（一次性提交人类审核）

> **审批记录（2026-08-07）**：HITL PLAN_REVIEW round 3 TONGYI（widget 逐项拍板）。5 项发现全部接受。

| # | 严重度 | 检查维度 | 发现摘要 | 建议措施 | 人类决策 |
|---|:---:|------|---------|---------|:---:|
| 1 | 🟡 中 | 契约一致性 | sync.ts JSDoc `@param` 未补 `model` 参数说明——文档与签名漂移（注释里只列 adapter/patch/interactive） | 补 1 行 JSDoc（`@param {boolean} [options.model]`） | ✅ 接受 |
| 2 | 🟢 低 | 可观测性 | `skip` 路径返回 `model`/`cacheDir` 空串——当前三调用方（init/sync/model:download）均已处理空值打印，但契约允许空串语义未文档化 | 在 ModelDownloadResult 类型注释注明「skipped 时 model/cacheDir 为空串」 | ✅ 接受 |
| 3 | 🟢 低 | 结构 | `modelDownloadCommand` 内联在 index.ts（命令实现与注册同文件）——当前 5 行级命令可接受，若未来扩展需拆 commands/ | 记录现状，不阻塞 | ✅ 接受 |
| 4 | 🟡 中 | 失败路径 | `sync --model` 下载失败 warn 后 sync 仍 EXIT=0（辅入口降级），与 `model:download` 非零退出形成差异——语义符合降级边界声明，但需确认用户预期 | 维持现状（降级边界已在 Plan/Spec 显式声明） | ✅ 接受 |
| 5 | 🟢 低 | 测试覆盖 | model-predownload 无单测文件（Plan/tasks 未规划测试）；resolveCacheDir/isModelCached 纯函数逻辑仅靠实机验证覆盖 | P2 记录：后续可补纯函数单测（含 HF_HUB_CACHE/HF_HOME 回退链） | ✅ 接受 |

---

## 1. 跨仓库格式契约

| API | 发送方 | 期望类型 | 接收方 | 实际类型 | 匹配? |
|-----|--------|---------|--------|---------|:---:|
| `ensureEmbeddingModel()` 返回 | `src/lib/model-predownload.ts:58-66` | `ModelDownloadResult`（status/model/cacheDir） | init.ts / sync.ts / index.ts | 同型三字段 | ✅ |
| CLI 选项 `--skip-model` | index.ts 注册（camelCase `skipModel`） | `InitOptions.skipModel?: boolean` | init.ts 消费 | 一致 | ✅ |
| CLI 选项 `--model` | index.ts 注册 | `SyncOptions.model?: boolean` | sync.ts 消费 | 一致 | ✅ |
| CLI 选项 `--force` | index.ts 注册 | `ModelDownloadOptions.force?: boolean` | modelDownloadCommand 消费 | 一致 | ✅ |
| `env.cacheDir` 解析链 | CLI `resolveCacheDir()` | `HF_HUB_CACHE → HF_HOME/hub → os.homedir()/.cache/huggingface/hub` | 模板 `helpers.ts getEmbeddings()` | 同一解析链（同源锚定） | ✅ |

- [x] 所有字段名和嵌套结构一致
- [x] 响应格式（控制台输出）匹配调用方解析（状态字面量 skipped/already-cached/downloaded）

## 2. 框架版本兼容性

- [x] `@huggingface/transformers@3.8.1` 已安装（package.json dependencies）
- [x] 实机验证：`pipeline("feature-extraction", model)` + `env.remoteHost/remotePathTemplate` 用法与 helpers.ts 既有同款，下载成功
- [x] **实现期发现（已修复）**：transformers v3 默认 `env.cacheDir` 指向**包内 .cache**（pnpm 下 node_modules/.pnpm/...）——CLI 侧显式锚定用户级缓存；模板 helpers.ts 同源锚定，否则「CLI 预下载位置 ≠ 运行时期望位置」预下载失效
- [x] `smol-toml@1.7.0` 已在 dependencies，无新增依赖

## 3. 数据模型约束

- [x] 无 Prisma 数据模型变更（纯 CLI 工具链）
- [x] `ModelDownloadResult` 契约：skipped 时 model/cacheDir 空串已注释注明（发现 #2 落地）

## 4. 环境变量加载链

- [x] 无新增环境变量；尊重既有 `HF_HUB_CACHE` / `HF_HOME`（用户可通过环境变量覆盖缓存目录，与 transformers 官方解析同源）
- [x] 镜像地址 `hf-mirror.com` 与 helpers.ts 既有硬编码一致（不引入新变量）

## 5. 多 API 场景匹配

- [x] 主入口 `model:download`（严格抛错非零退出）vs 辅入口 init/sync（catch 后 warn 不阻断）——场景差异符合 Plan/Spec 降级边界声明（发现 #4 确认维持）
- [x] 同步检测 `isModelCached()`（零网络，供 sync 快速判断）vs 异步 `ensureEmbeddingModel()`（含下载）——场景匹配正确

## 6. E2E 验证

- [x] `model:download` 首次实机下载成功（~90MB，`downloaded`，缓存落 `/home/xmm/.cache/huggingface/hub`）
- [x] 二次执行幂等（`already-cached`，无重复下载）
- [x] `--help` 三命令冒烟：`model:download` / `init --skip-model` / `sync --model` 注册正确
- [ ] [R] `init --skip-model` 不触发下载（dry-run 验证）— 待运行时
- [ ] [R] `sync` 缓存缺失提示 / `sync --model` 触发下载 — 待运行时
- [ ] [R] 下载失败（模拟断网）init/sync 不中断退出 — 待运行时

## 7. 关联 Checklist

- 本 review 的检查项与 `.qoder/specs/add-coder-model-predownload/checklist.md` 的"跨项目联调检查"章节一一对应
- [x] checklist 全部 [T]/[E] 项已通过并勾选，[R] 项流转 review-runtime

---

## 8. 实施修正记录（2026-08-07，Review 决策后执行）

> 依据 §HITL 总览决策（#1-#5 全部接受），以下修正已落地并复验。

| # | 修正内容 | 落地证据 | 复验 |
|---|---------|---------|------|
| 1 | sync.ts JSDoc 补 `@param {boolean} [options.model]` 行 | sync.ts L108（JSDoc 块） | ✅ tsc=0 |
| 2 | `ModelDownloadResult` 类型注释注明「skipped 时 model/cacheDir 为空串」 | model-predownload.ts L58-66 | ✅ tsc=0 |
| 3 | 记录现状：modelDownloadCommand 内联 index.ts（扩展时拆 commands/） | 本文件 §1 契约表 + 结构记录 | ✅ 不阻塞 |
| 4 | 维持降级边界：sync --model 失败 EXIT=0（Plan/Spec 已显式声明） | Plan §五 降级边界声明 / Spec §5 | ✅ 无代码变更 |
| 5 | P2 记录：resolveCacheDir/isModelCached 纯函数单测（HF 回退链） | 登记于本文件 §9 + checklist 备注 | ⬜ 后续课题 |

## 9. P2 登记

- **纯函数单测补充**：`resolveCacheDir()` 的 HF_HUB_CACHE/HF_HOME 回退链 + `isModelCached()` 的 models--{org}--{name} 判定，当前仅实机验证覆盖；后续可在 windows-stability.test.ts 追加纯函数单测（无需 mock 网络，仅 mock env/homedir）
