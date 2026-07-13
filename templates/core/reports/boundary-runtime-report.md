# Runtime Reports ↔ 静态 Reports 边界划分

> 定义 `{{projectName}}-runtime-report/`（运行时报告，按子系统分类写入）与 `reports/`（协同手工生成）的职责边界、数据流向和互操作协议。
>
> Runtime Report 包含多个业务域：gateway（边界合约断裂）、rag（检索异常）、agent（Node 执行）等。
> 本文以 **gateway 子系统** 为示例说明边界划分逻辑，规则适用于全部 Runtime Report 子系统。

---

## 两条产线

```
┌─────────────────────────────────┐    ┌─────────────────────────────────┐
│  Runtime Report（gateway 示例）   │    │  Reports 静态分析               │
│  ({{projectName}}-runtime-report/gateway.md)  │    │  (reports/*.md)                 │
├─────────────────────────────────┤    ├─────────────────────────────────┤
│  触发: 运行时异常 / 合约断裂      │    │  触发: 代码扫描 / 人工 review     │
│  作者: appendRuntimeFinding()   │    │  作者: 协同同事                   │
│  格式: 自动追加 Markdown         │    │  格式: 结构化 Issue 列表          │
│  去重: ❌ 无                     │    │  去重: ✅ 合并去重                │
│  优先级: ❌ 无                   │    │  优先级: ✅ P0-P3                │
│  关闭/修复: ❌ 无                │    │  关闭/修复: ✅ ✅⚠️❌ 逐条跟踪      │
└─────────────────────────────────┘    └─────────────────────────────────┘
         │                                      │
         └──────────── 双向联动 ─────────────────┘
              Runtime Finding ⇄ Report Issue
```

---

## 职责边界

### Runtime Report 子系统（以 gateway 为例）的职责

| 职责 | 说明 | 不去做的事 |
|------|------|-----------|
| 捕获运行时异常 | 合约断裂、未处理错误、环境缺失 | 不做静态代码扫描 |
| 去重聚合 | 同一 `source + path + errorMsg` 合并为一条 + 发生次数 | 不做优先级分类 |
| 生成 Issue 草稿 | 首次出现的异常 → 在 `reports/` 下生成 `runtime-issue-{id}.md` | 不人工评估严重度 |
| 验证修复状态 | Reports 标记 ✅ 后，下次请求路径跑通 → 自动写回 `verified_at` | 不自行关闭 Issue |

### Reports 的职责（只做这些）

| 职责 | 说明 | 不去做的事 |
|------|------|-----------|
| 静态代码审查 | 安全漏洞、死代码、架构重复、类型问题 | 不捕获运行时异常 |
| 优先级分类 | P0（立即）/ P1（尽快）/ P2（计划）/ P3（债务） | 不自动生成 Issue |
| 补充根因分析 | Runtime Report 子系统的草稿只含堆栈，Reports 补充业务影响和修复方案 | 不修改 Runtime Report 子系统写入的原始数据 |
| 跟踪修复进度 | ✅ 已修复 / ⚠️ 部分修复 / ❌ 仍存在 | 不做运行时验证 |

---

## 数据流向

```
运行时异常发生
       │
       ▼
appendRuntimeFinding() ─────────────────────────────┐
       │                                             │
       ├── 1. 写入 AuditLog (RUNTIME_ERROR)          │
       │                                             │
       ├── 2. 写入 {{projectName}}-runtime-report/gateway.md         │
       │      └── 去重检查: 同 source+path+errorMsg   │
       │           ├── 已存在 → count++              │
       │           └── 新发现 → 追加 + 生成草稿       │
       │                                             │
       └── 3. 生成 reports/runtime-issue-{id}.md ────┘
                    │
                    ▼ (协同同事接手)
              Reports 人工 triage
                    │
                    ├── 补充优先级、分类、修复建议
                    ├── 合并到 combined-report.md
                    └── 标记为 P1/P2 后 → Plan 流程
                                              │
                                              ▼ (修复完成后)
                                    Reports 标记 ✅
                                              │
                                              ▼ (Runtime Report 运行时验证)
                                   下次请求跑通同一路径
                                   → {{projectName}}-runtime-report/gateway.md 写回 verified_at
                                   → Issue 自动标记为 "已验证"
```

---

## 互操作协议

### 1. Runtime Report → Reports: Issue 草稿

Runtime Report 子系统发现新异常时，在 `reports/` 下生成最小草稿：

```markdown
# RUNTIME-{YYYYMMDD}-{seq}

- **来源**: Gateway 运行时 (`{{projectName}}-runtime-report/gateway.md`)
- **首次发生**: {timestamp}
- **发生次数**: 1
- **错误**: {errorMsg}
- **路径**: {method} {pathname}
- **堆栈**: (见 {{projectName}}-runtime-report/gateway.md 对应条目)

> 此草稿由 Gateway 自动生成，待人工 triage 后合并到 combined-report.md。
```

Reports 侧接收后：
- 确认是否为真实 Bug（排除环境问题）
- 分配优先级和分类
- 补充业务影响描述
- 合并入 `combined-report.md`，原草稿可删除

### 2. Reports → Runtime Report: 验证请求

Reports 中标记为 ✅ 的 Issue，Runtime Report 子系统在下次对应路径的请求中：
- 请求成功 → 写入 `verified_at: {timestamp}` → Issue 自动标记 "已验证"
- 请求仍失败 → 写入 `regression_at: {timestamp}` → Issue 自动回退为 ❌

### 3. 双向引用格式

- `{{projectName}}-runtime-report/gateway.md` 中每条发现增加 `report-issue: RUNTIME-{id}` 引用
- `reports/combined-report.md` 中每条 Issue 增加 `runtime-finding: {{projectName}}-runtime-report/gateway.md#L{line}` 引用
- 确保可双向追溯

---

## 现有问题

| 问题 | 表现 | 修复方向 |
|------|------|---------|
| Runtime Report 无去重 | `{{projectName}}-runtime-report/gateway.md` 452 行，90% 是重复条目 | `appendRuntimeFinding()` 增加去重逻辑 |
| Reports 三份文件重叠 | `suggestions.md` ⊆ `combined-report.md`，`fix-verification.md` 跟踪同一批 Issue | 合并为单一 Issue 注册表 + 每条 Issue 独立文件 |
| 无双向引用 | 两份产物互不知晓对方存在 | 增加 `report-issue` / `runtime-finding` 交叉引用 |
| Runtime Report 不感知 Reports 修复状态 | Reports 标记 ✅ 后 Runtime Report 不知道需要验证 | 增加验证请求协议 |
