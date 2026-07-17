# Report 工作流

> Reports 目录的生成、消费、归档规范。遵循 [Runtime Reports ↔ 静态 Reports 边界划分](./boundary-runtime-report.md)。

---

## 目录结构

```
.vscode/reports/
├── REPORT-WORKFLOW.md                ← 本文件
├── boundary-runtime-report.md        ← Runtime Report ↔ 静态 Report 边界划分
├── index.md                          ← Issue 注册表（由 gen-report-index.sh 每天自动生成，勿手动编辑）
├── combined-report.md                ← 当前活跃的综合报告（模板: templates/report-template.md）
├── add-coder-runtime-report/        ← 运行时报告目录（按子系统分类）
│   ├── gateway.md                    ← Gateway 边界合约断裂（appendRuntimeFinding 自动写入）
│   ├── rag.md                        ← RAG 检索异常（未来）
│   └── agent.md                      ← Agent Node 执行异常（未来）
├── runtime-issue-{id}.md             ← Runtime Report 子系统自动生成的 Issue 草稿（人工 triage 后合并删除）
├── suggestions.md                    ← 临时审查建议（合并后删除，内容已归入 combined-report.md）
└── archive/                    ← 历史报告归档
    └── combined-report-{YYYY-MM-DD}.md
```

---

## Report 生命周期

```
                    ┌─────────────────┐
                    │  触发方式        │
                    └───────┬─────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
   全量代码扫描         增量审查            运行时异常
   (定期/按需)        (合并前/发布前)     (Runtime Report 子系统自动)
        │                   │                   │
        ▼                   ▼                   ▼
  新建 combined-        追加 Issue        生成 runtime-issue-{id}.md
  report.md            到已有报告         (草稿，待人工 triage)
        │                   │                   │
        └───────────────────┼───────────────────┘
                            │
                            ▼
                    ┌───────────────┐
                    │  人工 Triage   │
                    │  (协同同事)    │
                    └───────┬───────┘
                            │
                ┌───────────┼───────────┐
                ▼           ▼           ▼
           确认为 Bug   环境问题      已知问题
                │           │           │
                ▼           ▼           ▼
           分配优先级    关闭草稿     合并到已有
           补充根因      (标注原因)    Issue
                │
                ▼
        ┌───────────────┐
        │  进入 Plan 流程 │
        │  (ADD 范式)    │
        └───────┬───────┘
                │
                ▼
        ┌───────────────┐
        │  修复 + 验证   │
        └───────┬───────┘
                │
        ┌───────┴───────┐
        ▼               ▼
    标记 ✅          Runtime Report 运行时验证
    (人工确认)       (自动: 请求路径跑通 → verified_at)
        │               │
        └───────┬───────┘
                │
                ▼
        ┌───────────────┐
        │  归档          │
        │  阶段性完成后   │
        │  移动到 archive/│
        └───────────────┘
```

---

## 何时创建新 Report

| 场景 | 操作 | 说明 |
|------|------|------|
| 首次代码审查 | 新建 `combined-report.md` | 使用 [report-template.md](../templates/report-template.md) |
| 定期全量扫描 | 旧报告 → `archive/`，新建 | 同上 |
| 增量审查（合入前） | 追加 Issue 到已有报告 | 不新建，更新状态列 |
| Runtime Report 新异常 | 生成 `runtime-issue-{id}.md` | 草稿，等待 triage |
| 新建运行时报告子系统 | 新建 `add-coder-runtime-report/{subsystem}.md` | 使用 [runtime-report-template.md](../templates/runtime-report-template.md) |
| 发布前验证 | 基于已有报告生成 `fix-verification-report.md` | 使用 [fix-verification-template.md](../templates/fix-verification-template.md) |

---

## Issue 编号规范

```
RPT-{YYYYMMDD}-{seq}
  │      │        │
  │      │        └── 当日序号，从 01 开始
  │      └─────────── 生成日期
  └────────────────── 固定前缀 (Report)
```

示例：`RPT-20260701-03` = 2026年7月1日第3个 Issue

Runtime Report 草稿使用 `RUNTIME-{YYYYMMDD}-{seq}` 前缀，合并后改为 `RPT-` 前缀。

---

## Triage → Plan 流程

> Runtime Report 草稿经人工 triage 后，转入 ADD 范式 Plan 管线。

```
runtime-issue-{date}-{seq}.md
       │
       ▼ (人工 triage)
   ┌───┴───┐
   ▼       ▼
真实 Bug  环境/测试
   │       │
   │       └── 删除草稿，标注关闭原因
   │
   ▼
创建 runtime-fix-plan-v1.md
   │  命名: {子系统}-runtime-fix-{关键词}-plan-v1.md
   │  位置: .vscode/plans/{YYYY-MM}/{DD}/
   │  模板: plan-template.md
   │
   ▼
进入 ADD 范式（Step 0-9）
   │
   ├── Step 0: 方案设计
   ├── Step 1-3: Spec + Checklist
   ├── Step 4-7: 实施
   ├── Step 8: 验收 → handoff + devlog
   ├── Step 9: Report Closure（runtime-fix plan）→ gateway.md 追 `- [x]`
   │
   ▼
修复完成后 → combined-report.md 标记 ✅
```

### Triage 判定标准

| 判定 | 条件 | 操作 |
|------|------|------|
| **Plan 修复** | 真实 Bug，影响生产或有复发风险 | 创建 runtime-fix-plan → ADD 范式 |
| **关闭** | 环境问题（已修复）、测试触发、不复现 | 删除 runtime-issue 草稿，gateway.md 中标注关闭原因 |
| **合并** | 与已有 Report Issue 重复 | 合并到已有 RPT-{id}，删除草稿 |

### 草稿关闭标记

决定关闭的 runtime-issue 草稿，在 gateway.md 对应发现条目体末尾追加 checklist 标记（`check-boundary-report.ts` L58-60 通过解析 `- [x]` 行判断关闭状态）：

```markdown
- [x] Triage 结果: 已关闭 — {原因}
```

> **格式说明**：使用 `- [x]` checklist 格式而非 `**Triage 结果**` 粗体格式。
> 完整 handoff 集成流程见 [report-handoff-template](../templates/report-handoff-template.md)。
> runtime-fix plan 的 Step 9 Report Closure 负责统一关闭。

---

## 协作协议

### 单人工作

1. 新建 Report → 填充 Issue → 修代码 → 更新状态 → 归档

### 多人协同

1. **生成方**（扫描 / Runtime Report 子系统）: 创建 Report 或 Issue 草稿
2. **Triage 方**（协同同事）: 阅读草稿，确认/关闭，分配优先级
3. **修复方**（开发者）: 按优先级修复，更新 Issue 状态
4. **验证方**（Runtime Report 子系统 / 人工）: 运行时验证或 E2E 验证，写回结果

**冲突避免**:
- 同一 Report 不要两人同时编辑
- 用 Git 管理：`git pull` → 编辑 → `git commit` → `git push`
- 或者拆分为独立 Issue 文件（`issues/RPT-{id}.md`），避免合并冲突

---

## 运行时反馈流程（Runtime Report → Reports）

```
1. Runtime Report 子系统捕获异常
       │
2. appendRuntimeFinding() 去重检查
       ├── 已记录 → count++ → 不生成新草稿
       └── 新异常 → 生成 runtime-issue-{id}.md
              │
3. 协同同事定期扫描 runtime-issue-*.md
       │
4. Triage:
   ├── 真实 Bug → 分配 RPT-{id}, 转入 combined-report.md
   ├── 环境问题 → 标注原因, 删除草稿
   └── 已知问题 → 合并到已有 Issue, 更新 count
```

---

## 验证反馈流程（Reports → Runtime Report）

```
1. combined-report.md 中 Issue 标记 ✅
       │
2. 验证方在 add-coder-runtime-report/gateway.md 中增加验证条目:
   ```
   ### 验证: RPT-{id}
   - 修复版本: commit {hash}
   - 验证路径: {method} {pathname}
   - 预期: {期望行为}
   ```
       │
3. Runtime Report 子系统下次请求经过该路径:
   ├── 成功 → add-coder-runtime-report/gateway.md 追加 verified_at
   └── 失败 → add-coder-runtime-report/gateway.md 追加 regression_at → Issue 回退为 ❌
```

---

## 归档规则

| 条件 | 操作 |
|------|------|
| Report 中所有 Issue 标记 ✅ 或关闭 | 移动到 `archive/combined-report-{YYYY-MM-DD}.md` |
| 新 Report 生成时 | 旧 Report 移动到 `archive/` |
| 单次增量审查完成 | 不归档，持续追加到活跃 Report |
| runtime-issue 草稿已 triage | 合并后删除草稿 |

---

## 关联文档

| 文档 | 路径 | 用途 |
|------|------|------|
| 边界划分 | [boundary-runtime-report.md](./boundary-runtime-report.md) | Runtime Report ↔ 静态 Report 职责边界 |
| Report 模板 | [report-template.md](../templates/report-template.md) | 综合审查报告模板 |
| 运行时报告模板 | [runtime-report-template.md](../templates/runtime-report-template.md) | 子系统运行时报告模板 |
| 修复验证模板 | [fix-verification-template.md](../templates/fix-verification-template.md) | 修复验证对照报告模板 |
| 索引脚本 | [gen-report-index.sh](../../scripts/gen-report-index.sh) | 每日 2:10 AM 自动生成 index.md（cron: [crontab.report.txt](../../scripts/crontab.report.txt)） |
| Plan 索引 | [index.md](../plans/index.md) | Plan 索引（Issue → Plan 关联） |
