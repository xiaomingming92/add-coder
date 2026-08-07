# add-coder-windows-stability-plan-v1 Review

## Review 元信息

- **Review 对象**: `.add/plans/2026-08/07/add-coder-windows-stability-plan-v1.md`
- **Review 类型**: 方案评审（PLAN_REVIEW，源码实物核验驱动）
- **Review 时间**: 2026-08-07
- **前置阅读**: GitHub issue #10（Windows 实测报告）、`src/caijuehub/transcribe.ts`、`src/caijuehub/strategies/prisma.strategy.ts`、`src/cli/commands/{init,sync,stack,status}.ts`、`src/caijuehub/sync-rules.toml`、`templates/core/scripts/mcp-server/shared/prisma.ts`、`templates/core/prisma/add.prisma`、`AGENTS.md`（0.6.5 卡位）
- **核验方式**: issue 报告 → 计划方案 → 源码逐行比对 → 转义链实测推演

---

## HITL 发现总览（一次性提交人类审核）

> **规则**：以下为全部发现，等待人类一次性审批后再逐项回流至 Plan 体。禁止边发现边修改。

| # | 严重度 | 类别 | 发现摘要 | 建议措施 | 人类决策 |
|---|:---:|------|---------|---------|:---:|
| 1 | 🔴 高 | 方案正确性 | P0-3 修复方案存在 toml 双重转义缺陷：toml 写 `[\\/]` 经转义+字面量透传后实为 `[\/]`，正则仍只匹配 `/`，修复无效 | toml 源改 `[\\\\/]`，或 transcribe.ts L77 改用 `new RegExp(s)`；计划必须写明 toml 源文件最终文本 | 接受 |
| 2 | 🔴 高 | 修复完整性 | P1-5 SQLite 修复仅覆盖 fallback schema（L68），prisma init 成功路径的 schema.prisma 由 CLI 生成、无 output，Client 仍落 node_modules，MCP 依旧不可用 | 在最终生效 schema 统一注入 generator output（postInitSetup 后统一 patch），或计划明示成功路径处理 | 接受 |
| 3 | 🟡 中 | 现状失实 | §1.1 称"prisma init 不检查退出码"与实物不符（L64 有检查，失败走静默 fallback）；§3.5 将"L165 含 null 判定"列为变更，但 L165 已是 `r.status !== 0` | 修正措辞：真正改动点是 L176 generate 检查 + L64 fallback 语义 + init.ts 退出码传播；L165 仅需回归用例 | 接受 |
| 4 | 🟡 中 | 关联完整性 | 计划引用的 ADD Route / Handoff / Review / Spec / Tasks / Checklist 6 个文档路径全部不存在（实物核验） | Review 通过后、Step 1 前补齐 ADD Route + Handoff；Spec/Tasks/Checklist 标注"待创建" | 接受 |
| 5 | 🟡 中 | 验收缺口 | issue 建议第 5 条"Windows 自动化回归测试"未纳入计划；验收仅 Linux 回归，`.github/workflows` 无 test job | 至少把 Windows CI 单测 job 列为 P2，或纳入本轮（路径/hash 逻辑纯函数化后跨平台可跑） | 接受 |
| 6 | 🟡 中 | 状态真实性 | HITL"round 1 TONGYI 已通过"无 .hitl.md / HitlRecord 实物佐证 | 补录 HITL 记录（文件 + 数据库二者缺一不可），或在计划中说明记录位置 | 接受 |
| 7 | 🟢 低 | 行号精度 | §3.1 "stack.ts L171 写后断言"不准确：L171 是成功打印，断言应插 L168 写文件循环之后 | 修正行号引用为 L168-L171 之间 | 接受 |
| 8 | 🟢 低 | 覆盖遗漏 | finalize L479 peer 依赖安装 `spawnSync(pm, ["install", ...])` 无退出码检查，且与 P0-1 同型（Windows status=null） | 至少写入 §3.4 已知边界，或顺带纳入退出码治理 | 接受 |
| 9 | 🟢 低 | 覆盖遗漏 | `spawnSync("which", ...)`（prisma.strategy.ts L41、init.ts L149）Windows 下不存在，未列入边界 | 写入 §3.4 已知边界 | 接受 |
| 10 | 🟢 低 | 覆盖遗漏 | sync.ts L166 `checkPrismaDiff`（patch 后执行，涉及 prisma diff 子进程）Windows 语义未评估 | 计划补充一句评估或列入边界 | 接受 |

> **人类确认后**：AI 在下方逐条展开详细分析。每一条展开时必须引用上方编号。

---

## 1. 问题复现

GitHub issue #10（albertm88，2026-08-07）：Windows PowerShell + Node 26 + Codex adapter + SQLite 全新目录实测，报告 5 个 P0/P1 问题 + 1 个补充建议 + 5 条修复优先级。本评审对计划中每一条根因描述与修复方案做了源码逐行核验。

**核验通过的部分（计划描述准确）**：

- P0-1 主根因链成立：prisma.strategy.ts L58-60 npm 场景实为 `spawnSync("npm", ["prisma", "init", ...])`（缺 `exec`）；L161 `["prisma", "db", "push"]`；L176 generate 无退出码检查；init.ts L414/L436 catch 吞错；finalize L468 无条件输出"完成"、无退出码。issue 复现输出顺序与源码一致。
- P0-2 成立：sync.ts L162 `saveHashFile(..., new Map([...missingFiles, ...conflictFiles]))` 只存本轮差异；L124 hashLost 检测需 outHash 为空，1 项残留时不会触发。
- P0-3 成立：sync-rules.toml L6 `["[/]plans[/]", ...]` 仅匹配 `/`；transcribe L77 透传；sync.ts L46/L114 用 RegExp.test。
- P1-4 成立：stack.ts L149 `relPath.includes("/rules/profiles/")`。
- P1-5 成立：模板 prisma.ts L13-22 仅探测 `src/generated/{dir}/client.{ts,js}`；L37-43 仅 PG adapter；fallback schema（prisma.strategy.ts L68）无 output。
- 补充-6 成立：status.ts L34-39 缺失仅打印，无 process.exit(1)。
- init.ts L385-394 hash 全量写入（"已是全量，不动"判断正确）；L408 env 对象传递（"不引入 cross-env"结论成立，代码无 shell 内联 env 语法）。
- 行号引用总体精准：L46/L114/L162/L149/L58-62/L161-164/L176/L68/L411/L419/L34-39 全部核对无误。

---

## 2. 逐条发现展开

### 🔴 发现 1：P0-3 修复方案的 toml 双重转义缺陷

**位置**：计划 §2.1（"patterns 为双分隔符正则 `[\\/]`"）、§3.1（`PATCH_GUARD: ["[\\/]plans[\\/]", ...]`）、§3.5、§五验收。

**转义链推演**（关键！）：

```
计划建议 toml 源:      [\\/]plans[\\/]          ← 4 字符块 "[\ \ /]"
toml 基础字符串解析:    \\ → 字面 \  ⇒ 值 = [\/]plans[\/]
transcribe L77:        `/${s}/`  ⇒ 生成 /[\/]plans[\/]/
JS 正则字面量解析:      \/ → 转义斜杠 ⇒ 字符类 [\/] = { / }
运行时匹配:            只匹配 "/"，仍不匹配 "\"  ❌ 修复无效
```

正确写法：toml 源需写 `[\\\\/]plans[\\\\/]`（toml 值 `[\\/]plans[\\/]` → 正则 `/[\\/]plans[\\/]/`，字符类含 `\` 与 `/`）✅。

**建议**：优先改 transcribe.ts L77 为 `new RegExp(s)` 构造（toml 值即正则源，语义清晰、无字面量转义陷阱），同步保留 toml 为真源的原则；或维持字面量但 toml 写 `[\\\\/]`。无论哪种，**计划必须写明 toml 源文件中的最终文本**，并保留验收标准中"单测覆盖反斜杠输入"（可兜底，但不应依赖兜底）。计划声称"实测已确认 transcribe.ts L77 支持透传正则串"——透传确实存在，但**未验证转义层结果**。

### 🔴 发现 2：P1-5 SQLite 修复覆盖不完整

**位置**：计划 §2.1 选型 A、§3.2、§3.5（"L68 增 output"）。

fallback schema（prisma.strategy.ts L68）加 `output = "../src/generated/prisma"` 只覆盖 **prisma init 失败** 路径。但：

- prisma init **成功**路径（L60-63）：schema.prisma 由 Prisma CLI 生成，默认 generator 无 output → Client 输出 `node_modules/@prisma/client`（issue 实测确认）；
- `templates/core/prisma/add.prisma` 为纯 model 文件（无 generator 块），目录模式 `--schema=prisma/` 下 generator 来自 schema.prisma；
- 因此 SQLite 成功路径下 MCP 模板仍探测不到 `src/generated/prisma/client.ts`，P1-5 在成功路径上复发。

**建议**：output 注入应在**最终生效 schema** 层面统一处理——`postInitSetup`（或 injectPrisma 收尾）后统一 patch schema.prisma 的 generator 块（无论 init 成功或 fallback），MCP 模板与 GUIDE 保持不变。计划需补充此决策，或明确声明"成功路径另列 P2"（不建议：与 issue 建议第 4 条直接冲突）。

### 🟡 发现 3：现状描述与代码不符

计划 §1.1 称"`prisma init` 不检查退出码"，但 L64 实为 `if (initResult.status !== 0 || !existsSync(schemaPath))`——有检查，且 `null !== 0` 语义在 Windows 下会把失败引导进"手动创建 schema"静默 fallback（L65-79）而非报错。真正的问题是 **fallback 吞掉失败**，不是"不检查"。

计划 §3.5 将"L165 含 null 判定"列为关键变更，但 L165 已是 `if (r.status !== 0) throw`（null 已判失败）——现状即正确语义，实施时无改动量。

**建议**：修正措辞。实际改动点：① L176 generate 补退出码检查（计划已正确指出）；② L64 fallback 语义改造（失败应显式提示/报错，而非静默手动 schema）；③ L165 仅需回归用例锁定，不列为变更。

### 🟡 发现 4：关联文档全部悬空

实物核验：`.add/plans/2026-08/07/` 下仅 plan 本体；`.add/specs/` 无 `add-coder-windows-stability/` 目录；`.add/reviews/` 为空（本评审为首份）。计划 §六 列出的 6 个关联文档（ADD Route、Handoff、Review、Spec、Tasks、Checklist）路径均不存在，§四 引用的 tasks.md（"含 Plan→Task 映射表"）也不存在。

按 AGENTS.md 0.6.5 卡位：Review 的 P0/P1 必须回流至 Plan 体后方可进 Step 1，且后续有 Route 承接。**建议**：Review 通过后立即补齐 ADD Route + Handoff（Step 1 前置），Spec/Tasks/Checklist 明确标注"待 Spec 阶段创建"。

### 🟡 发现 5：issue 建议第 5 条未纳入

issue 明确建议"为 Windows 增加 init + SQLite、sync --patch、stack set 的自动化回归测试"（第 5 条修复优先级）。计划 §五 验收仅覆盖 Linux 回归 + vitest 单测；`.github/workflows/` 现有 preview/publish/release 三个 job，无 test job。路径规范化与 hash 基线逻辑纯函数化后天然可跨平台跑 vitest，成本低。

**建议**：将"新增 GitHub Actions `windows-latest` 单测 job"纳入轮次 3 或明确列为 P2 并写入 §3.4。

### 🟡 发现 6：HITL 状态无实物佐证

计划 §HITL 总览标注"round 1 TONGYI 2026-08-07 已通过"，但 `.add/plans/2026-08/07/` 下无 `.hitl.md`，也无 HitlRecord 数据库记录可查。按 add-coder HITL 规范（hitl-template + HitlRecord 双轨），需补录或指明记录位置，否则状态真实性存疑（记忆经验：HITL 审批必须 .hitl.md + 数据库记录二者缺一不可）。

> **【核验补充 2026-08-07】部分撤回**：审查者查的是 `.add/plans/` 目录，但 hitl.md 按 MAGIC_DIR（.qoder）生成在 `.qoder/plans/2026-08/07/add-coder-windows-stability-plan-v1.hitl.md`——**实物存在**（含 HitlRecord `cmsid0i0q0000nllz9e8n12av`，DRAFT→TONGYI；哨兵 `.qoder/hitl/.tongyi-*` 为隐藏文件需 `ls -a`）。建议保留并已采纳：Plan §HITL 总览补充记录位置，便于跨 Session 核实。

### 🟢 发现 7：stack.ts 行号引用不准

§3.1 写"L171 写后断言"，但 L171 实为 `console.log("✅ 技术栈已设置为 ...")`。断言（existsSync 校验 profile + project_rules.md）应插入 L168（写文件循环结束）与 L171（成功打印）之间。小问题，但计划自称"标注关键行号"应精确。

### 🟢 发现 8：finalize peer 依赖安装遗漏

init.ts L479 `spawnSync(pm, pm === "pnpm" ? ["add", ...] : ["install", ...], { stdio: "inherit" })`——无退出码检查，npm 场景在 Windows 下同样 status=null，与 P0-1 同型。计划退出码治理未覆盖此处。**建议**：至少写入 §3.4 已知边界（本轮不动），或顺带纳入轮次 2。

### 🟢 发现 9：`which` 调用遗漏

prisma.strategy.ts L41 `spawnSync("which", ["pg_dump"])`、init.ts L149 `spawnSync("which", ["pg_isready"])`——Windows 无 `which` 可执行文件，spawnSync 返回 ENOENT/status=null。影响：pg_dump 备份静默跳过（可接受）、isPgReady 探测恒 false（PG 复用判定受影响，但 Windows 主场景是 SQLite/manual，影响有限）。**建议**：写入 §3.4 已知边界。

### 🟢 发现 10：checkPrismaDiff 未评估

sync.ts L166 `await checkPrismaDiff(projectRoot, options)` 在 `sync --patch` 保存 hash 后执行，涉及 prisma diff 子进程（Windows 下同型风险）。计划未提及。**建议**：补充一句评估或列入边界。

> **【核验补充 2026-08-07】关闭**：`diffPrisma` 为纯 `readFileSync` 文件对比（writer.ts L108-112），`checkPrismaDiff` 全链路（含 injectMissingModels/overwriteFieldLines）均为文件操作，**无任何子进程调用**——"同型风险"推断不成立，不列入边界。

---

## 3. 决策结论

**总体结论：方向正确、方案基本可行，但存在 2 个 🔴 阻断级技术缺陷，修正前不建议进入 Step 1。**

- 计划对 issue #10 的根因定位 90% 准确（9 处行号引用全部核实），方案选型（A 全选）与 issue 建议一致，跨平台规范文档与 hash 全量基线的设计正确。
- 阻断项为：发现 1（PATCH_GUARD 转义链导致修复无效）与发现 2（SQLite 成功路径未覆盖）。此二者不修正，P0-3 与 P1-5 将在实施后复发，验收单测虽能兜底但会造成"先写错再修错"的浪费。
- 其余 8 项为修正措辞 / 补全边界 / 补齐关联文档，工作量小。

**建议决策**：#1、#2 修改（回流 Plan 修正方案细节）；#3、#4、#5、#6 修改（措辞 + 补齐）；#7-#10 接受（低风险，写入已知边界）。

---

## 4. 影响评估

### 4.1 受影响文件

| 文件 | Review 判定 | 备注 |
|------|:---:|------|
| `src/caijuehub/sync-rules.toml` | 方案需修正 | 转义层：toml 源写 `[\\\\/]` 或改 transcribe |
| `src/caijuehub/transcribe.ts` | 可改可不改 | 改 `new RegExp(s)` 更稳（推荐） |
| `src/caijuehub/strategies/prisma.strategy.ts` | 方案需补充 | L68 之外需覆盖 init 成功路径的 generator output |
| `src/cli/commands/sync.ts` / `stack.ts` / `init.ts` / `status.ts` | 方案正确 | 按计划实施 |
| `templates/core/scripts/mcp-server/shared/prisma.ts` | 方案正确 | 补 SQLite adapter 分支 |
| 文档三件套 | 方案正确 | — |

### 4.2 数据流影响

无 DB 结构变更；hash 文件语义从"差异快照"变"全量基线"，首次 patch 触发一次全量重写（已有 isFirstPatch/isUpgrade 逻辑承接）。

### 4.3 回滚风险

中：npm 子进程调用方式改变 + 退出码语义收紧，可能影响 Linux 现有流程——计划已包含 Linux 回归验收（tsc + eslint + tests + dry-run），足够。转义链缺陷修复后，PATCH_GUARD 在 Linux 行为不变（`[\\/]` 超集匹配 `/`），无回归风险。
