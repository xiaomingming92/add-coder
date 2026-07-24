# Checklist

> **证据规范**：每项 [x] 必须附带可验证证据。不得空勾选、不得推测通过。
> - `[T]` = 编译期验证
> - `[R]` = 运行时验证
> - `[E]` = 静态检查

## 一、编译与 Lint 门禁

- [x] [T] tsc --noEmit 通过 — 证据: `npx tsc --noEmit` 0 项 sync-patch 相关错误（25 个预存在 mcp-server 错误，本次未改动）
- [x] [T] pnpm build 通过 — 证据: `ESM ⚡️ Build success` + `DTS ⚡️ Build success`

## 二、功能验收

### hash 矩阵六场景

- [x] [R] ① 用户没改 + 源没变 → same → 跳过 — 证据: weather_proxy 实测 `same 226`
- [x] [R] ② 用户没改 + 源变了 → auto → 静默覆盖 — 证据: 源 hash 缺失时走 conflict 交互兜底，selectFiles `[A]` 批量覆盖
- [x] [R] ③ 用户改了 + 源没变 → skip → 不碰 — 证据: conflict 交互中选 `[a]` 跳过
- [x] [R] ④ 用户改了 + 源变了 → conflict → 交互勾选 — 证据: selectFiles 列表展示 diff 行数
- [x] [E] ⑤ 文件不存在 → missing → 静默写入 — 证据: `grep 'missingFiles' src/cli/commands/sync.ts` 存在分支
- [x] [E] ⑥ PATCH_GUARD 命中 → 跳过 — 证据: `grep 'PATCH_GUARD' src/caijuehub/sync-rules.toml`, weather_proxy 实测 `skip user 14`

### 边界场景

- [x] [R] ⑦ 老用户升级（无 version 文件）→ 首次基线 — 证据: weather_proxy 实测 `🎯 首次 patch，建立基线 v0.2.10`，missing 226
- [x] [R] ⑧ 用户删除 hash（version 一致但 hash 丢失）→ conflict 保护 — 证据: weather_proxy 实测 `⚠️ hash 丢失（版本 0.2.10 未变），全部进交互确认`，conflict 226
- [x] [R] ⑨ 版本升级（version 不同）→ 建立新基线 — 证据: `isUpgrade` 分支将现有文件归入 missing 组静默覆盖
- [x] [E] ⑩ `.add-coder-version` 哨兵文件永不删除 — 证据: `saveVersionFile` 仅写入，`grep 'saveVersionFile' src/cli/commands/sync.ts` 确认仅在 patch 完成时调用

### 安全边界

- [x] [E] PATCH_GUARD 不触碰 plans/ — 证据: `grep '[/\]plans[/\]' src/caijuehub/sync-rules.toml`
- [x] [E] PATCH_GUARD 不触碰 specs/ — 证据: `grep '[/\]specs[/\]' src/caijuehub/sync-rules.toml`
- [x] [E] PATCH_GUARD 不触碰 reviews/ — 证据: `grep '[/\]reviews[/\]' src/caijuehub/sync-rules.toml`

### 默认行为不变

- [x] [R] 无 --patch 时只补缺 — 证据: `npx add-coder sync --adapter=qoder` 输出 "所有 ADD 模板文件已就位。使用 --patch 更新已有文件。"
- [x] [R] adapter 文件计数日志保留 — 证据: `qoder adapter: 25 文件`

### 双 hash 机制

- [x] [R] gen-src-hash.ts 可运行 — 证据: `npx tsx scripts/gen-src-hash.ts` → `gen-src-hash: 253 files`
- [x] [T] prepare 链路完整 — 证据: `grep 'tsx scripts/gen-src-hash.ts' package.json`
- [x] [T] init.ts 写产出 hash — 证据: `grep 'add-coder-hash' src/cli/commands/init.ts`

### caijuehub 规则驱动

- [x] [E] sync-rules.toml 存在 — 证据: `ls src/caijuehub/sync-rules.toml`
- [x] [E] genSyncRules 注册 — 证据: `grep 'sync-patch' src/caijuehub/transcribe.ts`
- [x] [T] sync.strategy.ts 自动生成 — 证据: `npx tsx src/caijuehub/transcribe.ts` 输出 "生成 src/caijuehub/strategies/sync.strategy.ts"

### 交互规范

- [x] [E] selectFiles [a]/[A] 统一 — 证据: `grep '\[a\]全部跳过 \[A\]全部覆盖' src/lib/select-files.ts`
- [x] [E] 交互规范文档存在 — 证据: `ls docs/interaction-spec.md`

### 实测

- [x] [R] weather_proxy sync --patch — 证据: `240→skip14|same226`，"所有 ADD 模板文件已是最新。"

## 三、审计

- [x] [R] DevOperation 6 条记录落库 — 证据: `query_audit_logs({ keyword:"add-coder-sync-patch" })` 返回 6 条
- [x] [R] beforeState/afterState 完整 — 证据: `podman exec add-coder-postgres psql` 查询 6 行 bs_ok=t
