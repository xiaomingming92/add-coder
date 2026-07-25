# add-coder — sync-patch 热更新功能 交接手册

> **适用场景**：单轮变更——5 文件在同一轮次内完成，无跨轮文件边界。

---

## 1. 交接前状态

- `sync.ts` 只支持补缺（missing-only），不覆盖已有文件
- 升级 add-coder 后更新模板需三步：`mv .qoder .qoder.backup` → `init --force` → `cp -r .qoder.backup/{plans,specs,reviews} .qoder/`
- 无 hash 机制，无法区分"用户修改"和"add-coder 更新"
- caijuehub 无 sync 规则
- `selectFiles` 交互语义：`[a]` 全选 `[n]` 取消

---

## 2. 交接后状态（目标）

- `npx add-coder sync --adapter=qoder --patch` 一键更新模板
- 双 hash 机制：源 hash（prepare 打 npm） + 产出 hash（init/patch 记用户）
- PATCH_GUARD 保护 plans/specs/reviews，永不触碰
- caijuehub 驱动 `SYNC_CONFIG`（`sync-rules.toml` → `sync.strategy.ts`）
- `selectFiles` 交互统一：`[a]` 全部跳过 `[A]` 全部覆盖
- 交互规范文档化：`docs/interaction-spec.md`
- DPS 75 🟡 WARN（Plan 100, Specs 100, Review 回流 100）
- weather_proxy 实测通过：240→skip14|same226

---

## 3. 改动清单

| # | 文件 | 操作 | 内容 |
|---|------|------|------|
| 1 | `scripts/gen-src-hash.ts` | 新建 | 扫描 253 模板源文件生成 SHA256 前 8 位 hash，排除自身 |
| 2 | `package.json` | 修改 | prepare 追加 `tsx scripts/gen-src-hash.ts` |
| 3 | `src/cli/commands/init.ts` | 修改 | 渲染后写入 `.add-coder-hash.json` 产出 hash 基线 |
| 4 | `src/cli/commands/sync.ts` | 修改 | caijuehub 驱动薄壳，原版流程 100% 保留，--patch 独立分支 |
| 5 | `src/cli/index.ts` | 修改 | sync 命令新增 `--patch` option |
| 6 | `src/lib/select-files.ts` | 修改 | `[a]`/`[A]` 交互语义统一 |
| 7 | `src/caijuehub/sync-rules.toml` | 新建 | sync 行为规则（PATCH_GUARD、hash、prompts） |
| 8 | `src/caijuehub/transcribe.ts` | 修改 | 新增 `genSyncRules` 生成器 |
| 9 | `src/caijuehub/caijue.toml` | 修改 | 注册 `sync-patch` 裁决入口 |
| 10 | `src/caijuehub/adapter-rules.toml` | 修改 | 补全 trae/codex，移除重复段 |
| 11 | `docs/interaction-spec.md` | 新建 | CLI 交互规范文档 |
| 12 | `.qoder/reviews/add-coder-sync-patch-review-v1.md` | 新建 | 方案评审 |
| 13 | `.qoder/specs/add-coder-sync-patch/{spec,tasks,checklist}.md` | 新建 | 三元组 |
| 14 | `.gitignore` | 修改 | 追加 `podman-compose.add.yml` |
| 15 | `podman-compose.add.yml` | 修改 | 移除 `env_file` + `git rm --cached` |
| 16 | `DEVELOPMENT.md` | 修改 | 交互规范入口 |

---

## 4. 回滚方案

```bash
git checkout scripts/gen-src-hash.ts package.json
git checkout src/cli/commands/init.ts src/cli/commands/sync.ts src/cli/index.ts src/lib/select-files.ts
git checkout src/caijuehub/transcribe.ts src/caijuehub/caijue.toml src/caijuehub/adapter-rules.toml
rm -f src/caijuehub/sync-rules.toml src/caijuehub/strategies/sync.strategy.ts
rm -f docs/interaction-spec.md
```

---

## 5. 执行前置检查

- [x] MCP Server 可用（add-dev-tools）
- [x] PostgreSQL 容器运行（add-coder-postgres:5432）
- [x] `npx tsc --noEmit` 通过（25 个预存错误在 mcp-server，不影响）
- [x] weather_proxy `pnpm link add-coder` 生效
- [x] `sync --adapter=qoder --patch` 实测通过
- [x] DevOperation 审计日志 6 条落库（beforeState/afterState 完整）
- [x] DPS 75 🟡 WARN
- [x] MCP Server 环境修复 6 条追加落库（2026-07-25，见下方追加记录）

---

## 6. 执行 Task 摘要

```text
Task 1.1 ── gen-src-hash.ts: 253 模板 SHA256
            │
            ▼
Task 1.2 ── package.json: prepare 追加 tsx
            │
            ▼
Task 1.3 ── init.ts: 渲染后写产出 hash
            │
            ▼
Task 1.4 ── sync.ts: caijuehub 薄壳 + --patch
            │
            ▼
Task 1.5 ── index.ts: --patch option
            │
            ▼
        构建 + weather_proxy 实测 ✅
```

---

## 7. 关键风险点

| 风险 | 影响 | 缓解 |
|------|------|------|
| 源 hash 文件缺失（用户删除） | 全部进 conflict | selectFiles `[a]`/`[A]` 支持批量操作 |
| 产出 hash 文件不存在 | 全部视作用户没改 → auto 覆盖 | 首次 init 即写，不会出现 |
| Write/edit_file 工具虚假成功 | 代码未落盘 | 每次写入后立即 `ls -la` 验证 |

---

## 8. 恢复上下文审计查询（新 AI Session 首次启动必读）

#### 总体一键恢复

```text
query_audit_logs({ keyword: "add-coder-sync-patch" })
```
→ 预期返回 6 条记录

#### 逐文件审计查询

```text
query_audit_logs({ targetId: "scripts/gen-src-hash.ts" })
→ 预期返回 CREATE: Task 1.1 新建 gen-src-hash.ts

query_audit_logs({ targetId: "src/cli/commands/sync.ts" })
→ 预期返回 MODIFY: caijuehub 驱动 + --patch

query_audit_logs({ targetId: "src/cli/commands/init.ts" })
→ 预期返回 MODIFY: 渲染后写产出 hash

query_audit_logs({ targetId: "src/cli/index.ts" })
→ 预期返回 MODIFY: --patch option

query_audit_logs({ targetId: "add-coder-sync-patch-step-3" })
→ 预期返回 STEP_3_IMPLEMENTED: 轮次1全部完成
```

#### 恢复判定标准

- keyword `"add-coder-sync-patch"` 命中 ≥ 6
- grep 验证：

```bash
grep -R "SYNC_CONFIG\|PATCH_GUARD\|gen-src-hash" src/cli/ src/caijuehub/ scripts/
```

---

## 9. 后置确认

- [x] `npx tsc --noEmit` 通过（预存 mcp-server 错误除外）
- [x] weather_proxy 实测 `sync --patch` 通过
- [x] PATCH_GUARD 保护 plans/specs/reviews
- [x] adapter 文件参与冲突交互
- [x] 默认 sync 行为不变
- [x] DevOperation 审计日志 6+6=12 条完整
- [x] MCP Server PROJECT_ROOT 三层推导 + caijuehub 裁决链就绪

---

## 10. 脱敏要求

无凭据信息。配置文件路径均为项目相对路径。

---

## 11. 追加记录：MCP Server 环境修复（2026-07-25）

同步 add-coder v0.3.1 后，add-dev-tools MCP Server 启动失败，根因修复如下：

| # | targetId | action | 说明 |
|---|----------|:--:|------|
| 1 | `.qoder/mcp.json` | MODIFY | `command` 改为绝对路径，`env` 新增 `PROJECT_ROOT` |
| 2 | `package.json` | MODIFY | 安装 `@modelcontextprotocol/server@2.0.0-beta.5` |
| 3 | `.qoder/.../shared/env.ts` | MODIFY | 精简为 `resolveProjectRoot(__dirname)`，消费 caijuehub 策略 |
| 4 | `.qoder/.../shared/project-root-strategy.ts` | CREATE | 裁决层消费：三层 fallback（env_var → dirname → cwd） |
| 5 | `.qoder/.../shared/prisma.ts` | MODIFY | `add-prisma` 路径优先，修复双 DB provider 不匹配 |
| 6 | `src/caijuehub/project-root-rules.toml` | CREATE | 裁决层规则：`tiers = ["env_var", "dirname_fallback", "cwd_fallback"]` |

**恢复查询**：
```text
query_audit_logs({ planKeyword: "add-coder-sync-patch", targetType: "MCP_CONFIG" })
query_audit_logs({ planKeyword: "add-coder-sync-patch", targetType: "CAIJUEHUB" })
```

**数据库修正**（记录写入了错误的 planKeyword，需进容器修）：
```bash
podman exec add-coder-postgres psql -U add-coder_admin -d add-coder -c \
  "UPDATE \"DevOperation\" SET \"planKeyword\" = 'add-coder-sync-patch' WHERE \"planKeyword\" = 'device-registry-refactor';"
```
