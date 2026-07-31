# add-coder — ADD 流程 7 项松动 交接手册

> 单轮变更 | DPS=84 | devlog: cms8q3p9w000ouflzff4s7vgl

## 1. 交接前状态

- HITL 哨兵全手动，每次写 plans/ 都要 touch .tongyi-{plan}
- plan_track 手动触发，specs/add-route 生成后可能忘落库
- devlog 遗漏靠人工提醒
- Guardian Phase 0.1 三级文件搜索（PlanRecord 已有 addRoutePath 但不用）
- 模板 schema.json 与 .md 模板严重脱节
- check_spec_sync 冗余扫描 tasks/checklist（plan_track 已覆盖）

## 2. 交接后状态

| # | 能力 | 触发 | 文件 |
|---|------|------|------|
| 1 | DPS ≥ 80 自动建哨兵 | check_dps 返回 | post-tool-use.sh（core+Qoder） |
| 2 | 模板类型前置注入 | plans/ 写入 | pre-tool-use.sh（core+Qoder） |
| 3 | plan_track 自动提醒 | specs/add-route 写入 | post-tool-use.sh |
| 4 | devlog 自动提醒 | add-route Step 8 全[x] | post-tool-use.sh |
| 5 | Guardian MCP 优先 | Guardian 调起 | add-flow-guardian.md |
| 6 | schema 自动 regen 提醒 | templates/*.md 改 | post-tool-use.sh |
| 7 | check_spec_sync 精简 | 工具调用 | check_spec_sync.ts |

## 3. 改动清单

| # | 文件 | 操作 | 内容 |
|---|------|------|------|
| 1 | `templates/core/hooks/post-tool-use.sh` | 修改 | §1 DPS哨兵 + §2 plan_track/devlog/schema |
| 2 | `templates/core/hooks/pre-tool-use.sh` | 修改 | 模板类型前置注入 |
| 3 | `templates/adapters/qoder/hooks/post-tool-use.sh` | 修改 | Qoder 适配版（DPS哨兵 + plan_track 等） |
| 4 | `templates/adapters/qoder/hooks/pre-tool-use.sh` | 修改 | Qoder 适配版模板注入 |
| 5 | `templates/core/agents/add-flow-guardian.md` | 修改 | Phase 0.1 四级降级 MCP 优先 |
| 6 | `templates/.../gateway/check_spec_sync.ts` | 修改 | 精简为 git diff↔add-route |

## 4. 回滚方案

```bash
cd add-coder && git checkout -- \
  templates/core/hooks/ \
  templates/adapters/qoder/hooks/ \
  templates/core/agents/add-flow-guardian.md \
  templates/core/scripts/mcp-server/tools/gateway/check_spec_sync.ts
```

## 5. 执行前置检查

- [x] DPS = 84 🟢 PASS
- [x] `npm run sync` 通过
- [x] core + Qoder adapter 双版本均已适配

## 6. 关键风险点

| 风险 | 影响 | 缓解 |
|------|------|------|
| Qoder adapter input 解析不一致 | hook 不触发 | 分别适配 core 和 Qoder 版本 |
| check_dps 返回值格式变化 | DPS 解析失败 | regex `DPS\s*=\s*\K\d+` 宽松匹配 |

## 7. 恢复上下文审计查询

### 总体一键恢复
```text
query_audit_logs({ keyword: "add-coder-add-flow-loose-coupling" })
```
→ devlog: `cms8q3p9w000ouflzff4s7vgl`

### SQL 管理员验证
```sql
SELECT action, "targetType", "targetId", reason, "createdAt"
FROM "DevOperation"
WHERE "planKeyword" = 'add-coder-add-flow-loose-coupling'
ORDER BY "createdAt" DESC;
```

## 8. 后置确认

- [x] DPS ≥ 80 → post-tool-use 自动建哨兵
- [x] plans/ 写入 → pre-tool-use 注入模板提示
- [x] specs/add-route 写入 → post-tool-use 提醒 plan_track
- [x] Step 8 全 [x] → post-tool-use 提醒 devlog
- [x] Guardian Phase 0.1 plan_status MCP 优先
- [x] 模板改 → schema 提醒
- [x] check_spec_sync 精简
- [x] core + Qoder adapter 双版本适配

## 9. 验收记录（devlog）

### 本轮改了什么
7 项 ADD 流程松动优化全部实施：HITL DPS 自动化（核心）、模板注入、plan_track 提醒、devlog 提醒、Guardian MCP 优先、schema regen、check_spec_sync 精简。core 和 Qoder adapter 双版本均已适配。

### 验收结果
- DPS = 84 🟢 | tasks 7/7 ✅ | checklist 全项通过
- devlog: `cms8q3p9w000ouflzff4s7vgl`

### 遗留项
- 无。重启 IDE 后 hook 生效。

---

### 脱敏要求
无硬编码凭据。
