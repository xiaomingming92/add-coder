# Tasks: add-coder-model-predownload-v1

> 对应 Plan: `.qoder/plans/2026-08/07/add-coder-model-predownload-plan-v1.md` §四

---

## 轮次依赖（复制自 Plan §四）

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

---

## Plan→Task 映射（对接 Spec 细节）

> 每行对应 Plan §四 的一个 Task。

| Plan Task | 文件 | 验收 | 对应 Spec |
|------|------|------|------|
| 1.1 | `src/lib/model-predownload.ts` | `tsc --noEmit` | Spec §1 §2 |
| 2.1 | `src/cli/index.ts` | `tsc --noEmit` | Spec §3 |
| 2.2 | `src/cli/commands/init.ts` | `tsc --noEmit` | Spec §4 |
| 2.3 | `src/cli/commands/sync.ts` | `tsc --noEmit` | Spec §5 |
| 2.4 | `README.md` | 文档检查 | Spec §6 |

---

## 轮次 1: 预下载核心模块

### Task 1.1: 新增 src/lib/model-predownload.ts — 对应 Spec §1 §2

- [x] 1.1.1 `resolveEmbeddingModel()`：dist 路径 + src 路径双解析（tsup 构建后 toml 在 dist/caijuehub/），smol-toml parse `[embedding] model`，缺失抛错零兜底（审计 cmsih7mvz000jnllzpfw9yfaj）
- [x] 1.1.2 `isModelCached(model)`：检查缓存目录 `models--{org}--{name}/snapshots/` 存在（HF_HUB_CACHE→HF_HOME/hub→os.homedir 回退链，org 拆分兼容无 org 形态）
- [x] 1.1.3 `ensureEmbeddingModel({ force?, skip?, timeoutMs? })`：skip 短路 → 动态 import 后 env.cacheDir 同源判定 → hf-mirror 镜像配置 → pipeline 加载 + 一次小推理验证 → 超时控制（默认 5 分钟）
- [x] 1.1.4 验证：`npx tsc --noEmit` 通过（0 error）+ tsx 冒烟（model/cacheDir/cached 三值正确）

---

## 轮次 2: CLI 集成 + 文档

### Task 2.1: src/cli/index.ts 命令注册 — 对应 Spec §3 | 依赖 Task 1.1

- [x] 2.1.1 新增 `model:download` 命令（`--force` 选项）→ modelDownloadCommand（失败非零退出 + generate 一致性提示 Review P2 #4）（审计 cmsihd2da000knllzdiaw1w0a）
- [x] 2.1.2 `init` 增加 `--skip-model` 选项 → InitOptions.skipModel
- [x] 2.1.3 `sync` 增加 `--model` 选项 → SyncOptions.model
- [x] 2.1.4 验证：`npx tsc --noEmit` 通过 + build 后 `--help` 三命令冒烟

### Task 2.2: init.ts 挂入自动下载 — 对应 Spec §4 | 依赖 Task 2.1

- [x] 2.2.1 InitOptions 接口增加 `skipModel?: boolean`
- [x] 2.2.2 initCommand 主流程调用 `ensureEmbeddingModel({ skip: options.skipModel })`，dry-run 不执行，catch 后 warn 不阻断；skip 也打印状态（Review P2 #5）
- [x] 2.2.3 验证：`npx tsc --noEmit` 通过

### Task 2.3: sync.ts 挂入检测/下载 — 对应 Spec §5 | 依赖 Task 2.1

- [x] 2.3.1 SyncOptions 接口增加 `model?: boolean`
- [x] 2.3.2 syncCommand 流程末尾（patch 与普通分支均覆盖）：maybeModelDownload（resolve 失败 warn / 缓存命中无提示 / 缺失提示 / --model 下载，失败 warn 不阻断；降级边界 Review P2 #3）
- [x] 2.3.3 验证：`npx tsc --noEmit` 通过

### Task 2.4: README.md 命令说明 — 对应 Spec §6

- [x] 2.4.1 CLI 命令章节新增 `model:download`（含 `--force`）、`init --skip-model`、`sync --model` 说明（落 README init 示例后）
- [x] 2.4.2 说明缓存位置 `~/.cache/huggingface/hub/` 多仓库共享特性

> **实现期发现（2026-08-07）**：transformers v3 默认 cacheDir 指向包内 .cache → 追加模板 helpers.ts 同源 env.cacheDir 锚定（3 行，不改推理逻辑）+ `npm run sync` 同步；Plan §2.2/Spec §2 增量修订。实机验证：下载到 ~/.cache/huggingface/hub + 二次幂等 already-cached。

---

## Verification

- [ ] `npx tsc --noEmit` 通过
- [ ] `npx eslint src/` 零 error
- [ ] [R] `add-coder model:download` 实际下载成功（~/.cache/huggingface/hub/models--Xenova--bge-small-zh-v1.5/snapshots/ 出现文件）
- [ ] [R] 二次执行幂等（already-cached，不重复下载）
- [ ] [R] `add-coder sync` 缓存存在时无警告
- [ ] [R] `add-coder init --dry-run --skip-model` 不触发下载

> **生成后**：调用 `plan_track({ planName: "add-coder-model-predownload-plan-v1" })` 将 Tasks 路径同步到 PlanRecord 表。
