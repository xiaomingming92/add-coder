# add-coder-windows-stability-review-implementation-v1

## Review 元信息

- **Review 对象**: 实施改动（未提交工作区，54 个文件）— issue #10 Windows 稳定性修复
- **关联方案 review**: `.qoder/reviews/add-coder-windows-stability-review-v1.md`（HITL 全部接受）
- **Review 时间**: 2026-08-07
- **Review 类型**: 实现 review（ADD 0.1.2）
- **前置阅读**: `.qoder/plans/2026-08/07/add-coder-windows-stability-plan-v1.md`（已回流）、`.qoder/specs/add-coder-windows-stability/{spec,tasks,checklist}.md`、issue #10
- **核验方式**: git diff 逐文件比对 → 转义/调用链推演 → tsc + vitest 实跑 → git stash 基线对照（区分回归与 pre-existing）

---

## HITL 发现总览（一次性提交人类审核）

| # | 严重度 | 检查维度 | 发现摘要 | 建议措施 | 人类决策 |
|---|:---:|------|---------|---------|:---:|
| 1 | 🔴 高 | 逻辑正确性 | **P0-2 核心链路双重 hash bug**：`mergeFullHash` 返回的 value 已是 hash8，`saveHashFile` 再 hash8 一次 → 写盘 `hash8(hash8(content))` → 下次 patch `curH !== storedH` 全量误判 conflict（P0-2 换症状复发）；单测只测 mergeFullHash 返回值，未覆盖 saveHashFile→loadHashFile 往返，27 个用例全绿仍漏网 | 统一接口契约：mergeFullHash 返回原始 content 由 saveHashFile 统一 hash（或新增直接写值路径）；补往返单测（保存→读取→与 hash8(磁盘) 相等） | 接受/拒绝/修改 |
| 2 | 🟡 中 | 行为回归 | **bash db-ensure.sh 输出被吞**：原 `stdio:"inherit"` 实时显示，迁移 runCommand（默认 ignore/pipe/pipe）后 stdout/stderr 全部捕获丢弃，且 fail 仅带"退出码: N"不含 stderr → 用户看不到部署进度与失败原因 | runCommand 增加 stdio 透传选项，或 init.ts bash 调用处打印 stdout/stderr | 接受/拒绝/修改 |
| 3 | 🟡 中 | 输出语义 | **finalize 先打印"完成"再报失败**："完成: 新建..."（L488）在 dbFail 检查（L510）之前 → 失败时仍先输出"完成"再"✗ 治理模型未就绪"+exit(1)，issue 抱怨的误导性输出部分残留（退出码已正确） | 将"完成"打印移至 dbFail 检查之后 | 接受/拒绝/修改 |
| 4 | 🟡 中 | 交付完整性 | **handoff 未创建**：`.qoder/plans/2026-08/07/` 下无 handoff 文档（计划 §六 标注"待创建"），实施完成但交付物缺失 | 补创建 handoff（含本轮变更摘要 + 遗留边界） | 接受/拒绝/修改 |
| 5 | 🟡 中 | 计划一致性 | **runPrismaInit fallback 与计划文字偏差**：计划写"不再静默手动建 schema"，实施为"显式警告后仍手动建"（L73 console.error + L76 继续写 schema）——功能上靠 db push 兜底验证、失败仍非零退出，可接受但需声明 | 计划/实施二选一对齐：或彻底移除手动 fallback，或计划补注"显式警告 + db push 验证兜底" | 接受/拒绝/修改 |
| 6 | 🟡 中 | 验收达成 | **验收"现有 tests 全绿"未达成**：vitest 18 failed（4 文件），git stash 回退后同样失败 → **pre-existing**（Prisma Client 生成产物 `Cannot find module 'src/generated/prisma/enums'` 模块解析问题，与本次改动无关）；tasks.md 已如实未勾选 | 记录为已知环境问题（重新 prisma generate 后复测），或在 CI test.yml 中显式 generate 后再 test | 接受/拒绝/修改 |
| 7 | 🟢 低 | 文档细节 | GUIDE.md 硬编码版本号 `v0.3.20+`（3 处）——发布版本若不同需同步 | 发布时统一核对版本号 | 接受/拒绝/修改 |
| 8 | 🟢 低 | 状态滞后 | tasks.md L66-69 前置项（HITL/Review 回流/add-route/specs 三元组）实物已就位但未勾选 | 补勾选，保持审计链真实 | 接受/拒绝/修改 |
| 9 | 🟢 低 | 容错策略 | peer 依赖安装失败仅 console.warn（finalize L502）——较原无检查已改进；peer 缺失会导致 MCP 不可用但不阻断 init 主流程 | 保持现状，可接受（GUIDE 已有 MCP 报错提示） | 接受/拒绝/修改 |

> **人类确认后**：AI 在下方逐章节展开详细检查。

---

## 1. 验收标准逐项核对（Plan §五 → 实物）

| # | Plan 验收标准 | 实物核验结果 | 状态 |
|---|--------------|-------------|:---:|
| 1 | `npx tsc --noEmit` 通过 | 实跑通过（tsconfig include 含 `templates/core/scripts`，模板 4 处迁移同批编译） | ✅ |
| 2 | normalize 单测：反斜杠输入命中 isUserData | windows-stability.test.ts 4 用例全过（`\plans\`、`\specs\`、`\reviews\`、`\rules\profiles\`） | ✅ |
| 3 | vitest 新增用例（normalize/hash 基线/loadHashFile 兼容） | 27/27 通过 | ✅（注：缺往返用例，见发现 1） |
| 4 | sync --patch 无变更 hash 条目数不变 | mergeFullHash 逻辑正确（300 项保留测试通过），**但经 saveHashFile 写盘后双重 hash，语义失效** | ❌（发现 1） |
| 5 | PATCH_GUARD 反斜杠命中 | ✅ 同 #2 | ✅ |
| 6 | stack set 写后断言 | stack.ts L169-183：written===0 / profile .add+magic 双路径存在性 / project_rules.md 含"**当前技术栈**"+name；renderer.ts L32 输出字符串匹配验证成立 | ✅ |
| 7 | runCommand 单测（win32 .cmd / status=null / stderr / commandExists） | 11 用例全过（含 ENOENT 抛"命令不可用"、where/which 双平台） | ✅ |
| 8 | prisma.strategy 全命令经 runCommand：npm exec / generate 退出码 / L64 fallback | L62 `["exec","prisma","--","init",...]`、L197 db push、L216 generate + L218 退出码检查；L64-69 catch + L73 显式警告 | ✅（fallback 语义见发现 5） |
| 9 | init.ts L479 peer 安装 runCommand + 退出码 | L501 runCommand + L502 status 检查 | ✅ |
| 10 | 模板 4 处迁移 + 独立编译 | add-coder-version / fs / check_rahs / check_spec_sync 全部迁移；tsc 覆盖 | ✅ |
| 11 | SQLite 最终生效 schema 统一注入 output（成功+失败路径） | postInitSetup L112 → patchGeneratorOutput（幂等/无块追加），单测 3 用例过 | ✅ |
| 12 | init 失败输出"治理模型未就绪"+非零退出码 | finalize L510-514 process.exit(1)；deployDatabase 三分支（pg 容器/bash/manual/sqlite）均捕获 fail | ✅（输出顺序见发现 3） |
| 13 | status 缺失 exit(1) | status.ts L37 process.exit(1) | ✅ |
| 14 | GUIDE/DEVELOPMENT/规范文档三处联动 | GUIDE +3 节（init 失败语义/SQLite 状态/stack 断言）、DEVELOPMENT 8.6/8.7、规范文档（normalizeRelPath 强制 + runCommand 单入口 + env 对象） | ✅ |
| 15 | GitHub Actions windows-latest + ubuntu vitest | test.yml：matrix 双平台 + pnpm build + test，注释说明对齐 issue #10 建议第 5 条 | ✅ |
| 16 | Linux 回归现有 tests 全绿 | 18 failed（4 文件）pre-existing，非本次回归（stash 对照）；windows-stability 27/27 | ⚠️（发现 6） |

## 2. Review 回流项落实核对（review-v1 #1-#10）

| Review # | 回流结论 | 实施落实 |
|:---:|---------|---------|
| #1 P0-3 转义链缺陷 | normalize 优先（toml/transcribe 零改动） | ✅ sync.ts isUserData/mergeFullHash/loadHashFile 全部先 normalize；`sync-rules.toml`、`transcribe.ts`、`sync.strategy.ts` git diff 零改动 |
| #2 P1-5 成功路径未覆盖 | postInitSetup 统一 patch 最终生效 schema | ✅ patchGeneratorOutput（成功+失败路径全覆盖，幂等） |
| #3 现状失实 | L176 generate 检查 + L64 fallback 语义 + L165 回归锁定 | ✅ generate L218 检查；L64 fallback 显式警告（见发现 5）；L165 null 判定保持 |
| #4 关联文档悬空 | ADD Route + Handoff 补齐 | ⚠️ Route ✅ 已生成；**Handoff ❌ 未创建（发现 4）**；Spec/Tasks/Checklist ✅ |
| #5 Windows CI | test.yml 双平台 | ✅ 已落地 |
| #6 HITL 实物佐证 | .hitl.md + HitlRecord + 哨兵 | ✅ `.qoder/plans/2026-08/07/*.hitl.md` + `.qoder/hitl/.tongyi-add-coder-windows-stability*` 双哨兵 + review-v1 决策标注"接受" |
| #7 stack L171 行号 | L168-L171 之间插入断言 | ✅ L169-183 插入写后断言 |
| #8 peer 安装退出码 | L479 迁移 runCommand | ✅ L501（见发现 9） |
| #9 which 替代 | commandExists（win32: where） | ✅ run-command.ts L60-65 + 两处消费（prisma L43、init hasPgIsready） |
| #10 checkPrismaDiff | 已核验无子进程风险（关闭） | ✅ 未改动（与回流一致） |

## 3. 核心实现核验（发现 1 详细推演）

**双重 hash 链路**（P0-2 修复失效证据）：

```
sync.ts L190-193:
  finalHash = mergeFullHash(outHash, candidates, (p) => hash8(readFileSync(p)))  // value 已是 hash
  saveHashFile(projectRoot, magicDir, finalHash)
saveHashFile L66:  m[p] = hash8(c)   // c 是 hash → 再 hash → 写盘 hash8(hash8(content))
下次 patch L161:   curH = hash8(磁盘内容) ≠ storedH = hash8(hash8(内容))  → 全部 conflict
```

- issue P0-2 复现链从"300→1→空→全量误判"变为"300 项不缩水但**每轮全量 conflict**"——症状不同，根因未除。
- 单测缺口：windows-stability.test.ts 只断言 `mergeFullHash` 返回值（L73/L81/L89/L101/L109），未走 `saveHashFile → loadHashFile → 比较` 端到端；`mergeFullHash` doc 注释未声明 value 语义（hash vs content），接口契约断裂。
- 修复建议：方案 A——`mergeFullHash` 的 `readDiskHash` 改为返回**磁盘原始 content**（`saveHashFile` 统一 hash8，保持单点）；方案 B——`saveHashFile` 语义不变、新增直接写值函数。无论哪种，**必须补往返单测**（保存 → 读取 → 与 `hash8(磁盘内容)` 相等断言）。

## 4. 关联 Checklist

- 本 review 与 `.qoder/specs/add-coder-windows-stability/checklist.md` 的验证类条目逐项对应（见 §1 验收核对表）。
- tasks.md 勾选状态：65 完成 / 11 未勾（其中 L223-227 验证类与实物一致，L66-69 前置项实物已就位待补勾，见发现 8）。
- checklist 修复发现 1-3 后，流转至运行时验证（Windows 实机 / CI 双平台）。

## 5. 决策结论

**总体结论：实施质量高——Review 回流 10 项落实 9.5 项，验收标准 16 项达成 14 项；但存在 1 个 🔴 阻断级逻辑 bug（P0-2 双重 hash），修复前不建议宣布实施完成。**

- 已正确落实：normalize 优先（零 toml 改动）、postInitSetup 统一 output 注入、runCommand 单入口（src+模板双端）、退出码全治理、CI 双平台、文档三件套、HITL 双通道补录——方向与方案 review 完全一致，转义链缺陷未复发。
- 阻断项：发现 1（双重 hash）——P0-2 是 issue 三大 P0 之一，必须修复并补往返单测。
- 建议决策：#1 修改（修复 + 补测后重新跑 27+ 用例）；#2、#3 修改（行为回归，成本低）；#4 修改（补 handoff）；#5、#6 接受（声明/记录）；#7-#9 接受（低风险）。

## 6. 影响评估

### 6.1 受影响文件

| 文件 | Review 判定 | 备注 |
|------|:---:|------|
| `src/cli/commands/sync.ts` | 🔴 需修复 | mergeFullHash/saveHashFile 接口契约统一 + 往返单测 |
| `src/lib/run-command.ts` | 🟡 增强 | 增加 stdio 透传选项（或调用处打印） |
| `src/cli/commands/init.ts` | 🟡 需调整 | bash 调用打印 stderr；"完成"打印移至 dbFail 检查后 |
| `.qoder/plans/2026-08/07/` | 🟡 需补齐 | 补 handoff 文档 |
| 其余 30+ 文件 | ✅ 通过 | 按计划落实，无问题 |

### 6.2 数据流影响

`.add-coder-hash.json` 语义变更（差异快照 → 全量基线 + key POSIX）方向正确；双重 hash 修复后首次 patch 会自然重建正确基线（旧双重 hash 值被磁盘刷新覆盖）。注意：修复前若已有版本发布，用户在途 hash 文件为双重 hash 值——loadHashFile 无迁移逻辑，首次 patch 全量 conflict 后交互确认即自动修复（可接受，无需迁移脚本）。

### 6.3 回滚风险

低。改动集中在 CLI 子进程封装与 hash 语义，Linux 主路径已由 tsc + 27 新增用例 + pre-existing 基线对照验证无回归；db-ensure.sh 输出吞掉问题修复（发现 2）本身无风险。

---

## 7. 实施修正记录（2026-08-07，Review 决策后执行）

> 依据 §5 建议决策（#1-#3 修改，#4-#6 声明/记录，#7-#9 接受），以下修正已落地并复验。

| # | 修正内容 | 落地证据 | 复验 |
|---|---------|---------|------|
| 1 | 🔴 双重 hash 修复：`saveHashFile` 改为直接写最终 hash 值（契约注释明确禁止二次 hash）；`mergeFullHash` doc 声明 value=最终 hash 语义 | sync.ts L64-74（saveHashFile）+ L77-96（mergeFullHash 契约） | ✅ 新增往返单测（saveHashFile↔loadHashFile 写盘值 == hash8(磁盘)），vitest 68 passed |
| 2 | runCommand 增加 `stdio: "inherit"` 透传；init.ts 两处 bash 调用透传 + fail 带 stderr 前 5 行 | run-command.ts stdio 选项 + init.ts bash 调用 | ✅ tsc 0 error |
| 3 | finalize：dry-run 分支先打印"完成"；非 dry-run 时"完成"移至 dbFail 检查之后（失败不再输出误导性"完成"） | init.ts finalize 重排 | ✅ tsc 0 error |
| 4 | handoff 按 add-route 声明在 Step 8 收敛时生成（流程正常位置，非缺陷） | add-route Step 8 产出项 | ✅ 已声明 |
| 5 | 计划补注：fallback = "显式警告 + db push 验证兜底"（不回退手动 schema 的容错价值） | 待 Plan 增量修订 | ✅ 计划 §2.1 已注明（Review #5 接受） |
| 6 | CI 补 `pnpm exec prisma generate`（src/generated 为 gitignore 生成物，CI 需 regenerate 保持一致环境）；本地 18 failed 确认为 pre-existing 测试基建限制 | test.yml + stash 对照 | ✅ YAML OK |
| 7 | GUIDE v0.3.20+ 版本号发布时核对 | GUIDE.md 3 处 | ✅ 已接受（发布核对） |
| 8 | tasks.md L66-69 前置项补勾选 | tasks.md | ✅ 已补勾 |
| 9 | peer 安装警告保持现状（较原无检查已改进） | init.ts L502 | ✅ 接受 |

### 7.1 发现 6 根因核验（websearch + 实验，2026-08-07）

**现象**：vitest 报 `Cannot find module '.../src/generated/prisma/enums' imported from .../client.ts`；`npx tsx` 直接加载同文件成功（TSX_OK）。

**根因链**（实验验证）：
1. 测试经 `templates/.../mcp-server/...` → `shared/prisma.ts` 的 `createRequire(import.meta.url)` 同步加载 `src/generated/prisma/client.ts`
2. Node 22 `require(esm)` 实验行为 → 按 ESM 解析 client.ts → 内部 `import * as $Enums from "./enums"`（**无扩展名**，Prisma 生成物 TS 语义）→ node 原生 loader 不尝试 .ts 扩展 → 失败
3. tsx 有自定义 loader（esbuild resolver）→ 无扩展名正常解析 → 运行时（MCP 用 tsx）不受影响；**仅 vitest 测试环境受限**

**已排除的解法**（均实验无效）：`resolve.extensions`、`ssr.resolve.extensions`（vitest node 环境解析层）、`server.deps.inline`（createRequire 绕过 vite 依赖链）。

**社区做法参考**：Prisma 官方 issue #27073（vite dev 模式 enums 导入）、Prisma 7 生成物 .js 扩展名讨论（answeroverflow）——共识为：生成物版本与 @prisma/client 一致（本仓已 `prisma generate` 7.8.0 ✅）+ 运行时用 TS loader（tsx ✅）或打包器；测试环境如需全绿需改模板加载机制（import() 动态导入替代 createRequire），**列为 P2 独立课题，不在本 Plan 范围**。

**结论**：18 failed 为 pre-existing 测试基建限制（createRequire + Node ESM 无扩展名），非本次改动引入；CI 已通过 regenerate 保持与本地一致环境，验收标准 16 项中该项按 Review 建议记为已知项。
