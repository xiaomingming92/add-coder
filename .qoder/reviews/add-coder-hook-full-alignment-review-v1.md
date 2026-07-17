# add-coder-hook-full-alignment-review-v1

## Review 元信息

- **Review 对象**: `add-coder-hook-full-alignment-plan-v1.md` + `spec.md` + `tasks.md` + `checklist.md`
- **对比方案**: A: 按端修补 Hook 脚本 vs B: ADD 范式四端确定性运行
- **Review 时间**: 2026-07-17
- **Review 类型**: 方案选型 + 架构决策
- **前置阅读**: `add-coder-hook-full-alignment-plan-v1.md`、`issue-6-tool-call-throttling-report.md`

---

## 1. 问题复现

Issue #6：VS Code Copilot 端多文件 Plan Step 0 并行 8+ 工具调用触发 429，会话瘫痪。根因不是单个 hook 缺失，而是 ADD 范式的治理逻辑仅在 Claude Code 端确定性运行——Qoder CN 端有 hook 框架但内容滞后（无模板预读），VS Code Copilot 和 Trae 端 hook 配置完全缺席。

add-coder 的四家 IDE adapter 需要从"Claude Code 单端 + issue-by-issue 修补"升级为"ADD 范式在四家 IDE agent 生命周期中的 17 个治理卡位确定性运行"。

---

## 2. 方案对比

### 2.1 方案 A: 按端修补 Hook 脚本（Issue-by-Issue）

- 每次 issue 补一个或两个事件，碎片化
- 四个 adapter 各有缺口，同类问题在不同端反复出现
- 优势：单次改动小、风险低
- 劣势：累积债务大，下次新 issue 又是新一轮修补

### 2.2 方案 B: ADD 范式四端确定性运行（选型）

- 一次性对齐四端 17 事件治理卡位
- 共享脚本库（common.sh / preload-templates.sh / session-end.sh / subagent-stop.sh）一次编写四端共用
- 优势：后续 issue 直接继承，维护成本低
- 劣势：单次改动量大（33 文件）

---

## 3. 决策结论

**选型 B：ADD 范式四端确定性运行**。

理由：
1. Hook 适配没有护城河——给 VS Code 写 JSON、给 Trae 写 hooks.json，任何一个开发者花一个下午都能做。真正的壁垒是每个 hookpoint 上跑的 ADD 治理逻辑（来自 1800+ 下载量、200+ Plan 文档、Claude Code 12 脚本先行验证）
2. 时间窗口唯一——四家 IDE 的 agent 生命周期事件在 2026-05~07 集中开放完毕，add-coder 此时落地是"ADD 范式成为四家 agent 运行时的治理标准"
3. Issue #6 的本质不是 hook 缺失——如果 Claude Code 端的 session-start.sh 已经有模板预读，VS Code 端用户不会遇到 429。问题不是"那端缺 hook"，是"ADD 治理在那端没有运行"

---

## 4. 影响评估

### 4.1 Review 中发现的问题及回流

| # | 严重度 | 问题 | 回流状态 |
|---|:---:|------|:---:|
| 1 | P1 | VS Code 端实施顺序偏后——Issue #6 发生在 VS Code 端，原始 Plan 将其放在轮次 4 | ✅ 已回流：轮次重组，VS Code 基础 hooks 并入轮次 1 |
| 2 | P1 | Qoder prompt-submit.sh 需保留增强——73 行触发词路由系统不能覆盖 | ✅ 已回流：增量插入约束写入 Plan §四 轮次 3 |
| 3 | P2 | 模板全文注入 Token 预算未估算 | ✅ 已登记：Spec §Requirements 中 preload-templates.sh 需 `--top N` 降级 |
| 4 | P2 | "13 个模板"清单缺失 | ✅ 已登记：Spec 展开项 |
| 5 | P2 | SessionEnd 兜底递归风险 | ✅ 已登记：Plan §四 轮次 5 Spec 展开项 |
| 6 | P2 | RAHS 跨端降级策略 | ✅ 已登记：Plan §四 轮次 3 Spec 展开项 |
| 7 | P2 | 共享脚本静默退化策略 | ✅ 已登记：Plan §四 轮次 5 Spec 展开项 |
| 8 | P2 | 模板全文注入 Token 预算 | ✅ 已登记：Plan §四 轮次 5 Spec 展开项 |

### 4.2 受影响文件

33 文件：18 新建 + 15 修改（详见 add-route 附录文件清单）。全为 `templates/adapters/` 下的模板资产，不涉及 add-coder 的 src/ 核心逻辑。

### 4.3 回滚风险

低——所有改动的文件都是模板资产（shell 脚本 + JSON），不涉及 npm 包构建、CLI 渲染器、MCP server。回滚方式：`git revert` 即可。用户项目不受影响——只有 `npx add-coder init` 后才会拉取新模板。

### 4.4 后续 Plan 建议

- RPT-01（MCP server 节流）：独立交付，不在本 Plan 范围
- RPT-03（执行节流规则到 project_rules.md）：P2 排期
- P2 Spec 展开项（Token 预算 / 13 模板清单 / 递归 / 降级 / 退化）：Plan → Spec 阶段完善

---

## 5. 最终建议

**结论级别**: 可接受（P1 项已回流，P2 项已登记到 Spec 展开）

**执行顺序**: 轮次 1（shared + VS Code 基础 hooks，优先消灭 Issue #6 429 风暴）→ 轮次 2（Claude Code 端完整闭环 + renderer）→ 轮次 3（Qoder CN 端 stderr 适配 + renderer）→ 轮次 4（VS Code 全量 + Trae 端 + renderer）→ 轮次 5（收敛验证 + Issue #6 回归）

### 5.1 受影响文件（2026-07-17 修正）

~~33 文件：18 新建 + 15 修改（详见 add-route 附录文件清单）。全为 `templates/adapters/` 下的模板资产，不涉及 add-coder 的 src/ 核心逻辑。~~ → **38 文件**（模板 33 + renderer 5），新增 renderer 文件：`src/core/renderer.ts`（MODIFY）、`src/adapters/claude/renderer.ts`（MODIFY）、`src/adapters/qoder/renderer.ts`（MODIFY）、`src/adapters/vscode/renderer.ts`（MODIFY）、`src/adapters/trae/renderer.ts`（★ CREATED）。[2026-07-17 修订: 复审发现 renderer 遗漏]

### 5.2 回滚风险（2026-07-17 修正）

~~低——所有改动的文件都是模板资产（shell 脚本 + JSON），不涉及 npm 包构建、CLI 渲染器、MCP server。~~ → 中低——renderer 改动涉及 TypeScript 编译（需 `npx tsc --noEmit` 验证），但改动模式与现有 Claude/Qoder/VS Code renderer 一致，风险可控。[2026-07-17 修订: renderer 纳入变更范围]

~~
# add-coder-hook-full-alignment-plan-v1 Review

## Review 元信息

- **Review 对象**: `add-coder-hook-full-alignment-plan-v1.md`
- **对比方案**: A: Issue-by-Issue 修补 vs B: 系统性 Hook 对齐（Plan 选 B）
- **Review 时间**: 2026-07-17
- **Review 类型**: 方案选型 + 架构设计
- **前置阅读**:
  - Plan: `.qoder/plans/2026-07/17/add-coder-hook-full-alignment-plan-v1.md`
  - 触发源 Report: `.qoder/reports/issue-6-tool-call-throttling-report.md`
  - 现有脚本基线: `templates/adapters/claude/hooks/*.sh`、`templates/adapters/qoder/hooks/*.sh`
  - Review 模板: `templates/core/templates/review-template.md`

---

## 1. 问题复现

Issue #6：用户在 VS Code Copilot 端执行多文件 Plan Step 0 时，模型并行发起 8+ 模板读取调用 → 触发 429 限流 → 会话瘫痪。

Report RPT-20260717 分拆出 5 个子问题，其中 RPT-02（SKILL.md L105 结构性制造调用风暴）和 RPT-05（四端 Hook 体系缺口）是本 Plan 的直接处置对象。

Plan 提出的核心思路是：在模型发起工具调用**之前**，通过 Hook 事件（SessionStart 模板索引 + UserPromptSubmit 模板全文）将模板内容直接注入上下文，从源头消灭并行读取风暴。这是**方向正确**的——不是缓解 429，而是消灭触发 429 的调用本身。

---

## 2. 方案对比

### 2.1 方案 A: Issue-by-Issue 修补

只补 SessionStart + UserPromptSubmit 两个事件的模板预读逻辑，其余事件留给后续 issue。

**Positives**: 改动量小，交付快，风险低。

**Negatives**:
- 四端 adapter 仍不均衡（VS Code/Trae 缺 hooks 框架，即使补了两个事件脚本也无法分发）
- 下次新事件需求出现时，又回到碎片修补模式
- RPT-05 明确指出 VS Code 端缺 `.github/hooks/` 目录、Trae 端整个 adapter 不存在——只补两个事件而不建 adapter 框架，等于在空地上放两个脚本

### 2.2 方案 B: 系统性 Hook 对齐（Plan 选型）

四端 17 事件一次性对齐，分 5 轮次实施。共享脚本库抽象公共逻辑。

**Positives**:
- 一次清债，后续 issue 直接继承完整 Hook 矩阵
- 共享脚本降低四端维护成本
- 与四家 IDE hook 开放窗口同步，时间点最优

**Negatives / 风险**: 见 §4。

### 2.3 Reviewer 判断

**方向同意选 B**，理由与 Plan 一致：VS Code 端缺 hooks 目录、Trae 端缺整个 adapter——这不是"补两个事件"能解决的，必须先建框架。但**实施顺序需要调整**，见 §3。

---

## 3. 决策结论

### 通过项

| # | 维度 | 结论 | 理由 |
|---|------|------|------|
| 1 | 问题定义 | ✅ 通过 | 根因分析准确，与 Report RPT-02 + RPT-05 一致 |
| 2 | 方案选型 | ✅ 通过 | 选 B 理由充分，四家 IDE hook 窗口集中开放是唯一窗口期 |
| 3 | 17 事件→治理职能映射（§3.1） | ✅ 通过 | 每个事件对应的 ADD 治理职能定义清晰，五事件基座最低完备线合理 |
| 4 | 共享脚本库（shared/hooks-lib/） | ✅ 通过 | 架构方向正确，且现有 Claude 脚本（session-start.sh L6、prompt-submit.sh L6）已预先引用此路径，验证了设计一致性 |
| 5 | 标记文件生命周期（§3.3） | ✅ 通过 | SessionStart→UserPromptSubmit→PreCompact→SessionEnd 四阶段标记管理逻辑自洽 |

### 需调整项（P1）

| # | 维度 | 问题 | 建议 |
|---|------|------|------|
| 6 | **实施顺序** | VS Code 端（轮次 4）是 Issue #6 的实际受害端，却排在最后。用户需等待 Claude→Qoder→VS Code 全链路实施完毕才能看到修复 | **轮次 4.1 提前至轮次 1 之后，与轮次 2 并行**：VS Code 端 8 个 JSON + SessionStart/UserPromptSubmit 两个最关键事件的脚本引用先行。这只需要建 `.github/hooks/` 目录结构 + 两个 JSON 文件引用 shared 脚本，改动极小，但能优先解决 Issue #6 用户的直接痛点 |
| 7 | **Qoder prompt-submit.sh 保留增强** | Qoder 端 `prompt-submit.sh` 已有 73 行较完善的触发词路由系统（Layer 1 P0 精准匹配 → Layer 2/3 活跃 ADD 分流 → exit 2 阻断）。模板全文注入逻辑必须以**增量**方式加入，不能覆盖现有路由 | 在 Plan §4 轮次 3 中明确：Qoder `prompt-submit.sh` 的模板全文注入应在现有 `match_trigger` 之后、Layer 2/3 分流之前插入，保留词汇表匹配和验收幂等保护 |

### 需补充项（P2）

| # | 维度 | 问题 | 建议 |
|---|------|------|------|
| 8 | **缺少风险矩阵** | Plan §4 有 Task 拆分和依赖图，但无专门风险分析章节。17 事件 × 4 adapter 的实施规模存在以下具体风险 | 在 Plan 中新增「风险与缓解」章节，至少覆盖以下风险（详见 §4） |
| 9 | **模板全文注入 Token 预算未估算** | 13 个模板全文注入可能超出某些模型上下文限制。SessionStart 的轻量索引（~500 token）安全，但 UserPromptSubmit 全文注入的 token 量未知 | 在 Spec 中要求：① 估算 13 模板总 token 数；② 若超 8000 token，提供 `--top N` 参数仅注入最关键的 N 个模板；③ 文档化各模型上下文预算与注入策略的对应关系 |
| 10 | **"13 个模板"清单缺失** | Plan 和 Report 均引用"13 个模板"但未定义具体是哪 13 个。实施阶段容易出现数量/内容不一致 | 在 Spec 中明确定义 13 个模板的完整清单（文件名 + 路径），与 `templates/core/templates/index.md` 交叉验证 |
| 11 | **SessionEnd 兜底的递归问题** | Plan §3.1 #2："若 Stop 未触发验收检查（agent 异常退出），此处补执行 checklist 快照"。但 SessionEnd 本身也可能因异常退出而未触发——这形成了无限递归的兜底链 | Spec 中明确：SessionEnd 的兜底执行只做 best-effort（不阻断 exit 0），且不再为 SessionEnd 失败设置下一层兜底。异常退出场景的最终兜底由 stop-failure.sh（Claude 特有）承担 |
| 12 | **RAHS≥90 阻断的跨端可行性** | stop-check.sh 依赖 `check_rahs` MCP 工具。Qoder 端 MCP 工具前缀为 `add-dev-tools`/`add-coder-tools`，VS Code/Trae 端可能使用不同前缀或根本没有 add-coder MCP server | Spec/Tasks 中明确：stop-check.sh 的 RAHS 检查应在 MCP 工具不可用时 graceful degrade（仅警告不阻断），避免因为 MCP 服务不可用而误阻断正常关闭 |
| 13 | **共享脚本缺失时的静默退化行为** | 现有所有 Claude 脚本均使用 `[ -f "$SHARED_LIB" ] && source "$SHARED_LIB"` 模式——共享库缺失时静默跳过，不报错。这可能导致功能退化而不被察觉 | 在 Spec 中要求：① 新增脚本首次 source 失败时 stderr 警告；② 验收标准中加入"共享脚本 source 失败可检测"的测试用例 |

---

## 4. 影响评估

### 4.1 受影响文件

Plan §4 的 Task 拆分已覆盖改动文件清单，此处做事实校验和补充：

**现状核实**（与 Plan 声明一致）:
| Plan 声明 | 现状核实 | 结论 |
|-----------|---------|------|
| Claude 端 6 核心脚本需扩展 | stop-check.sh 仅 10 行（无实际验收逻辑），post-tool-use.sh 仅 18 行（仅提醒），pre-compact.sh 仅 14 行（无状态保存） | ✅ 准确 |
| Claude 端缺 3 脚本 | session-end.sh / subagent-stop.sh / stop-failure.sh 确实不存在 | ✅ 准确 |
| Qoder 端 8 脚本需扩展（stderr 适配） | 8 脚本存在但注入通道为 stdout，未适配 Qoder 的 stderr 机制 | ✅ 准确 |
| VS Code 端缺 hooks 目录 | vscode adapter 仅 4 个 .json（extensions/launch/settings/tasks），无 hooks 目录 | ✅ 准确 |
| Trae 端 adapter 不存在 | 整个 `templates/adapters/trae/` 目录不存在 | ✅ 准确 |

**补充关注**（Plan 未显式提及但受影响的文件）:
- `templates/adapters/qoder/hooks/lib/vocabulary.sh`：如 shared/common.sh 从 qoder/lib 抽象 `match_trigger`，需确保 vocabulary.sh 的加载路径不受影响
- `templates/core/skills/add-paradigm/SKILL.md` L105：需追加一行"若 hook 已预读模板，跳过重复读取"的提示（Report RPT-02 已建议，Plan 未在 Task 中体现）

### 4.2 数据流影响

**正向影响**（预期）:
- Step 0 阶段模型侧模板读取调用数从 8~13 降至 0
- 消除 Issue #6 的 #1 根因（模板读取风暴）
- 429 触发概率大幅降低

**潜在副作用**（需关注）:
- 模板全文注入增加每轮上下文开销（仅首次 ADD 开发轮次触发，标记文件去重后可控）
- 标记文件依赖文件系统读写，在容器化/临时文件系统环境中需验证路径可达性
- PreToolUse 的"模板路径兜底"（stderr 提示"模板已预读"）可能对未吸收 hook 注入的模型无效——模型可能忽略 stderr 提示继续读取。此时 MCP 节流（RPT-01）是真正的确定性兜底

### 4.3 回滚风险

| 风险 | 概率 | 影响 | 缓解 |
|------|:----:|------|------|
| shared/hooks-lib 抽象错误导致四端同时退化 | 低 | 高（四端全受影响） | 轮次 1 完成后立即在 Claude 端做回归（轮次 2.3 实测） |
| Qoder stderr 注入通道不可靠（v1.7.0 新特性，2026-07-15 刚发布） | 中 | 高（Qoder 端模板预读完全失效） | 轮次 3.2 实测前先做最小可行性验证（单脚本 stderr → system prompt 链路） |
| VS Code Copilot JSON hooks schema 与预期不一致 | 中 | 中（该端 hooks 实施受阻） | 轮次 4.1 前阅读 VS Code Copilot 最新 hook 文档确认 JSON schema |
| 现有 12 脚本功能退化 | 低 | 中 | 核心里程碑：每次扩展后立即在对应端做回归（已在轮次 2.3/3.2/4.3 中规划） |
| 本次 Review 反馈回流后 Spec/Tasks 范围膨胀 | 中 | 低（仅文档层面） | 本 Review 的 P1 调整项（#6、#7）应回流 Plan；P2 补充项（#8~#13）可下沉到 Spec |

---

## 5. 审查总结

### 方向判断：**通过，方向正确**

Plan 的核心决策——以系统性 Hook 对齐替代碎片修补——是当前时间窗口下的正确选择。四家 IDE 的 hook 机制在 2026-05~07 集中开放完毕，add-coder 的 adapter 体系需要跟上这个基础设施层的升级。Issue #6 只是暴露了冰山一角。

### 关键调整建议（按优先级）

1. **P1-实施顺序**：VS Code 端基础 hooks（SessionStart + UserPromptSubmit 的 JSON 注册 + 共享脚本引用）应提前至轮次 1 之后、与轮次 2 并行，优先解决 Issue #6 用户的直接痛点
2. **P1-保留增强**：Qoder 端 prompt-submit.sh 的已有路由系统不应被覆盖，模板注入应以增量方式插入
3. **P2-Spec下沉**：风险矩阵（§4 中的 6 个具体风险）、13 模板清单、Token 预算估算、RAHS 降级策略等细节应在 Spec 中展开，不阻塞 Plan 通过

### 阻塞判定：**不阻塞**

本 Review 无 P0 级别的方向性错误或遗漏维度。P1 调整项涉及实施顺序和增量策略，可在 Plan 轻量修订或 Spec 中消化，无需重写 Plan。
~~

---

## 6. 增量更新（2026-07-17，复审发现）

### 6.1 发现：renderer 遗漏

DPS 维度二（Review 覆盖完备度）标记"API 签名/函数接口"未覆盖。复查 `src/adapters/` + `src/core/renderer.ts` 后发现：**模板资产可以通过 `walk()` 递归分发，但 `shared/hooks-lib/` 不在任何 adapter 目录下、`.github/hooks/` 需要特殊路径处理、Trae adapter renderer 不存在**——这些是 TypeScript 渲染器层的实质缺口，必须纳入 Plan。

### 6.2 新增 P1 回流项

| # | 严重度 | 问题 | 回流状态 |
|---|:---:|------|:---:|
| 9 | P1 | `src/adapters/` renderer 遗漏——`shared/hooks-lib/` 无分发路径，VS Code `.github/hooks/` 需特殊路径（不能挂 `.vscode/` 前缀），Trae renderer 不存在 | ✅ 已回流：5 个 renderer 改动写入 Plan §四（Task 1.6 / 2.4 / 3.3 / 4.4 / 4.5） |

### 6.3 受影响文件更新

从 **33 文件**（模板资产 only）更新为 **38 文件**（模板 33 + renderer 5）：

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/core/renderer.ts` | MODIFY | `SKIP_DIRS` 新增 `shared` |
| `src/adapters/claude/renderer.ts` | MODIFY | 增加 `shared/` 行走 → `hooks/lib/` |
| `src/adapters/qoder/renderer.ts` | MODIFY | 同上 |
| `src/adapters/vscode/renderer.ts` | MODIFY | `.github/` 特殊处理（输出项目根）+ `shared/` 行走 |
| `src/adapters/trae/renderer.ts` | ★ CREATED | 从零创建 Trae adapter renderer |

### 6.4 回滚风险更新

从"低（仅模板资产）"调整为"中低"——renderer 改动涉及 TypeScript 编译（需 `npx tsc --noEmit` 验证），但改动模式与现有 Claude/Qoder/VS Code renderer 一致，风险可控。

### 6.5 最终建议更新

本 Review 已覆盖 Plan 的全部架构维度（含复审发现的 renderer 层）。P0 项无，P1 项 3 条（#1 实施顺序 / #2 Qoder 增量 / #9 renderer 遗漏）已全部回流。结论维持 **可接受**。

---

## 7. 增量更新（2026-07-17，二轮复审发现）

### 7.1 发现：detect_active_add 存在三处设计缺陷

审计 `state-detect.sh` 的 `detect_active_add()` 函数后发现：

1. **magicDir 硬编码**：路径固定为 `.qoder/plans/`，在 Claude Code 端（用户可能用 `.claude/plans/`）和 VS Code/Trae 端不可用
2. **缺少 index.md 优先查找**：DPS 扫描器已采用"先 index.md 匹配 → 无匹配才 glob"策略（`add-governance-vocabulary.md` L30 明文规范），但 `detect_active_add` 未遵循
3. **"活跃"判定无明确定义**：当前仅检查 add-route 文件是否存在，未区分"已收敛"（所有 Step[x]）和"进行中"（存在 [ ]）

### 7.2 新增 P1 回流项

| # | 严重度 | 问题 | 回流状态 |
|---|:---:|------|:---:|
| 10 | P1 | SessionStart 的 `detect_active_add` 在非 Qoder 端不可靠——magicDir 硬编码、缺 index.md 优先查找、"活跃"判定无定义 | ✅ 已回流：写入 Plan §四 轮次 2 session-start.sh 扩展（多 magicDir 回退 + index.md 优先 + 活跃判定标准化） |

### 7.3 修复建议

**detect_active_add 修正**:

1. **多 magicDir 回退**：`.claude/plans/` → `.qoder/plans/` → `.add/plans/`（按当前端优先）
2. **index.md 优先**：先 `grep planKeyword index.md` 匹配 → 无匹配才 glob `*-plan-v*.md`
3. **活跃判定标准化**：读 add-route 文件 → 存在 `[ ]` 未勾选项 = 活跃 → 多个活跃取最近修改的 add-route

**需同步更新的文件**:
- `shared/hooks-lib/common.sh` 的 `detect_active_add` 函数（从 qoder/lib 抽象时一并修正）
- `project_rules.md` 补充"Plan 活跃判定标准"
- `add-governance-vocabulary.md` 已有"index.md 优先"规范但未关联到 `detect_active_add`

### 7.4 最终建议更新

P1 项增至 4 条（#1 / #2 / #9 / #10）。#10 已明确修复方向，写入 Plan 后不影响阻塞判定。结论维持 **可接受**。

---

## 8. 增量更新（2026-07-17，实施审查发现）

### 8.1 发现：共享脚本路径冲突——`shared/hooks-lib/` 与 `core/hooks/lib/` 并存

Task 1.1 实施时发现 `templates/shared/hooks-lib/common.sh`（Claude 引用）和 `templates/core/hooks/lib/`（Qoder lib 副本，无人引用）两套通用脚本路径并存，违反单一数据源原则。

### 8.2 新增 P1 回流项

| # | 严重度 | 问题 | 回流状态 |
|---|:---:|------|:---:|
| 11 | P1 | 共享脚本路径冲突——`shared/hooks-lib/` 和 `core/hooks/lib/` 提供同质功能但路径不同，应统一收束 | ✅ 已回流：Plan 全局替换 `shared/hooks-lib/` → `core/hooks/lib/`，统一取 `templates/core/hooks/lib/`（四端通用 + 按 magicDir 分子目录） |

### 8.3 决议

**统一路径**: `templates/core/hooks/lib/`

```
templates/core/hooks/lib/
├── common.sh              ← 四端通用
├── qoder/                 ← Qoder 特有（vocabulary / state-detect / context-inject）
├── claude/                ← 预留
├── vscode/                ← 预留
└── trae/                  ← 预留
```

**影响**:
- Claude hooks 引用路径: `../../shared/hooks-lib/` → `../../../core/hooks/lib/`
- Qoder hooks 引用路径: `lib/` → `../../../core/hooks/lib/qoder/`
- 删除 `templates/shared/hooks-lib/`（并入 core）
- 废弃 `templates/core/hooks/lib/` 中与 adapter 重复的 qoder 副本（唯一源仍在 `templates/adapters/qoder/hooks/lib/`）

### 8.4 最终建议更新

P1 项增至 5 条（#1 / #2 / #9 / #10 / #11）。结论维持 **可接受**。
