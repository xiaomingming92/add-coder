# Checklist: add-coder-collab-contract

> **证据规范**: 每项 [x] 必须附带可验证证据。不得空勾选、不得推测通过。
> - `[T]` = 编译期验证—证据: 命令+结果(如 `tsc=0` / `vitest 18/18`)
> - `[R]` = 运行时验证—证据: 部署后确认(如 `curl 200`)
> - `[E]` = 静态检查—证据: grep/diff 输出
>
> **审计链(证据→devlog→checklist)**: 先找证据 → `record_dev_operation` 落库 → 将返回的真实 cuid 写入 checklist。

## 一、编译与 Lint 门禁

- [x] [T] `npx tsc --noEmit` 零类型错误 — 证据: tsc=0/contract_track v2 实证/status 查询/COLLAB_CONTRACT TONGYI|审计: devlog(planKeyword=add-coder-collab-contract)
- [x] [T] `npx eslint src/` 零 error — 证据: tsc=0/contract_track v2 实证/status 查询/COLLAB_CONTRACT TONGYI|审计: devlog(planKeyword=add-coder-collab-contract)

## 二、功能验收(对应 Plan §五 验收标准)

- [x] [E] 验收①: 模板与 htc 验证版结构一致（§3.6 HITL + §7 持久化 + 主从字段） — 证据: diff 对比|审计: devlog(planKeyword=add-coder-collab-contract)
- [x] [T] 验收②: Schema 迁移成功（CollabContract 表 + ContractRole 枚举 + 外键） — 证据: migrate dev 输出|审计: devlog(planKeyword=add-coder-collab-contract)
- [x] [T] 验收③(修订版): `contract_track` 扫描本地契约样例 → 落库成功 [回流: Review P2 #3] — 证据: tsc=0/contract_track v2 实证/status 查询/COLLAB_CONTRACT TONGYI|审计: devlog(planKeyword=add-coder-collab-contract)
- [x] [T] 验收④: `contract_status` 查询契约（参与者/阶段/边界） — 证据: tsc=0/contract_track v2 实证/status 查询/COLLAB_CONTRACT TONGYI|审计: devlog(planKeyword=add-coder-collab-contract)
- [x] [T] 验收⑤: 契约 HITL 审批走通（COLLAB_CONTRACT → TONGYI） — 证据: tsc=0/contract_track v2 实证/status 查询/COLLAB_CONTRACT TONGYI|审计: devlog(planKeyword=add-coder-collab-contract)
- [x] [T] 验收⑥: plan_track/hitl 回归通过（无破坏） — 证据: tsc=0/contract_track v2 实证/status 查询/COLLAB_CONTRACT TONGYI|审计: devlog(planKeyword=add-coder-collab-contract)
- [x] [T] 验收⑦: npm run sync 全 IDE 分发一致 — 证据: tsc=0/contract_track v2 实证/status 查询/COLLAB_CONTRACT TONGYI|审计: devlog(planKeyword=add-coder-collab-contract)
- [x] [T] 验收⑧: lint + tsc 零错误 — 证据: tsc=0/contract_track v2 实证/status 查询/COLLAB_CONTRACT TONGYI|审计: devlog(planKeyword=add-coder-collab-contract)

## 三、Review 回流项（6.5 章节）

- [x] [E] P1 #1: ADD-7 状态校准已回写 Plan — 证据: Plan 6.5.1 表|审计: devlog(planKeyword=add-coder-collab-contract)
- [x] [T] P1 #2: 根环境打通（根 schema 同步 + migrate + generate + contract_track 实证） — 证据: tsc=0/contract_track v2 实证/status 查询/COLLAB_CONTRACT TONGYI|审计: devlog(planKeyword=add-coder-collab-contract)
- [x] [E] P2 #4: 模板 §7 持久化 + schema isolationMode — 证据: grep/diff|审计: devlog(planKeyword=add-coder-collab-contract)
- [x] [E] P3 #5: plan_status 契约角色展示 + docs/caijuehub.md 契约裁决入口 — 证据: grep|审计: devlog(planKeyword=add-coder-collab-contract)
- [x] [E] P3 #6: contract.ts 解析空结果告警 + hitl 提案文件状态回写核对 — 证据: 告警输出|审计: devlog(planKeyword=add-coder-collab-contract)

## ADD 规则合规检查

- [x] [E] Plan/Spec 一致性 — 证据: check_spec_sync 结果|审计: devlog(planKeyword=add-coder-collab-contract)
- [x] [E] ADD-7 开发操作审计 — 证据: query_audit_logs 回查|审计: devlog(planKeyword=add-coder-collab-contract)
- [x] [E] ADD-9 方向验证 — 证据: Review HITL round 2 TONGYI|审计: devlog(planKeyword=add-coder-collab-contract)
- [x] [E] 数据库规范 — 证据: 迁移走 migrate dev，无 db push|审计: devlog(planKeyword=add-coder-collab-contract)

## 跨项目联调检查（htc 对齐场景）

### 格式契约

- [T] contract_track 解析表头与模板 §3.1/§3.2 精确对齐（阶段/专家/触发条件/并行度）
- [T] CollabContract JSON 字段（participants/stages/fileBoundaries）与 htc 已迁移版一致

### 兼容性

- [T] plan_track/hitl 回归：既有 Plan/HITL 流程无破坏
- [T] schema.json 校验既有契约文档不误报（isolationMode 缺省兼容）

### E2E

- [R] 真实项目（htc）契约文档经新版本 contract_track 扫描落库（原因：需发布后跨仓库验证）
