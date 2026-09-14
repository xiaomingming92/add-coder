# CHANGELOG

> 本文档记录 add-coder 各版本的变更历史，与 [README.md](./README.md) 中的版本号保持联动。
>
> 版本号格式遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

---
## [0.3.32] - 2026-08-17

### 修复

- **打包/sync 缺陷：Codex hooks `.mjs` 产物缺失**——发布包 `templates/adapters/codex/hooks/` 只有 `.ts` 源、`hooks.json` 引用 `.mjs`，而 CLI `init`/`sync` 无编译步骤，全新用户 Codex hooks 全部失效。`hook-bake --publish` 发布预烘焙（产物随 npm 分发），`prepare`/`predev`/`prebuild` 自动烘焙，新增打包冒烟测试（hooks.json 引用产物存在性 + hash parity）
- **生成态收敛**：`.codex/hooks.json` 过期 `.sh` 引用修正为 `.mjs`，与源模板一致（ADD-12 双源漂移防护）
- **trae 同类缺陷一并覆盖**（`hooks.json` 同样引用 `.mjs`）

---
## [0.3.31] - 2026-08-17

### 变更

- **历史重写收尾（决策过程文档私有化）**：`filter-repo` 重写全部历史——plans/specs/reviews/hitl/reports 从所有提交中剔除，新 clone 无法再拼出架构演进；README/文档体系引用的公开附件（benchmark 原始报告、模板关联工作流规范、README 链接的 Plan）恢复随库分发；hash 清单与私有边界对齐

---
## [0.3.30] - 2026-08-14

### 修复

- **脚本模板强制 ESM 运行**：模板脚本统一 ESM 执行，规避 CommonJS 兼容坑
- **锚点查找收敛（anchor.ts）**：锚点解析从宽泛匹配收敛为确定性查找
- **find-up 升 peerDependencies**：运行时依赖边界修正

### 变更

- add-coder 自用 magicDir 同步（dogfood 生成态与真源对齐）

---
## [0.3.29] - 2026-08-14

### 文档

- README 首部话术凝练（0.75→1 哲思 + 治理愿景）
- README 社区号召话术优化（markdown 链接化 + 凝练）
- README 英文版同步 slogan + 里程碑 + 社区号召；英文 slogan 修正为 humanity's Level-1 civilization

---
## [0.3.28] - 2026-08-14

### 创新（Hook 治理协议层 v2——0.3.27 承诺的可证明兑现）

- **一致即可证**：五端一致性矩阵落地（`tests/hook-consistency.test.ts`）——危险命令拦截 / 敏感文件锚定 / 审计事件面 / 协议形态标注 / 治理 0 复制逐项断言，**0.3.27「五端 IDE 全部接入，治理行为完全一致」从宣称变可证明**（六端双形态对比 42/48/42/42/42/42 全绿 + 矩阵 6/6）
- **审计即闭环**：post-tool-use 文件写入事件面扩展（AuditBridge）——写入即落库（jsonl → MCP 常驻消费 → ADD-7 自动化，幂等去重），prompt-submit 显式不接入防范围扩散
- **规则即数据收官**：危险命令检测链（`rm -rf /` / `DROP TABLE` / `git push --force` 等）上提 core 基线链，六端同拦截（此前 core/trae/codex 有盲区）；敏感文件正则锚定化——`config.env` 等普通文件不再误拦
- **治理能力上提**：HITL 双哨兵（MCP 双命名哨兵对齐）/ Implementation Review 也走 HITL（豁免仅 `-runtime`）/ Q4 双维度组合（DB 任务进度前置 + checklist 质量，互补非替代）

### 修复

- qoder Stop 提示 `{{info}}` 不插值（bash `<<'EOF'` 缺陷照搬）→ 回归插值语义
- claude 无 Plan 写入放行 exit 2 → 对齐 core exit 0
- 敏感文件拦截 exit 码丢失（guardFilePath 返回 void 丢弃 onSensitiveDeny 的 exit 2——拦截形同虚设）→ 阻断码透传
- codex apply_patch 被误当 Bash 工具（jsonGet 全局匹配误取 tool_input.command）→ 按 tool_name 分流
- golden 反写工具状态污染（refresh-fixed 未清理 dev 标记导致抓取状态不可控）→ 与抓取语义对齐
- windows-stability 过期版本断言（0.3.26 → 0.3.27）

---
## [0.3.27] - 2026-08-13

### 创新

- **Hook 治理协议层诞生**：ADD 治理从"各端脚本各自实现"升级为**统一契约约束**——生命周期裁决（数据库为唯一真相源，服务不可用显式阻断而非静默放行）、本地治理隔离（各 IDE 只治理自己的目录）、命令精确判定、模板自包含四类契约，**五端 IDE（Claude / Qoder / VS Code / Trae / Codex）全部接入，治理行为完全一致**
- **Codex 获得完整原生治理**：原生 hooks + HITL 审批 UI + 运行时轮次状态，Codex 用户与其他 IDE 用户同等治理体验
- **文档守卫语义锚定**：锚点快检 + 结构位禁词 + 注册表绑定，守卫从"词面匹配"升级为**语义判定**，误报误放双降
- **文档相似度量化复检**：`check_doc_similarity` 四维语义判定（形似义异），疑似重复文档自动识别并给出修改建议
- **caijuehub 产线工厂化**：规则登记即进产线、变更自动审计、出厂质检幂等——"改规则不改代码"闭环升级

### 修复

- hook 注册表误判：含 report 的文档名不再被误吞
- CI lint 阻塞：未使用导入清理 + 类型化去 any
- gitignore 兜底：哨兵与工作流产物忽略，分支切换零意外 diff

### 变更

- 私有工作流产物移出版本跟踪（文件保留本地，副本以真源重分发）

---
## [0.3.26] - 2026-08-11

### 修复

- **文档格式守卫单引号陷阱修复**：单引号内变量展开失效修复，五端 IDE 统一生效（RPT-20260811-01 闭环）

---
## [0.3.25] - 2026-08-10

### 新增（[issue #12](https://github.com/xiaomingming92/add-coder/issues/12) Codex 原生适配 + 多 IDE 并行稳定）

- **Codex MCP 官方配置输出**：`init --adapter=codex --print-mcp-config` stdout 输出可直接使用的 config.toml 片段（`[mcp_servers.add_coder]` 区块，win32 自动 `.cmd` 分支）；`--write-user-config` 显式确认后写入 `~/.codex/config.toml`（先备份 + 防重复）；config.toml 真源模板 `templates/adapters/codex/config.toml.example`（renderAdapterBase 自动分发）
- **进程层并发契约 v2**：`docs/multi-ide-concurrency-contract.md`——连接模型（连接池公式）/ 幂等键 / PROJECT_ID 校验 / 断开隔离四态 / 数据库生命周期拆分 / client 编排行为差异矩阵（Codex Parallel MCP / TAgent / Claude Code / Qoder CN 待调研）；与协作层 v1（collab-contract）构成双层契约体系
- **MCP Server 并发加固**：读写分级信号量节流（读 8 / 写 4，超限排队反压）+ 429 指数退避重试（关闭 RPT-20260717-01，issue #6 遗留）；DATABASE_URL 日志脱敏（`shared/redact.ts` 统一出口，密码段 `****`）
- **db-ensure 迁移锁双改**：自身脚本 + 消费方模板均加 `pg_try_advisory_lock(0xADD001)` 非阻塞拿锁（多 IDE 并发 init 仅一次迁移）
- **Adapter 所有权矩阵**：进程层契约附录（5 目录归属 + codex→`.claude/` 双通道例外 + sync --patch hash 保护）

### 文档

- README ⑩ 升级为「并发契约体系：协作层 + 进程层双层」；新增 ⑪「Codex MCP 原生接入」（6 步闭环 + 模板 vs 端到端验证状态区分）
- DEVELOPMENT.md 新增 §十五「多 IDE 并发契约联动」（生命周期拆分 / 连接模型与并发兜底 / 与协作层契约关系）
- CI 双平台（ubuntu + windows）新增 Codex 配置生成断言与 `.cmd` 分支断言

### 变更

- `init --adapter=codex` 行为：新增两个轻量参数分支（print/write 在完整 init 流程前置处理，非交互）

---
## [0.3.24] - 2026-08-10

### 变更

- 构建产物与发布基线

## [0.3.23] - 2026-08-09

### 修复

- **review_track planName 过滤方向颠倒**：derivedPlan 是前缀、pn 是完整 planName（`{prefix}-plan-v{n}`），改为 `pn.includes(derivedPlan)`；原实现传入 planName 时全部跳过

---
## [0.3.22] - 2026-08-10

### 新增

- **Atlas 数据库同步引擎**：消费方 init 走 **声明式 diff/apply**（分库/共库双模式）+ 降级链（prisma-diff 免 shadow → db-push + 强制备份）；add-coder 自身切换 **版本化迁移**（独立目录 `prisma/atlas-migrations/` + baseline，替代 prisma migrate dev）
- **分库引导**：init 检测 ADD_DATABASE_URL → 询问是否分库 → 独立 ADD 库容器 + 统一端口分配器登记
- **统一端口分配器**：`ports-rules.toml`（start_hint=5433）→ `PORTS_CONFIG`；契约表复用 + 跨项目避让 + podman 实扫 → 5433 起扫空闲 → 登记 docs/ports.md；禁止分散扫描
- **端口契约控制面**：`ports-rules.toml` + transcribe `genPortsRules`（改规则不改代码）
- **dev-url 常驻化**：dev-url = 可重放的独立空库（常驻 `{project}-add-dev` / shadow 转正），零临时容器；shadow 转正需先清空（Atlas 要求 dev 库干净）
- **atlas 依赖**：`@ariga/atlas`（npm 依赖自带；pnpm 11 需 allowBuilds 放行）
- **sync Atlas 能力承诺**：`add-coder sync --patch` 检测 Atlas → 就绪 / 自动安装 / 拒绝给降级文档（README「Atlas 数据库同步能力」）
- **resolveAtlasBin 三路径**：add-coder 包作用域 → 消费方根 .bin → 全局（file:/registry 安装均命中）
- **消费方模板 db-ensure.sh Atlas 化（函数式）**：宿主日常同步入口——7 个单一职责函数（resolve_atlas_bin / atlas_cmd / build_target / generate_baseline / run_atlas_diff / apply_atlas_diff / atlas_sync）；共库/分库自动判定
- **动态 exclude（共库模式）**：库中除 ADD 7 表外全部排除（业务表/checkpoint/_prisma_migrations）——Atlas `--exclude` 实测需 **逗号分隔 + public. 前缀精确表名**（glob/无前缀不生效）
- **幂等判定修正**：Atlas 无变更输出 `Schemas are synced...`（非空）→ 改为 **SQL 语句特征检测**（TS 正则 + bash grep），不再误弹确认
- **sync 宿主段检测**：宿主 `scripts/db-ensure.sh` 缺 `atlas_sync` 标记 → 提示职责边界 + 三步合入法 + 文档指向

### 变更

- 消费方接入推荐 **file: 协议**（替代 pnpm link）：依赖自动安装；DEVELOPMENT.md §十一 本地联调
- `prisma db push` → Atlas 引擎（init 流程）；prisma patch 状态机明确（冲突/缺失/一致三态裁决）
- **职责边界明确**：add-coder 只同步 ADD 治理模型（7 表）；宿主业务表 diff **推荐 Atlas 但不强求**（保持 migrate dev/deploy 亦可）

### 文档

- README：快速开始补分库引导/patch 状态机/Atlas 理由；新增「Atlas 数据库同步能力」+「宿主项目如何接 Atlas」（6 步）；English 版同步
- DEVELOPMENT.md：§九 数据库同步机制（9.1-9.5：引擎分工/自身流程/关键约束 9 条/**宿主合入三步法**/宿主业务表推荐做法）、§十 端口契约联动（统一分配器）、§十一 本地联调
- CHANGELOG 版本联动

### 实测验证（消费方回流）

- farm-agent 接入闭环：file: 协议 → sync 能力就绪 → db-ensure.sh 合入 → Atlas 共库同步（32 表排除）→ 幂等出口；shadow 5436 转正（清空后干净 dev 库）
- 7 项断裂点修复：bin 传递依赖不可达 / prisma 目录格式不兼容 / checkpoint 判删 / 宿主脚本无引擎 / ATLAS_DEV_URL 未配 / baseline 写死 / checkpoint hack 双轨

---
## [0.3.21] - 2026-08-07

### 新增

- **模板运行时依赖清单（基建）**：新增 [`docs/DEPENDENCIES.md`](./docs/DEPENDENCIES.md)（仓库级文档，与 [DEVELOPMENT.md](./DEVELOPMENT.md) 第十一章「依赖治理坑位记录」双向联动）——`@huggingface/transformers` 等 9 个基建依赖在**安装期**解决（`npm i add-coder` 已默认安装，见 [package.json](./package.json)），`check_dps` 只保留模型降级提示（说明见 [GUIDE.md](./GUIDE.md)）
- **onnxruntime 解析错位说明**：新版 transformers（^3.8.x 依赖 `onnxruntime-node@1.21.0`）与 langchain 生态 optional 依赖（`1.14.0`）并存时 pnpm 解析错位（`onnxruntime-common` 双版本）→ 提供 `pnpm overrides` 1.14.0→1.21.0 配置与验证命令（见 [`docs/DEPENDENCIES.md`](./docs/DEPENDENCIES.md) §二）

---
## [0.3.20] - 2026-08-07

### 修复（[issue #10](https://github.com/xiaomingming92/add-coder/issues/10) Windows 稳定性——5 问题 + 1 补充全部修复）

- **init 假成功**：npm 子进程调用错误（缺 `exec` 语义 + Windows `.cmd` 无法 spawn → status=null）→ 新增 `runCommand` 跨平台封装（.cmd 解析/退出码/stderr/commandExists）；`prisma generate` 退出码检查；失败输出 `✗ 治理模型未就绪` 并以**非零退出码**结束
- **sync --patch hash 基线丢失**：hash 文件改为**全量基线**（旧 hash 保留 + 磁盘刷新 `mergeFullHash`），用户跳过保留的修改不再下一轮误判冲突；Windows 反斜杠 key 读取时统一 POSIX
- **PATCH_GUARD 分隔符失效**：比较前统一 `normalizeRelPath()`（反斜杠→POSIX），toml/transcribe 零改动（改 sync.ts 一处）
- **stack 筛选 Windows 空集假成功**：筛选先规范化 + 写后断言（profile 双路径 + project_rules 引用未写入即非零退出）
- **SQLite MCP 无法启动**：模板 `shared/prisma.ts` 增加 SQLite adapter（better-sqlite3 完整链路）+ `patchGeneratorOutput` 统一注入 generator output
- **status 缺失文件仅打印**：缺失时 `process.exit(1)`（CI 门禁可用）
- **bash 依赖失败检测**：db-ensure.sh / doc-format-guard 经 runCommand 显式报错（Windows 无 bash 不再静默 status=null）

### 新增

- **embedding 模型预下载**：`add-coder model:download`（`--force` 强制重下）+ `init --skip-model` + `sync --model`；模型名从 `dps-scoring-rules.toml` 零硬编码读取；缓存与运行时同源（`HF_HUB_CACHE` → `HF_HOME/hub` → `os.homedir()`，Windows 兼容）；下载超时 5 分钟兜底，失败不阻断主流程
- **check_dps 模型缺失提示**：embedding 不可用时降级纯结构分并提示 `add-coder model:download` 预下载入口（网络不通不卡死）

### 变更

- **runCommand 统一封装**：src + 模板双侧（git/npx/npm/bash 4 处迁移），本项目子进程调用 MUST 走单入口（详见 `docs/跨平台兼容开发规范.md`）
- **helpers.ts 缓存同源锚定**：运行时 `env.cacheDir` 与 CLI 预下载同解析链（transformers v3 默认包内 .cache 陷阱修复）
- **Windows CI**：GitHub Actions 双平台矩阵（ubuntu-latest + windows-latest）

---
## [0.3.18] - 2026-08-05

### 新增

- **技术栈 profile 机制**：`project_rules.md` 去技术栈硬编码 → `profiles/` 注册表（webapp/machineserver）+ `add-coder stack list/set/show` CLI + `init --stack` 申报 + MCP context 按 stack.json 追加 profile 约束
- **并发协作契约（collab-contract）**：契约模板（§3.6 HITL + §7 持久化 + 主从字段）+ `contract_track/contract_status` MCP 工具 + CollabContract 持久化 + Caijuehub 裁决入口
- **多 MCP 工具路由安全（D9）**：`ToolRegistrar` 基类接口收敛 15 个注册函数，29 工具 description 注入 `[项目: {PROJECT_ID}]` 前缀；写操作落库项目声明
- **sync --patch 白名单扩展**：`rules/profiles/`（用户自建自定义 profile 不覆盖不删除）

### 修复

- **contract_track 扫描过滤**：排除 -plan-/add-route/handoff 误扫，空解析告警，masterPlan 必需校验
- **迁移幂等化**：add_collab_contract 迁移 SQL 全幂等（DO 块+IF NOT EXISTS），已应用库重放 exit=0
- **契约文档职责边界**：§7 持久化不承载于契约文档（平台机制），模板止于 §六
- **audit.ts 基线 14 个 TS 错误**：args 窄化（string|number）+ 行类型断言，tsc 全项目归零
- **pre-tool-use.sh HITL 豁免**：handoff/implementation/runtime review 不被 HITL 拦截（core + 5 适配器统一）
- **CLI --adapter 提示**：补全 5 个 IDE（trae/codex）

---
## [0.3.16] - 2026-08-05

### 修复

- **plan_track 排除 .hitl.md 误扫为独立 Plan**（DPS 评分失真根因修复）
- sync 烘焙 plan.ts 修复到 .add/.claude/.vscode

## [0.3.15] - 2026-08-05

### 变更

- **pre-tool-use 无活跃 Plan 时 Plan/Spec/Review 写入改为提示放行**（治理策略从强制拦截升级为开发任务提示）

## [0.3.14] - 2026-08-05

### 新增

- **PlanRecord DPS 评分字段**：add model + add dps fields（四维评分持久化，供 FFT 自适应权重消费）

### 变更

- **一级依赖升级避障**：`@xenova/transformers@2.17.2` → `@huggingface/transformers@^3.8.1`（API 全兼容：`pipeline` / `env.remoteHost` / `feature-extraction` / `tolist()`），连带 sharp 0.32.x → 0.34.x——背景：sharp 0.32 经 prebuild-install 从 GitHub release 下载二进制被墙；升级后 sharp 走 `@img/sharp-*` 平台包（纯 npm registry），onnxruntime-node 1.21+ 二进制自含（+217MB 体积代价）
- **坑位文档化**：详见 [DEVELOPMENT.md §十四 依赖治理坑位记录](https://github.com/xiaomingming92/add-coder/blob/main/DEVELOPMENT.md)，含「不要降级 sharp 0.32.x」「pnpm 11 allowBuilds 白名单（onnxruntime-node 必须为 true）」两条强制约束

## [0.3.13] - 2026-08-05

### 修复

- caijuehub build fix & patch fix

## [0.3.12] - 2026-08-04

### 变更

- **取消无 Plan 对话时的强拦截**（前置提示代替强制阻断）
- **DPS 阈值文案单一真源化**：dps-scoring-rules.toml `[thresholds]` 占位符渲染 + check_dps description 动态化（README/GUIDE/caijuehub.md 共 6 处声明式）
- docs 验收闭环：handoff 按 multi-round 模板 + checklist 全绿

## [0.3.11] - 2026-08-02

### 修复

- **check_rahs 查表纠正旧逻辑**

## [0.3.10] - 2026-08-02

### 新增

- what-makes-software-cool 案例文档

## [0.3.9] - 2026-08-01

### 修复

- **MCP server Prisma 客户端目录改为 PRISMA_CLIENT_DIR 显式配置**

## [0.3.8] - 2026-08-01

### 变更

- 构建产物与发布基线

## [0.3.7] - 2026-08-01

### 变更

- **peer 依赖必须化**：移除零引用 adapter-libsql
- **prisma-sync post-sync 迁移指引策略化**：覆盖零修改/三场景边界

## [0.3.6] - 2026-07-31

### 新增

- **DPS HITL 自动化**：DPS ≥ 80 自动建 `.tongyi-{plan}` 哨兵（post-tool-use）+ 5 端能力对齐
- **gateway.ts 拆分为 gateway/ 子模块**：check_dps/check_rahs/check_spec_sync 等 5 守卫独立
- **PlanRecord 五元组全覆盖**：plan_track/plan_status 扩容（addRoutePath/tasks/checklist 进度）
- **Guardian 轻量化**：删除 Orchestrator subagent
- **DPS 检查适配**：标准版 Plan 与精简版 Plan 双格式兼容

### 变更

- **record_dev_operation beforeState/afterState 改为必填**
- 5 模板 + 3 schema：plan_track 落库步骤 + 格式守卫对齐

### 修复

- ESLint CI：required() 返回 unknown 导致模板字符串类型错误

## [0.3.5] - 2026-07-25

### 变更

- README 更新（版本同步）

## [0.3.4] - 2026-07-25

### 变更

- **caijuehub 中文表述统一**（decision → adjudication 语义对齐）
- 新增案例文档

## [0.3.3] - 2026-07-25

### 新增

- **PROJECT_ROOT 三级优先级解析策略**：caijuehub 驱动 `project-root-strategy.ts`（env_var → dirname_fallback → cwd_fallback），mcp.json 兜底
- **VS Code MCP settings.json 补 PROJECT_ROOT env**

### 变更

- 脱敏处理 + any cast 替换为 typed interface

## [0.3.2] - 2026-07-25

### 修复

- **npm link / pnpm link 后 env.ts 无法指向正确项目地址**：mcp.json 做兜底

## [0.3.1] - 2026-07-25

### 变更

- 文档纠错 + GUIDE 表述更新

---
## [0.3.0] - 2026-07-24

### Caijuehub 集中裁决层 — 首次 TOML 直驱业务代码

- **sync-rules.toml**：`[guard]` 管⑥ / `[patch]` 管①②④⑤（3 行为参数）/ `[version]` 管 3 边界
- **transcribe.ts**：新增 genSyncRules 生成器 + GENERATORS 注册 → 产出 sync.strategy.ts
- **sync.ts 薄壳化**：`import { SYNC_CONFIG }` 替代所有硬编码，改规则不改代码
- **这是 codein2027 集中裁决层理论的第一个工程落地**：人类从"追踪散落的 if"升级为"读一张决策表"，O(N×M)→O(1)。AI Agent 可大规模索引、检索、修改规则
- **docs/caijuehub.md**：集中裁决层架构文档，联动 README/GUIDE/DEVELOPMENT

### sync --patch 热更新（核心）

- **双 hash 机制**：源 hash（gen-src-hash.ts 扫描 253 模板文件 SHA256，prepare 链路打 npm）+ 产出 hash（init 渲染后写 .add-coder-hash.json 基线）
- **六场景矩阵**：①same→跳过 ②auto→静默覆盖 ③skip→不碰 ④conflict→交互勾选 ⑤missing→静默写入 ⑥PATCH_GUARD→永不触碰
- **三版本边界**：`.add-coder-version` 哨兵文件 + npmVersion 对比 → isFirstPatch/isUpgrade/hashLost 精准判定
- **selectFiles 交互统一**：`[a]` 全部跳过 `[A]` 全部覆盖，init/sync 共用同一 UI
- **PATCH_GUARD**：plans/specs/reviews 永不触碰，由 caijuehub `sync-rules.toml` 驱动
- **`npx add-coder sync --adapter=qoder --patch`** 一条命令替代旧三步（备份→init→恢复）

### 文档体系

- **README**：新增 ⑦ Caijuehub 集中裁决层 + sync-patch 升级入口
- **GUIDE.md §七**：add-coder 升级实操（旧三步 vs 新一条命令）
- **DEVELOPMENT.md §八**：双 hash 架构图 + 六场景矩阵 + 版本边界保护 + caijuehub TOML 驱动
- **docs/interaction-spec.md**：CLI 交互规范文档（`[a]/[A]` 键盘语义统一标准）
- **Handoff + Review + Specs 三元组**：Plan→ADD Route→Task→Handoff 完整闭环

### 构建

- **gen-src-hash.ts**：TypeScript 构建脚本，`prepare` 链路：`tsup && tsx scripts/gen-src-hash.ts`
- **tsconfig**：`scripts/*.ts` 加入编译范围

### 修复

- **.gitignore**：`.qoder/specs/` 加入版本追踪（`!` 例外），与 plans 一致
- **podman-compose.add.yml**：移除 `env_file`，变量由 `--env-file .env.development` 统一注入
- **adapter-rules.toml**：修复重复 `[magic_path]` 段导致 TOML 解析失败

---
## [0.2.9] - 2026-07-24

### MCP 能力重构（核心）

- **Hook 事件治理体系**：jsonl 旁路 + fs.watch 目录监听 + 内存缓冲队列（50/2s）→ 批量 Prisma 落库 → DevOperation 审计闭环
- **18→18 工具**：新增 `get_hook_events`（planKeyword/hook/时间过滤 + 分组聚合 + 阈值告警）
- **6→8 Resource 端点**：新增 `hook-events/daily` + `hook-events/weekly` 报表
- **通知升级**：hook.ts 重写为目录监听 + 队列 + 批量写入；hitl.ts 新增 5min 周期阈值告警
- **sampling/review.ts**：HITL 两步法（temporary.md → 人类拍板 → 完整 Review），支持 3 种类型

### 治理卡位升级

- **Hook 事件注入**：lib/notify.sh 零依赖 jsonl 写入 + 73 注入点覆盖 5 adapter 全部 exit 2
- **治理摘要注入**：UserPromptSubmit 自动输出 `[Hook 治理] 今日拦截: N 次`（5 IDE 全覆盖）
- **pre-tool-use.sh 正则加固**：`^` 锚点 → 命令分隔符上下文，修复 `&& mv` / `for do mv` 绕过

### 修复

- **Prisma v6/v7 路径兼容**：`shared/prisma.ts` client.ts + client.js 双候选
- **fs.watch 目录监听**：文件后创建不丢事件 + 启动时预创建空 jsonl
- **notify.sh 同步**：lib/notify.sh 分发到所有 adapter lib/ 目录
- **capabilities-and-debugging.md**：更新至 29 文件/18 工具/8 端点

## [0.2.8] - 2026-07-23

### 变更

- 文档调整
- 缓存命中介绍

## [0.2.7] - 2026-07-23

### 变更

- MCP 适配调整

## [0.2.6] - 2026-07-23

### 修复

- MCP 读文件路径错误修复

## [0.2.5] - 2026-07-23

### 修复

- SearchReplace 工具修复

## [0.2.4] - 2026-07-23

### 新增

- HITL temporary.md 机制 + sync 脚本全覆盖重构

## [0.2.3] - 2026-07-23

### 新增

- ADD 范式增强：HITL 总览 + 精简版 Plan + 算法化校验
- 自举同步脚本 sync-magic-dirs.sh

### 变更

- CLI 工程质量：init 管道化 + sync 对齐 + lint 严格化
- 模板源统一动态 MAGIC_DIR + IDE 变量去污染

## [0.2.2] - 2026-07-22

### 变更

- Hook 能力增强和修复

### 修复

- 模板文件禁止词检查矛盾

## [0.2.1] - 2026-07-17

### 变更

- README 双语折叠 → 独立章节
- 架构全景图更新：五端 IDE + 事件覆盖数
- CHANGELOG 补全 0.1.14→0.2.0 全版本链

## [0.2.0] - 2026-07-17

### 新增

- **五端 Hook 能力完全对齐**：Claude Code / Qoder CN / VS Code Copilot / Trae / Codex 五端 hook 脚本从 echo 占位符升级为完整 ADD 治理逻辑（四路守卫 / 四象限验收 / Layer 1-3 路由 / 验收幂等保护 / exit 2 阻断）
- **Codex 适配器**：新增 Codex IDE 适配，支持导入 Claude Code Hook
- **Trae 适配器**：新增 Trae IDE 适配（hooks.json 6 事件），Claude Hook 导入支持
- **VS Code 10 事件全注册**：`.github/hooks/` 10 个 JSON + `.vscode/hooks/` 独立完整脚本
- **renderAdapterBase 统一行走器**：五端 renderer 重构为薄包装
- **ADD-governance-*.md**：五端治理文档，`init` 输出到项目根
- **Qoder CN stdout JSON additionalContext 注入**：六事件全覆盖，实测通过
- **pre-tool-use 终端写文件拦截增强**：mv /tmp/ + python/node > + touch 拦截

### 变更

- **全部 hook 脚本能力对齐**：core/hooks/ 14 脚本完整治理逻辑
- **Qoder 专属文件清理**：不再泄漏到非 Qoder 端
- **doc-format-guard.sh**：五 magicDir 覆盖
- **VS Code settings.json**：npx→tsx，路径 fix
- **README 双语**：`<details>` 折叠原地切换
- **init.ts**：注册 Trae + Codex，VS Code/Trae/Codex 同步产出 `.claude/`

### 修复

- **Qoder prompt-submit.sh**：PROJECT_DIR 先于 source 导致 JSON 注入静默跳过
- **Qoder stop-check / session-end / subagent-stop**：全部改为 JSON
- **Claude doc-format-guard.sh**：16 行 → 172 行
- **schema 路径**：handoff -template 修复
- **pre-compact.sh**：Qoder 12→37 行
- **notification.sh / subagent-guard.sh**：Claude/VS Code 补齐
- **多处 .qoder 硬编码** → `{{magicDir}}`

## [0.1.17] - 2026-07-17

### 变更

- **CI release 认证调试**：修复 GitHub Actions release 流程中的认证问题

## [0.1.16] - 2026-07-17

### 新增

- **OIDC 可信发布者**：GitHub Actions OIDC trusted publisher + workflow_dispatch 自动版本 bump/publish
- **`compose .add.yml` 命名**：compose 文件以项目名命名 + JSDoc 注释补充
- **koroFileHeader JSDoc**：源码文件头部注释规范化 + `.vscode/settings.json` 配置
- **pre-push CI**：pre-push hook 指向 Actions workflow 代替手动 release

### 变更

- **standard-plan-template §四**：round-based task planning 章节对齐
- **eslint fix**：`any` 类型替换为 `Record<string, unknown>`

### 修复

- **release push**：PAT URL 直接推送绕过 checkout auth 冲突
- **release bash 语法**：修复 `node -p` 子 shell 中的嵌套引号语法错误

## [0.1.15] - 2026-07-16

### 新增

- **init 流程优化 v1**：改进 CLI 初始化交互体验与健壮性（Feature PR #4）

### 变更

- **podman 示例对齐**：`podman-compose.example.yml` 挂载卷路径与 README 保持一致

## [0.1.14] - 2026-07-16

### 变更

- **init 流程优化**：CLI 初始化交互体验改进
- **podman 示例**：podman compose 示例文件更新

## [0.1.13] - 2026-06-29

### 新增

- **injectPrisma**：CLI init 集成 Prisma 集中裁决层，自动检测/初始化/迁移数据库
- **magicDir 参数化**：适配器感知的目标目录参数化，支持 qoder/claude/vscode 独立部署
- **PRD 模板落地**：`prd-standard-template.md` 与 `prd-incremental-template.md` 双模板部署
- **文档锚定**：模板部署后自动补充 `.qoder/reports/` 等文档目录

### 变更

- **Prisma 7 架构升级**：全域迁移至 Prisma 7，AddUser 改为自包含模型
- **策略层集成**：Caijuehub TOML 集中裁决层与 Prisma 适配层打通
- **仓库清理**：移除 farm-agent 残留引用，同步所有已部署目录
- **文档补链**：GUIDE.md 补充缺失链接

## [0.1.12] - 2026-06-22

### 新增

- **Podman 支持**：`podman-compose.example.yml` 增加 Podman 容器运行时支持

### 变更

- 文档更新与表述优化

## [0.1.11] - 2026-06-20

### 变更

- GUIDE.md 地址更新

## [0.1.10] - 2026-06-19

### 变更

- init 流程优化
- GUIDE.md 地址更新

## [0.1.9] - 2026-06-16

### 变更

- README 文档更新

## [0.1.8] - 2026-06-13

### 新增

- **CLI init 重写**：全新交互式 init 流程，集成数据库自动部署与 Prisma 7 迁移

### 变更

- CI release 流程更新

## [0.1.7] - 2026-06-09

### 新增

- **适配器感知 MAGIC_DIR**：根据目标 IDE（Claude/Qoder/VS Code）自动适配输出目录
- **spawnSync 安全加固**：CLI 执行安全性增强
- **文档模板校验**：部署后的模板文件自动校验完整性
- **自动化 CI/CD**：准备 GitHub Actions 自动化发布能力

### 变更

- 文档表述调整，项目地址更新，关联仓库地址补充
- 构建产物优化

### 首次发布

- 核心 CLI、Renderer、Caijuehub 集中裁决层
- Claude / Qoder / VS Code 三 IDE 适配模板
- 完整架构与使用指南文档
