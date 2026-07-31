# Spec: ADD 流程 7 项松动

> 对应 Plan: `.qoder/plans/2026-07/31/add-coder-add-flow-loose-coupling-plan-v1.md`

---

## Plan→Spec 映射

| # | Plan 决策 | Spec 节 | 文件 |
|---|-----------|---------|------|
| 1 | HITL DPS 自动化 | Spec 1. 哨兵自动建 | `hooks/post-tool-use.sh` |
| 2 | 模板格式前置注入 | Spec 2. 前置引导 | `hooks/pre-tool-use.sh` |
| 3 | plan_track 自动触发 | Spec 3. 后置同步 | `hooks/post-tool-use.sh` |
| 4 | devlog 自动提醒 | Spec 4. 收敛检测 | `hooks/post-tool-use.sh` |
| 5 | Guardian 用 plan_status | Spec 5. 查询优化 | `agents/add-flow-guardian.md` |
| 6 | schema.json 自动 regen | Spec 6. 模板同步 | `hooks/post-tool-use.sh` |
| 7 | check_spec_sync 精简 | Spec 7. 工具精简 | `tools/gateway/check_spec_sync.ts` |

---

## 1. HITL 哨兵自动化

**Plan 决策**: DPS ≥ 80 自动建哨兵，< 80 Review 兜底
**文件**: `hooks/post-tool-use.sh`

### 触发条件
- MCP 调用 `check_dps` 返回结果
- 解析 DPS 复合值

### WHEN-THEN
- WHEN DPS ≥ 80 → THEN `touch .qoder/hitl/.tongyi-{planKeyword}` + stderr 输出 "✅ HITL 自动通过"
- WHEN DPS < 80 → THEN stderr 输出 "⚠️ DPS={N} <80，需 Review 后手动建哨兵"

### 解析策略
从 MCP 返回值中匹配 `DPS = (\d+)` 提取分值。

---

## 2. 模板格式前置注入

**Plan 决策**: plans/ 写入前注入模板类型提示
**文件**: `hooks/pre-tool-use.sh`

### 触发条件
- Write 路径匹配 `.qoder/plans/**/*.md`

### WHEN-THEN
- WHEN 文件名含 `plan-v` → THEN stderr 注入 "💡 标准 Plan → standard-plan-template.md"
- WHEN 文件名含 `add-route` → THEN stderr 注入 "💡 ADD Route → add-route-template.md"
- WHEN 文件名含 `handoff` → THEN stderr 注入 "💡 Handoff → handoff-single-round-template.md"

---

## 3. plan_track 自动触发

**Plan 决策**: specs/add-route 写入后自动落库
**文件**: `hooks/post-tool-use.sh`

### 触发条件
- Write 路径匹配 `.qoder/specs/` 或 `*add-route*.md`

### WHEN-THEN
- WHEN specs/ 写入 → THEN 从路径提取 plan 名，调 `plan_track({ planName: "..." })` MCP
- WHEN add-route 写入 → THEN 同上

### 降级
MCP 调用失败不阻断写入，仅 stderr 告警。

---

## 4. devlog 自动提醒

**Plan 决策**: Step 8 全 [x] 时提醒写 devlog
**文件**: `hooks/post-tool-use.sh`

### 触发条件
- Write 路径匹配 `*add-route*.md`
- 文件内容扫描：Step 8 所有 checkbox 均为 `[x]`

### WHEN-THEN
- WHEN Step 8 全 [x] → THEN stderr: "⚠️ Step 8 收敛完成！请写 devlog日志(走mcp) → 更新 handoff"

---

## 5. Guardian Phase 0.1 用 plan_status

**Plan 决策**: MCP 查询替代文件搜索
**文件**: `agents/add-flow-guardian.md`

### 变更
Phase 0.1 定位 add-route 改为优先序：
1. `plan_status({ planName })` MCP → 直接拿 addRoutePath
2. 索引 `index.md` 匹配（降级）
3. Plan 文件内引用（再降级）
4. `search_file`（最后兜底）

### WHEN-THEN
- WHEN plan_status 返回 addRoutePath → THEN 直接使用，跳过文件搜索
- WHEN MCP 失败 → THEN 降级到原有三级策略

---

## 6. schema.json 自动 regen

**Plan 决策**: 模板改后自动更新对应 schema
**文件**: `hooks/post-tool-use.sh`

### 触发条件
- Write 路径匹配 `templates/core/templates/*.md`

### WHEN-THEN
- WHEN 模板 .md 改 → THEN 扫描模板实际 `## ` 标题，写入对应 `.schema.json` 的 sections 数组

---

## 7. check_spec_sync 精简

**Plan 决策**: 去掉 plan_track 已覆盖的扫描
**文件**: `tools/gateway/check_spec_sync.ts`

### 变更
保留：git diff ↔ add-route 文件清单一致性校验
去掉：tasks.md / checklist.md 勾选扫描（plan_track 已做）

### WHEN-THEN
- WHEN check_spec_sync 被调用 → THEN 只做 git diff 变更文件 ↔ add-route 附录文件清单比对
