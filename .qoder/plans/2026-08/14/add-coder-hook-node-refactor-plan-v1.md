# add-coder-hook-node-refactor-plan-v1

> **Plan/Spec 边界提醒**：Plan 回答"改什么、为什么改、改哪里"。精确类型定义与 WHEN-THEN 场景见 Spec 文档。

## PLAN 元信息

- **Plan 名称**: hook-node-refactor-v1
- **启动时间**: 2026-08-14
- **主导 AI**: Qoder
- **前序 Plan 联动**: `add-coder-hook-node-migration-plan-v1`（27/32，轮次 8 bash 退役待收官）——本 Plan 完成后才执行退役（bash golden 是本 Plan 每轮行为等价的唯一验证基线；退役后双形态对比失效）
- **后续 Plan 联动**: `add-coder-stop-phase-aware-plan-v1`（2026-08-14 立项）——承接本 Plan 9.4.3「规格已定义、实现未跟进」与 9.4.4④「Q4 双维度」的实链化：Q4 Step 三态分流（step02/step3 象限消费）+ checkAddCompleteness 真实 add-route 定位（修复 checklist 检查恒空转）
- **关联文档**:
  - ADD Route: `.qoder/plans/2026-08/14/add-coder-hook-node-refactor-add-route-v1.md`
  - Handoff: `.qoder/plans/2026-08/14/add-coder-hook-node-refactor-handoff-v1.md`
  - Review: `.qoder/reviews/add-coder-hook-node-refactor-review-v1.md`
- **ADD-7 审计策略**:

| 文件 | targetType | action | beforeState | afterState | 状态 |
|-----|-----------|--------|------------|-----------|------|
| `src/caijuehub/hook-guard-rules.toml`（新建） | COMPONENT | COMPONENT_CREATED | 无（拦截正则硬编码 TS） | 声明式真源（§A 检测链/敏感文件/模板提示/阈值） | 待实施 |
| `src/caijuehub/hook-doc-format-rules.toml`（新建） | COMPONENT | COMPONENT_CREATED | 无（识别规则硬编码 TS） | 声明式真源（token 表/探测链/handoff 识别/反作弊） | 待实施 |
| `src/caijuehub/hook-context-rules.toml`（新建） | COMPONENT | COMPONENT_CREATED | 无（象限文本/模板清单硬编码） | 声明式真源（7 象限/18 模板+优先级） | 待实施 |
| `src/caijuehub/hook-event-rules.toml`（新建） | COMPONENT | COMPONENT_CREATED | 无（阈值硬编码） | 声明式真源（jsonl 轮转/治理日报/事件 schema） | 待实施 |
| `src/caijuehub/hook-protocol-rules.toml`（新建） | COMPONENT | COMPONENT_CREATED | 无（端差异散落入口） | 声明式真源（exit 码/分隔符/5 端输出协议形态） | 待实施 |
| `templates/core/hooks/lib/rules.ts`（生成产物） | COMPONENT | COMPONENT_CREATED | 无 | TOML → 生成常量（_generated 标记，勿手改） | 待实施 |
| `scripts/hook-rules-gen.ts`（新建生成器） | COMPONENT | COMPONENT_CREATED | 无 | TOML → rules.ts 生成 + 漂移校验 | 待实施 |
| `scripts/hook-bake.ts` | COMPONENT | COMPONENT_UPDATED | 仅 bundle | bundle 前注入 rules 常量 | 待实施 |
| `templates/core/hooks/lib/*.ts`（8 lib 收敛） | COMPONENT | COMPONENT_UPDATED | 半类化/过程式 | Guard 服务类收敛（消费 rules 常量） | 待实施 |
| `templates/core/hooks/*.ts`（14 入口薄壳） | COMPONENT | COMPONENT_UPDATED | 过程式 | 薄壳（仅解析+进程语义） | 待实施 |
| `templates/adapters/{5}/hooks/*.ts`（72 入口薄壳） | COMPONENT | COMPONENT_UPDATED | 复制-修改 | 薄壳（仅协议适配，治理 0 复制） | 待实施 |
| `tests/hook-rules.test.ts` + `tests/hook-consistency.test.ts`（新建） | COMPONENT | COMPONENT_CREATED | 无 | 规则漂移校验 + 五端一致性矩阵 | 待实施 |
| `CHANGELOG.md` | DOC | DOC_UPDATED | L12 承诺无证据 | 五端一致性验收证据 + 修订说明 | 待实施 |

---

## HITL 计划总览（一次性提交人类审核）

> **已 TONGYI（round 1, 2026-08-14）**：主旨 + 6 维度拍板通过，含 5 条实施要求已并入本 Plan。

| 维度 | 拍板结论 |
|------|------|
| 主旨 | Hook 治理协议层 v2 扩展：v1 换载体（bash→node）→ v2 扩能力（规则即数据/治理即服务/审计即闭环/一致即可证）；按标准版 Plan 模板完整撰写 |
| core-adapter 关系 | **不是技术分层，而是 ADD 治理能力的组织形式**——治理逻辑收敛 core、adapter 仅协议适配；目的：**熵值管控**（管理 IDE 纷争/漂移，五端行为收敛到单一治理能力出口） |
| 方案选型 | 选 B 聚焦收敛（治理能力组织形式收敛 + 规则下沉 + 审计植入，入口薄壳化） |
| 轮次结构 | 9 轮：规则下沉 + core 收敛 + **5 adapter 各一轮** + 审计 + 验收（每轮双形态对比六端全绿门禁） |
| 文件清单 | 明确化（见 §四 轮次文件边界） |
| 前序联动 | hook-node-migration 27/32 → 本 Plan 完成后才执行 bash 退役 |

> HITL round 1 TONGYI 含 5 条实施要求（主旨/关系表述/轮次/文件清单/联动），与本表 6 维度一一对应 [回流: R7][2026-08-14]

---

## Review 回流记录

| # | 来源阶段 | 严重度 | 发现 | 回流落点 |
|---|:---:|:---:|------|------|
| R1 | Plan Review | 🟡高 | 审计载体二选一思维：Spec §4 链路与实态矛盾（jsonl→MCP 常驻消费已在运行），且未利用各端 handler 形态分化（Claude mcp_tool / Qoder command·http / Codex·VSCode command） | §四轮次 8 重定义：嵌入式三层设计（jsonl 主路径不动 + handlerTypes 维度声明 + Claude mcp_tool 先行）；Spec §4 链路修正；protocol TOML 补 handlerTypes |
| R2 | Plan Review | 🟡高 | adapter 私有 lib 处置缺失（qoder review-checklist 151 行 / context-inject 100 行 / env 解析 23 行），轮次 3-7 实施遇决策空窗 | Spec §3 归类表：review-checklist 收敛 core；env 解析保留协议层；context-inject diff 合并入 core；tasks 3.1/4.1 补处置步骤 |
| R3 | Plan Review | 🟡高 | 数字口径 71 vs 72：实态 adapter 入口 72（claude 16），全文档 71 错误 | 全文档统一 86 = 14 core + 72 adapter；前序 Plan 遗留数字由 9.3 交接修正 |
| R4 | Plan Review | 🟡高 | 轮次 8 文件口径三处漂移；prompt-submit 是否接入未定义（范围扩散风险） | §四轮次 8 口径统一：8.1 = notify.ts + AuditBridge（core lib）；8.2 = 5 端 post-tool-use；prompt-submit 显式不接入 |
| R5 | Plan Review | 🟢中 | CHANGELOG L12 属已发布 0.3.27 条目，修订方式未定义 | 新增版本条目引用 0.3.27 承诺 + 矩阵证据，不改历史条目 |
| R6 | Plan Review | 🟢中 | hook-guard-rules.toml 与已有 guard-rules.toml 职责边界未说明（双 guard 真源混淆风险） | Spec §1 注明分治：guard-rules = 模板 schema 真源；hook-guard-rules = hook 拦截规则真源 |
| R7 | Plan Review | 🟢中 | add-route 映射表缺 Task 8.3 行；Plan 元信息名称与 planName 不一致；HITL 表述 5 条 vs 6 维度 | 三处修正（见元信息与 add-route） |
| R8 | Plan Review | 🟢中 | 本 Plan 改造期间前序 Plan 8.1 双形态测试不可执行，门禁未声明挂起 | §四轮次门禁补：前序 8.1 测试挂起，9.3 统一复核 |
| I1 | 实施期（轮次 6） | 🟢中 | Trae 官方支持「导入 Claude hooks 配置」（docs.trae.cn Web 实证）——与 Claude Code hooks.json 四层结构/事件/stdin·stdout·exit 完全兼容；trae 适配不应只提供 self 独立分发一种模式 | adapter-rules.toml 新增 [hook_source]（trae 默认 self，用户可选 claude-import——复用 .claude 产物零额外分发）；sync-magic 按模式跳过 hooks 分发；阻断型事件（PreToolUse/Stop）协议差异时需保持 self（TOML 注明 + checklist 后续项实证） |
| I2 | 实施期（轮次 7） | 🟡高 | codex 端 3 项治理能力强于 core 默认（敏感文件正则锚定 `(^|\/)(\.env|\.env\.production|\.env\.local)$|credentials|secrets` 不误伤 config.env / HITL 双哨兵 [full, base] 容忍版本后缀漂移 / Implementation Review 也走 HITL 豁免仅 -runtime）——属能力漂移应上提全局，非协议差异；Q4 双维度（codex DB 进度 vs core checklist 质量）互补非替代；协议差异 5 项（systemMessage/apply_patch/git toplevel/stopHookActive/检测链 reason）不同步 | §四 Task 9.4.4：三项上提 core 默认 + hook-guard-rules.toml → codex override 收敛删除 → golden 反写 → 六端回归；Q4 双维度组合设计同 Task 承载；协议差异 5 项保持 7.1 现状不回流 |

---

## 一、背景与目标

### 1.1 问题现状

hook bash→node 迁移（前序 Plan）已完成 27/32，基线是「TS 皮 bash 心」——行为等价翻译保住了契约，但治理能力未组织化：

1. **治理能力未组织化**：86 个入口是「复制-修改」的平行关系（每端一套 pre-tool-use/doc-format-guard/stop-check），治理逻辑与协议差异混在同一文件，差异散落 → **IDE 纷争的温床**（vscode/claude 薄包装空操作、7 象限死代码、各端阈值漂移均为实证）
2. **规则/阈值硬编码**：拦截正则、模板 token 表、象限文本、哨兵判定、阈值（2000B/256KB/10 次）散落 hook 源码；caijuehub 已有 14 个规则 TOML 与 transcribe 机制（guard-rules.toml → schema.json 生成先例），hook 规则未接入
3. **审计植入未落实**：hook 仅提示文本（record_dev_operation 提醒 + 事件 jsonl），未接入 ADD-7 审计链路自动化
4. **CHANGELOG.md L12 承诺未兑现**（2026-08-14 生效）：「五端 IDE 全部接入，治理行为完全一致」——无验收证据，实测仍有漂移

### 1.2 目标

- **治理能力组织形式化**：三层能力边界——规则配置（caijuehub TOML 真源）→ 治理逻辑（core lib 服务类，5 端 0 复制）→ 协议适配（adapter 薄壳，仅私有差异）；**熵值管控**：五端行为收敛到单一治理能力出口，IDE 纷争可防可查
- **规则即数据**：hook 规则/阈值 100% 声明式（5 个 hook-*.toml），改规则不改代码，双源漂移消除（grep 硬编码残留 0）
- **治理即服务**：治理逻辑 OOP 服务类化（泛型/结构化类型），入口薄壳（<50 行，仅解析+进程语义）
- **审计即闭环**：hook 事件 → ADD-7 落库自动化（事件→落库→回查，幂等去重）
- **一致即可证**：五端行为一致性矩阵验收，CHANGELOG L12 承诺从宣称变可证明
- **时序红线**：全部在 bash 退役（前序 Plan 轮次 8）前完成

---

## 二、方案选型

### 2.1 候选方案对比

| 方案 | 治理组织化 | 回归风险 | 工作量 | 与 bash 基线关系 | 结论 |
|------|:---:|:---:|:---:|:---:|:---:|
| A: 全面重构（86 入口全部重写） | 全 | 🔴高（无差异化分层） | 大 | 每文件双形态验证 | ✗ 仓促效果差 |
| B: 聚焦收敛（治理能力三层组织化 + 规则下沉 + 审计植入） | 高价值点全覆盖 | 🟡中（TOML 缺失 fail-safe） | 中 | 每轮双形态全量验证 | ✓ 选型 |
| C: 仅规则下沉（不动治理组织） | 无 | 🟢低 | 小 | 验证充分 | ✗ 不解决熵值管控 |

### 2.2 选型理由

选 B：① 治理能力三层组织化直接解决 IDE 纷争（熵值管控）——治理逻辑单点出口，adapter 只做协议翻译；② 规则下沉先行消除双源漂移；③ 每轮 bash golden 双形态对比六端全绿为门禁；④ 与「仓促做效果不好」的既定认知一致——分轮推进、验证兜底。

---

## 三、架构设计

### 3.1 数据流转（规则下沉链路）

```
caijuehub/hook-{guard,doc-format,context,event,protocol}-rules.toml（声明式真源，5 端共用）
  │  build 时读取（scripts/hook-rules-gen.ts 生成器，复用 transcribe 先例）
  ▼
templates/core/hooks/lib/rules.ts（生成常量，_generated 标记，勿手改）
  │  esbuild bundle 内联（scripts/hook-bake.ts 扩展）
  ▼
各 magicDir hooks/*.mjs（零 node_modules，规则自包含）
  │  运行期消费
  ▼
core lib Guard 服务类（治理逻辑单点）→ adapter 薄壳（协议翻译）→ IDE

回退链：TOML 缺失/解析失败 → 生成器保留 hooks 内默认常量（fail-safe，不阻断 IDE）
         → tests/hook-rules.test.ts 漂移校验（TOML vs 常量 diff，CI 门禁）
```

### 3.2 治理能力组织形式（core ↔ adapter 关系）

> **熵值管控视角**：ADD 治理能力只有一个出口（core lib），5 个 adapter 是它的协议翻译器（薄壳）。IDE 纷争 = 治理逻辑散落各端副本 + 规则硬编码差异——组织形式收敛后，纷争源头消失（改规则只改 TOML、改治理只改 core lib，无 adapter 文件跟随变更）。

```
┌ 规则配置（caijuehub hook-*.toml ×5）——5 端共用单一真源
│
├ 治理逻辑（core lib Guard 服务类）——5 端 import 内联，0 复制
│   PreToolUseGuard / DocFormatGuard / StopRouter / PromptRouter / AuditBridge
│
└ 协议适配（adapter 薄壳 <50 行）——仅私有差异
    codex: systemMessage JSON + apply_patch + git toplevel
    qoder: hookSpecificOutput JSON + QODER_PROJECT_DIR 注入链
    claude: additionalContext 链 + CLAUDE_PROJECT_DIR + 特有事件
    vscode: 纯文本 + 429 降级
    trae: 纯文本 + 5 检测链 + HITL exit 0
```

### 3.3 数据模型变更（hook-protocol-rules.toml 端差异清单）

| 端 | 输出协议 | 环境注入 | 工具差异 | 特有事件 |
|------|------|------|------|------|
| core（.add） | 文本/JSON 混合（参考实现） | PROJECT_DIR 注入优先 | SearchReplace | — |
| claude | additionalContext JSON | CLAUDE_PROJECT_DIR | Edit/Write | PermissionDenied/StopFailure |
| qoder | hookSpecificOutput JSON（无条件注入） | QODER/QODERCN_PROJECT_DIR | SearchReplace | — |
| vscode | 纯文本 | $PWD | Edit/Write | 429 限流 |
| trae | 纯文本 | $PWD | SearchReplace | HITL exit 0 |
| codex | systemMessage JSON | git toplevel | apply_patch | stop_hook_active |

### 3.4 Plan→Spec 实施映射

| Plan 设计决策 | Spec 实施 | 文件 | 关键变更 |
|------|------|------|------|
| 规则面下沉（5 域 TOML + 生成器 + 漂移校验） | Spec §1 规则面 | `src/caijuehub/hook-*.toml` ×5 + `scripts/hook-rules-gen.ts` + `tests/hook-rules.test.ts` | TOML 声明式 + 生成 + CI 漂移门禁 |
| 治理逻辑收敛（Guard 服务类 + 死代码象限处理） | Spec §2 治理层 | `templates/core/hooks/lib/*.ts` | 类化 + 消费 rules 常量 + 象限裁剪 |
| 入口薄壳化（core + 5 adapter） | Spec §3 协议层 | `templates/core/hooks/*.ts` + `templates/adapters/{5}/hooks/*.ts` | <50 行薄壳，治理 0 复制 |
| 审计闭环（ADD-7 自动化） | Spec §4 审计 | `notify.ts` + 5 端 post-tool-use/prompt-submit | 事件→落库桥接（幂等） |
| 一致性验收 + CHANGELOG 兑现 | Spec §5 验收 | `tests/hook-consistency.test.ts` + `CHANGELOG.md` | 五端矩阵 + 文档修订 |

---

## 四、实施 Task 概要

```
轮次 1: 规则控制面下沉（规则即数据）
  ├── Task 1.1: 5 域规则 TOML 设计（hook-guard/doc-format/context/event/protocol）[新建 src/caijuehub/hook-*.toml ×5]
  ├── Task 1.2: 生成器（TOML → lib/rules.ts + 漂移校验 --check）[scripts/hook-rules-gen.ts + tests/hook-rules.test.ts]
  ├── Task 1.3: hook-bake 接入生成（bundle 前注入 rules 常量）[scripts/hook-bake.ts]
  └── Task 1.4: 双形态对比全量回归（门禁：六端全绿）
        │
        ▼
轮次 2: core 治理逻辑收敛（治理即服务）
  ├── Task 2.1: Guard 服务类收敛（PreToolUseGuard/DocFormatGuard/StopRouter/PromptRouter 消费 rules 常量）[core lib]
  ├── Task 2.2: core 入口薄壳化（14 入口 <50 行）[templates/core/hooks/*.ts]
  ├── Task 2.3: 7 象限死代码处理（消费面收敛 + 文本入 TOML）[context-inject.ts + stop-check]
  └── Task 2.4: 双形态对比全量回归（门禁：六端全绿）
        │
        ▼
轮次 3-7: 5 adapter 逐轮收敛（协议适配薄壳化，每轮独立验证）
  ├── Task 3.x: claude 收敛（薄壳 + additionalContext 协议清单 + 特有事件）[claude hooks]
  ├── Task 4.x: qoder 收敛（薄壳 + hookSpecificOutput 协议清单）[qoder hooks]
  ├── Task 5.x: vscode 收敛（薄壳 + 429 降级保留）[vscode hooks]
  ├── Task 6.x: trae 收敛（薄壳 + 5 检测链差异入 TOML + HITL exit 0）[trae hooks] [2026-08-14 回流: I1 hook_source 适配模式——adapter-rules.toml 声明 self/claude-import 用户自选，sync 按模式跳过分发]
  └── Task 7.x: codex 收敛（薄壳 + systemMessage/apply_patch 协议清单）[codex hooks]
        │  每轮: 该端双形态对比全绿 + 其余端回归
        ▼
轮次 8: 审计植入（审计即闭环）[回流: R1/R4 嵌入式三层设计][2026-08-14]
  ├── Task 8.1: 事件面扩展 + 载体维度声明（AuditBridge 增量 = post-tool-use 事件面扩展；jsonl 主路径不动（MCP 常驻 fs.watch 消费已在运行）；hook-protocol-rules.toml adapters 表补 handlerTypes 维度：Claude mcp_tool 先行（官方支持，连接时机=PostToolUse 后期事件合适）、其余端 command/http 旁路）[lib/notify.ts + AuditBridge（core lib）]
  ├── Task 8.2: 5 端 post-tool-use 接入事件面扩展（prompt-submit 显式不接入本轮，防范围扩散）[5 端 post-tool-use.ts]
  └── Task 8.3: 审计链路端到端验证（jsonl → MCP 常驻消费落库 → query_audit_logs 回查；Claude mcp_tool 直调实测：连接时机/matcher 配置校准）
        │
        ▼
轮次 9: 一致性验收 + 缺陷清零 + CHANGELOG 兑现 + 前序衔接（一致即可证）
  ├── Task 9.1: 五端治理行为一致性矩阵（契约红线逐项 + codex 私有协议标注）[tests/hook-consistency.test.ts]
  ├── Task 9.2: CHANGELOG 新增版本条目引用 0.3.27 承诺 + 矩阵证据（不改历史条目）[回流: R5][2026-08-14]
  ├── Task 9.4: 缺陷修复专项（缺陷照搬清零）[2026-08-14 回流: 缺陷无 Task 承载]
  │     9.4.1 qoder has_add_dev_unclosed 字面量缺陷（{{info}} 不插值 → 插值语义 + golden 反写）
  │     9.4.2 claude 检测链漂移收敛（dangerous-command 上提 core 基线链 + exit 2 缺陷修复 + golden 反写）
  │     9.4.3 7 象限死代码裁剪（consumed=true 仅 2 象限输出路径，无消费分支移除 + golden 反写）
  │     9.4.4 codex 治理能力上提（能力漂移非协议差异）[2026-08-14 回流: I2]
  │         ① 敏感文件正则锚定（(^|\/)(\.env|\.env\.production|\.env\.local)$|credentials|secrets，消除 config.env 误伤）上提 core 默认 + hook-guard-rules.toml
  │         ② HITL 双哨兵（[full, base] 容忍版本后缀漂移）上提 core 默认
  │         ③ Implementation Review 也走 HITL（hitlExemptReviews 豁免仅 -runtime）上提 core 默认
  │         ④ Q4 双维度组合设计（codex DB 进度前置 + core checklist 质量——互补非替代）
  │         实施：三项上提 → codex override 收敛删除 → golden 反写 → 六端回归；协议差异 5 项（systemMessage/apply_patch/git toplevel/stopHookActive/检测链 reason）保持 7.1 现状
  │     时序红线: 必须在 bash 退役前完成（退役后双形态对比失效，无法 golden 反写验证）
  └── Task 9.3: 前序 Plan 轮次 8 衔接（依赖 9.4——bash 退役前置条件含缺陷修复完成 + 前序 8.1 双形态测试统一复核——本 Plan 期间挂起 [回流: R8] + 交接）
```

### 轮次文件边界（明确清单）

| 轮次 | 文件数 | 边界 |
|:---:|:---:|------|
| 1 | 7 新建 + 1 修改 | hook-*.toml ×5 + rules-gen.ts + hook-rules.test.ts 新建；hook-bake.ts 修改 |
| 2 | 8 lib + 14 入口 | core hooks/lib/*.ts 修改 + core hooks/*.ts 薄壳化 |
| 3-7 | 每轮 ~15 | 各 adapter hooks/*.ts 薄壳化（每端 14 入口 + 私有 lib 按 Spec §3 归类表处置）[回流: R2][2026-08-14] |
| 8 | 6 | notify.ts + AuditBridge（core lib）+ 5 端 post-tool-use（prompt-submit 不接入）[回流: R4][2026-08-14] |
| 9 | 2 新建 + 1 修改 | hook-consistency.test.ts 新建 + CHANGELOG.md 修改（新增版本条目） |

---

## 五、验收标准

- [ ] 规则即数据：hook 源码硬编码规则/阈值 grep 残留 0（拦截正则/模板表/象限文本/阈值全部声明式）；TOML 与常量漂移校验 CI 门禁
- [ ] 治理即服务：治理逻辑全部收敛 core lib（5 端入口 grep 治理调用 0 复制）；入口薄壳（<50 行，仅解析+进程语义）；死代码象限归档（含全端一致性说明）
- [ ] 熵值管控：改规则只改 TOML、改治理只改 core lib 的验证用例通过（无 adapter 文件跟随变更）
- [ ] 审计闭环：hook 事件 → ADD-7 落库 → query_audit_logs 回查端到端可验证（幂等去重）
- [ ] 行为等价：每轮双形态对比六端全绿（bash golden 为基线）
- [ ] 一致即可证：五端行为一致性矩阵验收通过（codex 私有协议标注）；CHANGELOG L12 承诺附验收证据
- [ ] 前序衔接：bash 退役（hook-node-migration 轮次 8）前置条件清单确认

---

## 六、关联文档

| 文档 | 路径 |
|------|------|
| ADD Route | `.qoder/plans/2026-08/14/add-coder-hook-node-refactor-add-route-v1.md` |
| Handoff | `.qoder/plans/2026-08/14/add-coder-hook-node-refactor-handoff-v1.md` |
| Review | `.qoder/reviews/add-coder-hook-node-refactor-review-v1.md` |
| Spec | `.qoder/specs/hook-node-refactor/spec.md` |
| Tasks | `.qoder/specs/hook-node-refactor/tasks.md` |
| Checklist | `.qoder/specs/hook-node-refactor/checklist.md` |
| 前序 Plan | `.qoder/plans/2026-08/13/add-coder-hook-node-migration-plan-v1.md` |

## 📊 Plan 进度快照

| 维度 | 进度 | 状态 |
|------|------|:----:|
| tasks.md | 11/64 (17%) | 🔄 |
| checklist [T] | 0/7 | ⬜ |
| checklist [R] | 6 项 | — |
