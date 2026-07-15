# ADD 模板术语权威规范

> **定位**：项目所有 ADD 模板的术语唯一真相源。模板修改、守卫校验、LLM prompt 均以此为准。
> **消费方**：16 个模板、`doc-format-guard.sh`、`pre-tool-use.sh`、`AGENTS.md`、`.claude/hooks/lib/vocabulary.sh`
> **关联 Plan**：`add-coder-add-template-standardization-plan-v1.md`

---

## 一、术语层级

```
ADD 范式层（纵向，所有 Plan 通用）:
  Step ───── 大写 S，ADD 工作流阶段    例: "Step 3: 代码实现"

实施层（横向，Plan 内部）:
  Round ──── 大写 R，多轮 Plan 的原子事务    例: "第1轮 ── 类型收敛"
  Task ───── 大写 T，单文件/模块工作单元      例: "Task 1: 抽取 BaseChatSchema"
```

Step 和 Round 不冲突——Step 是纵向流程，Round 是 Step 3 内部的事务拆分。单轮 Plan 只用 Step，多轮 Plan 在 Step 3 内部用 Round。

**Phase 已废弃**：单轮 Plan 中 Task 打组带来注意力分散，多轮 Plan 直接用 Round 拆分即可，不需要 Phase 中间层。

## 二、禁止词与替代词

| 禁止 | 替代 | 原因 |
|------|------|------|
| `轮次` | `Step` 或 `Round`（视上下文） | 与两概念都冲突 |
| `阶段` | (已废弃) | Phase 概念已全局移除 |
| `步骤` | `Task` | 与 Task 撞名 |
| `第X步骤` | `Task X` | 同上 |

## 三、各模板术语适用表

| 模板 | 应出现的词 | 不应出现的词 |
|------|--------|---------|
| `plan-template.md` | Step, Task | Round, 轮次, 阶段, 步骤 |
| `simple-plan-template.md` | Step, Task | Round, 轮次, 阶段, 步骤 |
| `spec-template.md` | Requirement | Step,Task |
| `tasks-template.md` Task | Step, Round |
| `checklist-template.md` | (无固定术语) | 阶段, 步骤 |
| `handoff-single-round-template.md` | Step | Round, 轮次 |
| `handoff-multi-round-template.md` | Step, Round, Task 阶段, 步骤 |
| `add-route-template.md` | Step, Task | Round, 轮次 |
| `add-route-template-heavyweight.md` | Step, Task | Round, 轮次 |
| `review-template.md` | (无固定术语) | 阶段, 步骤 |
| `review-implementation-template.md` | (无固定术语) | 阶段, 步骤 |
| `review-runtime-template.md` | (无固定术语) | 阶段, 步骤 |
| `report-template.md` | (无固定术语) | — |
| `runtime-report-template.md` | (无固定术语) | — |
| `fix-verification-template.md` | (无固定术语) | — |
| `handoff-template.md` | Step | Round, 轮次 |

## 四、标题层级规范

```
##  X. 章节名           ← 一级章节（X = 一/二/三 或 1/2/3）
### X.X 子章节名        ← 二级章节
#### 子子章节名          ← 三级章节
```

- §A/§B 字母分区 → 统一改用数字（如 `§A` → `### 3.1 源码关联`）
- plan-template 一级编号用中文数字（一/二/三），handoff 用阿拉伯数字（1/2/3），不变
- 禁止 `#####` 四级标题

## 五、占位符规范

所有模板占位符统一 `{ }` 包裹。守卫检测到未替换占位符 → 阻断写入。

```
{需求名} {核心内容} {版本号} {ISO 时间戳}
{N} {描述} {检查项1} {确认项2}
{项目名} {变更描述} {文件路径} {关键字}
{ACTION_1} {ACTION_2} {ACTION_3}
```

## 六、修订记录

| 版本 | 日期 | 变更 |
|------|------|------|
| v1 | 2026-07-04 | 初版：四层术语 + 禁止词 + 模板适用表 + 标题层级 + 占位符 |
