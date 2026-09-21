# CHANGELOG

> 本文档记录 add-coder 各版本的变更历史，与 [README.md](./README.md) 中的版本号保持联动。
>
> 版本号格式遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

---
## [未发布] - 待下个版本（0.3.40）

> 2026-09-21 当日工作；6 条审计链全部 CLOSED —— `…memory-cjk-bigram-baseline-plan-v1`（75/75，RAHS 91 🟢）、
> `…multi-host-adapter-alignment-plan-v1`（47/47）、`…copilot-virtualtools-visibility-plan-v1`（30/30）、
> `…plan-close-entry-plan-v1`、`…memory-injection-wiring-plan-v1`（当日关闭）、`…agents-template-and-step3-execution-modes-plan-v1`（17/17）。
>
> 列义：**变更** / **根因 → 做法** / **验收证据** / **来源**。
>
> **升级动作（VS Code Copilot，Issue [#21](https://github.com/xiaomingming92/add-coder/issues/21)）**：本版起
> `add-coder status` 会在缺键时告警 —— 按提示在 `settings.json` 加 `"github.copilot.chat.virtualTools.threshold": 0`
> 并重载窗口，即可解除工具"假禁用"（细节见下表「文档」）。
>
> **段边界**：下方 `[0.3.39]` 段是 **2026-09-18** 的发布内容（`ad3259b v0.3.39` 只 bump 版本号、未改段名），
> 只保留该批次条目（`check_spec_sync` 三项修复 + `[W]` 接线判据回灌）；当日（09-21）条目已按发布窗口
> **全部归入本段**（该是谁的就归谁）。

### 新增

| 变更 | 根因 → 做法 | 验收证据 | 来源 |
| --- | --- | --- | --- |
| **记忆检索词法基线换地基：`searchText` 分词主通道 + jieba 主 / bigram 兜底** | 原 PG 基线实为 `pg_trgm` 相似度（trigram 窗口 3 字 ⇒ **2 字中文查询连 token 都生成不出**），通道 B 的 `to_tsvector('simple', topic`‖`content)` 对中文**不分词**（整段一个 token）；bigram 只在查询侧、文档侧无索引；评测只跑内存 SQLite 却外推 PG 表现。→ 改为**写入期产出的 `searchText`（CJK bigram / jieba 词级 token 串）+ `tsvector` 表达式索引 `AddMemory_searchText_tsv_idx`**（**不依赖扩展**），写查共用同一 tokenization 契约（`retrieval/cjk-tokenize.ts` 为 bigram 真源、`cjk-segmenter.ts` 出 `{terms, method}`）；`@node-rs/jieba` 作 **optionalDependency**，装不上即 bigram 兜底且 `method` 显式暴露（**禁止静默降级**）；SQLite 虚表列改 `searchText` + `tokenize=unicode61`，触发器同步 | ① 双后端同标注集评测（PG 走**事务内**灌语料 + `ROLLBACK` 不落库，阈值唯一真源 `PASS_THRESHOLD`）实测 **sqlite / pg 各 `Recall@5 = 0.9444`**（leakage/mandatory/scope 全 0），**2 字短查询 `mandatoryMiss = 0`**；② **检索指纹**（jieba 版本 × 词典哈希 × tokenization 契约版本）⇒ 分词器/词典一变即显式报「需重索引」，配套 `backfill-search-text --apply --refresh`；③ `get_memory_health` 增 `lexicalProfile`（`method` / `degradedReason` / `userDict` / `fingerprint`）+ 两条降级告警（`LEXICAL_BIGRAM_FALLBACK` / `LEXICAL_FINGERPRINT_STALE`）。**已知边界（如实登记）**：同义桥接（"表结构改" ↔ "迁移"）不在词法能力内，两侧对称漏召，需 `--hybrid` 向量通道或领域词典 | `…memory-cjk-bigram-baseline-plan-v1` 轮 1–3（75/75，RAHS 91 🟢） |
| **MCP Apps 渲染探针 `probe_widget_render`** | 面板报 "This app couldn't be loaded" 时分不清是宿主渲染器 / 宿主 CSP 拦 inline / 业务 widget 缺陷。→ 新增最小 widget 探针资源（`ui://add-coder/widget-probe-minimal`，**零外部引用 / 10 行内联脚本 / 不查业务 DOM id**）与配套工具，把三类原因**一次分开** | 本仓实测：服务端 `resources/read` 正常返回 HTML（`capabilities.extensions`、工具 `_meta`、MIME 全绿）而**最小 app 仍报 "This app couldn't be loaded"** ⇒ 判定 Codex 桌面端渲染器故障（宿主侧），据此补 Codex 治理文档「面板加载失败三步定位」与降级通道口径 | `…multi-host-adapter-alignment-plan-v1` |
| **范式 Step 3「执行风格」`executionMode`（`stepwise` 默认 / `delegated` 托管）+ `AGENTS.md` 入口模板化 + 特殊占位符声明化** | 托管模式易被误读成「可以省流程」。→ `templates/core/AGENTS.md` 成为入口**真源**（`{{magicDir}}` / `{{projectName}}` / `{{stackReferenceLine}}` 占位符，六端渲染分发）；Step 3 声明式开关下 —— **托管仍完整遵守 ADD**（`[T]` 验证 / `record_dev_operation` / `tasks.md` 勾选 / 闸门 / 3.5 / 0.6.5 / Step 8 照做），唯一差别是**不逐步向用户同步进度**，仅在两个可判定停止条件打断：①文档与代码不对齐（`check_spec_sync` 未归因漂移 / 偏离 WHEN-THEN）②基线低于预期（`tsc`/`pnpm test`/`validate-docs` 失败或 DPS<80 / RAHS<90）；`vocabulary` 增「托管实施 / 单步实施」触发词 | 六端渲染一致；Plan 17/17 | `…agents-template-and-step3-execution-modes-plan-v1`（17/17） |
| **多宿主适配：三端「面板 + 工具可见性」口径文档化** | 三端宿主能力差异此前无成文口径，用户常在真机上撞墙：Claude Code **不渲染** MCP Apps `ui://`（[issue #95149](https://github.com/anthropics/claude-code/issues/95149)）；Trae 输入长度 = 提问 + agent prompt + **该 agent 所用 MCP server 的全部工具定义** + 规则，超限**发不出问题**；Qoder CN 工具按 **prompt + 名称/描述**自动挑选、无确定性白名单。→ 逐端写清面板与工具预算口径 + 审批降级路径（`render_hitl_approval` 的 `fallback.markdownPath`/`htmlPath` 人工确认后 `update_hitl` 落库；治理工具 `alwaysLoad` / `"anthropic/alwaysLoad": true` 常驻；命名「动词 + 治理对象 + 触发时机」） | README（中/英）「已知问题 / 限制」1 → 4 条；GUIDE 新增「九·二」三端排障表；六端 `docs/ADD-governance-*.md` 逐端与真源一致 30/30 | 同 Plan 轮 1 |
| **服务端 MCP Apps 扩展协商 + server instructions** | 此前只靠工具侧 legacy 位（`_meta.ui.resourceUri` + `openai/outputTemplate`），宿主一旦收紧协商就全端同时失效。→ `capabilities` 增 `extensions["io.modelcontextprotocol/ui"]`（官方扩展规范要求宿主与 server 双方声明），真源抽到零副作用模块 `scripts/mcp-server/shared/server-capabilities.ts`（入口 import 即启动，内联则不可单测）；补 `instructions`（**≤2048 字节**、前 512 字符自包含：三个必做 WHEN + 六个工具族分区）提升 tool search 与描述式选择命中率；legacy 位保留不删 | `tests/mcp-apps-capability.test.ts` 8 用例守护（扩展键序列化 / 既有能力保留 / legacy 防误删 / widget URI 形态 / instructions 长度·前缀·六族·禁宿主开关名） | 同 Plan 轮 2 |
| **Plan 生命周期关闭首次真正落地** | 关闭 Plan 此前无入口、状态不可逆。→ `plan_update` MCP 工具 + 随模板分发的 `{magicDir}/scripts/plan-close.ts`（与工具**共用同一实现**，禁止工具/脚本双份漂移），生命周期可逆（新增 `REOPENED`） | `…copilot-virtualtools-visibility-plan-v1` 与 `…memory-injection-wiring-plan-v1` 落 `CLOSED`（后者由 multi-host 轮 3 核验收敛后关闭，重复执行返回 `idempotent: true` 且不新增审计） | 基座 `…plan-close-entry-plan-v1` |
| **`add-coder status` 宿主适配自检（建议性，Issue #21 配套）** | VS Code 端必配项缺失时用户没有自查路径（且 `status` 走 `loadConfig` 时 `magicDir` 默认空串，只看配置就永不触发）。→ 探测工作区级 `.vscode/settings.json` 与用户级设置（win32 `%APPDATA%` / darwin `Library/Application Support` / linux `~/.config`，含 `Code - Insiders` 变体，容忍 JSONC 注释与尾随逗号），缺键或非 0 即输出告警 + 可复制修复片段 + 治理文档路径；**只报告，不写用户设置、不改退出码**（exit 1 语义不变，仅把自检提到退出判定之前）；补布局证据（`.vscode/mcp.json` 存在 / settings 含 `mcp` 段或 `github.copilot.chat.*`）；解析失败显式输出，不静默当通过 | `tests/cli/status-host-check.test.ts` 13 用例（缺失 / 为 0 / 非 0（含字符串 `"0"`）/ JSONC 四态 + 三平台路径 + 四态门控）；dist 产物在临时 VS Code 项目实测告警态与通过态，`find -newermt` 为空 ⇒ 未写任何文件 | `…copilot-virtualtools-visibility-plan-v1`（30/30） |

### 文档

| 变更 | 根因 → 做法 | 验收证据 | 来源 |
| --- | --- | --- | --- |
| **`status` 宿主自检文案加固** | 必配项是宿主实验设置，若被改名/移除，旧文案会产出永远消不掉的告警。→ 缺失态补「若你的 Copilot / VS Code 版本已不再提供该设置项，可忽略本告警（建议性检查，不影响退出码）」，文案抽为纯函数 `virtualToolsNoticeLines()` 以便断言 | 用例 13 → 15 | `…copilot-virtualtools-visibility-plan-v1` |
| **VS Code Copilot 工具"假禁用"（Issue [#21](https://github.com/xiaomingming92/add-coder/issues/21)）：修复措施** | 折叠根因在宿主：Copilot Chat 的 `VirtualToolGrouper` 在**全局 MCP 工具总数 ≥ `virtualTools.threshold` / 2（默认 64）**时按 toolset 分组、组内按字母序只留前 N-1 个直连，其余折进 `activate_fallback_*`；未激活代理即调用 → 稳定误报 `Tool mcp_<server>_<name> is currently disabled by the user`（实测 **26/47**：`plan_*` / `review_*` / `status_*` / `update_hitl` 等字母序后段全中 ⇒ HITL 审批链（TONGYI 不落库 → 哨兵不生成 → Plan 正文写入被 PreToolUse 阻断）与 ADD-7 审计链同时断裂；Pylance 19 中 14、Java Debug / Python 同受害）。→ **修复措施（逐条对齐 issue 建议 1–4）**：①**必配项** `"github.copilot.chat.virtualTools.threshold": 0`（阈值=∞ ⇒ 折叠整体禁用，**需重载 VS Code 窗口生效**）落到 `ADD-governance-vscode-copilot.md`「工具可见性」章节 + README §⑦ 指针 + 新增「已知问题 / 限制」索引（中英同步）；②**诊断入口** `add-coder status` 建议性自检 —— 缺键或取值非 0 即输出告警 + 可复制修复片段 + 文档路径（**只报告，不替用户改 settings**）；③**降级流程** —— 先在当前工具列表激活描述含 `Contains the tools:` 的 `activate_fallback_*` 代理再重试目标工具（**代理名随会话槽位重算、勿缓存**）；④**上游反馈草稿** 登记两点（错误文案误导、折叠命中治理关键工具）。另 `ADD-governance-codex.md` 增「HITL 审批面板：三前提与降级路径」（宿主开关 `enable_mcp_apps` / 改过工具元数据或资源 URI 后必须重连 MCP server / markdown + `update_hitl(_fallback)` 降级入口，且**不**为宿主实验旗标加常驻看门狗） | issue 报的触发线 64、受影响 26/47 在文档里逐条可核对；六端 `ADD-governance-*.md` 同步分发；GUIDE 第九节 VS Code 排障流程 | `…copilot-virtualtools-visibility-plan-v1`（30/30） |

### 模板

| 变更 | 根因 → 做法 | 验收证据 | 来源 |
| --- | --- | --- | --- |
| **`executionMode` 口径补齐三处同族模板** | 该开关此前只在 `skills/add-paradigm/SKILL.md` 与**重型** add-route 模板生效，轻量 `add-route-template.md`、`simple-plan-template.md`、`handoff-multi-round-template.md`（**每轮粘贴给 AI 的启动指令**）仍写死单步节拍 ⇒ 轻量路径会把托管开关抵消一半。→ 三处均补「适用模式」说明 | 六端同步分发，逐端 6/6 一致 | `…agents-template-and-step3-execution-modes-plan-v1` |

### 修复

| 变更 | 根因 → 做法 | 验收证据 | 来源 |
| --- | --- | --- | --- |
| **`db:ensure` 幂等出口被他因阻塞** | `PlanLifecycleStatus.REOPENED` 当时是**直接 `ALTER TYPE` 打在库上**的、迁移历史缺失 ⇒ db-ensure 重建的干净 shadow 不含该值 ⇒ 每次 diff 都生成同一条 `ADD VALUE`，打到主库（已存在）即报 `enum label already exists (42710)`。→ 补 versioned 迁移 `20260921150000_plan_lifecycle_reopened.sql`（`ADD VALUE IF NOT EXISTS`，对已手工加过的库是 no-op）并删掉失败运行遗留的自动生成 delta | `pnpm db:ensure` 连跑两次均 `schema 一致（幂等出口）`、不再重新生成 delta | `…plan-close-entry-plan-v1` |
| **两处分发缺口（下游会半残）** | ① 用户项目的 schema 真源 `templates/core/prisma/add.prisma`（`src/cli/prisma-injector.ts` 据此注入）**缺** `AddMemory.searchText` 与 `PlanLifecycleStatus.REOPENED` —— 仓根有 ≠ 下游有；② 回填脚本 `backfill-search-text.ts` 原只在**仓根**、不随包分发 ⇒ 下游无法自助回填存量。→ ①补齐 ②下沉 `templates/core/scripts/memory/`（相对路径在 templates 树与 `{magicDir}` 树中一致），仓根改为转发导入（避免双份实现漂移） | 两份 `add.prisma` diff 完全一致；仓根与 templates 树脚本同源 | `…memory-cjk-bigram-baseline-plan-v1` + `…plan-close-entry-plan-v1` |
| **唯一 eslint 错误（生成器冗余类型断言）** | `src/caijuehub/transcribe/generators/custom.ts` 的 `Object.entries((d.replace_specials ?? {}) as Record<string, string>)` 中 `?? {}` 后类型未变，触发 `@typescript-eslint/no-unnecessary-type-assertion` ⇒ `eslint src/` 非零。→ 删除断言 | `eslint src/` **零 error**；`tsc` 0 / `pnpm test` 635 passed \| 6 skipped | `…agents-template-and-step3-execution-modes-plan-v1` |
| **HITL core widget 在 Codex 报 "This app couldn't be loaded"（资源 URI 缓存键）** | 宿主把 MCP Apps 的 resource URI 当**缓存键**（官方规范：「Treat the resource URI as a cache key. When you make a breaking change to the HTML, JavaScript, or CSS, publish a new URI and update every tool that references it.」），而 `hitl-approval-widget.html` 09-18 改过、URI 未变 ⇒ 持续命中旧组件缓存。→ **机制化**：`shared/hitl-ui.ts` 的 `getHitlApprovalWidgetUri()` = 基名 `ui://add-coder/hitl-approval` + widget 内容 sha256 前 8 位（进程内 memoize；文件缺失回退基名，fail-open），资源注册与工具 `_meta.ui.resourceUri` / `openai/outputTemplate` **共用同一函数**，改 HTML/JS/CSS 即自动换 URI，不再靠人记得 bump；`render_hitl_approval` 出参补 `ui.requiresHostFlag` 与否决提示（两个排查项：宿主实验开关、MCP server 重连） | `tests/hitl-widget.test.ts` 新增「内容变 ⇒ URI 必变 / 文件缺失 ⇒ 回退基名 / 工具 `_meta` 同步指向新 URI」用例（5 passed） | `…copilot-virtualtools-visibility-plan-v1`（`d1215db`） |

---

## [0.3.39] - 2026-09-18

> 2026-09-18 的两批内容：① 自 farm-agent 回灌的 `[W]` 接线判据（模板真源 + 六端分发）；
> ② `check_spec_sync` 版本配对修复（同一根因波及另外 4 个闸门工具）。审计链：`farm-agent-template-backport-2026-09-18`、`add-coder-check-spec-sync-version-pairing`。

### 修复

- **`check_spec_sync` 永远命中 v1 路线图**（farm-agent 多 v2 Plan 暴露）：add-route 解析按 planKeyword **去版本后缀取首个匹配** → 多版本共存时恒命中日期最早的 v1，于是拿旧版路线图的附录比对当前工作区，实测报出 **37 个"未登记"假告警**。新增 `gateway/plan-resolve.ts` 作为 Plan↔兄弟制品版本配对**单一真源**（Plan 取版本最高且排除 `.hitl` / devlog / handoff / add-route / review 兄弟产物；add-route 走「同目录同版本 → 同基名最高版本 → 关键词兜底」；**版本落后显式告警，不静默降级**），`check_spec_sync` / `check_dps` / `check_add_route_status` / `check_add_route_completeness` / `check_rahs` 五个闸门工具统一改用（六端同步分发）。farm-agent 实测：Plan 由 `...-plan-v2.hitl.md` 纠正为 `...-plan-v2.md`，add-route v1 → v2，未登记 **37 → 12**；显式传 `-plan-v1` 时仍正确配对 v1
- **`check_spec_sync` 未登记噪声无法归因**：git diff 是全仓范围，多 Plan 在飞时其它 Plan 的交付物被算进本 Plan → 现先按其它 add-route 的附录分摊归属（命中即归属、全部命中提前结束），单列「属于其它 Plan 已登记的交付物（本 Plan 不判定）」，farm-agent 实测 16 个文件被正确归因
- **git diff 路径引号/八进制转义（同族第三例）**：`core.quotepath=false` 在路径含特殊字符时仍可能加引号，而带引号的 `".codex/..."` 既躲过 magic 前缀豁免、也与附录里的真实中文路径比不中 → `check_spec_sync` / `check_rahs` 统一改 `--name-only -z`（NUL 分隔，git 永不加引号），路径解析收敛到 `splitGitPathList`
- **回归可用性**：新增 `tests/plan-resolve.test.ts`（14 用例，含 farm-agent 真实多版本布局、`-plan-v2.hitl.md` 干扰、版本落后告警、review 变体名、`-z` 路径解析、归属分摊提前结束）；全量 558 passed / 10 skipped，`tsc --noEmit` 干净，`validate-docs` 失败数不变

### 模板

- **`[W]` 接线判据回灌**（自 farm-agent 2026-09-18 回流 P0 #R9，同类事故三例均"纯函数与单测齐全、生产不可达"）：`review-implementation-template` 新增 **§6.2 接线可达性核对**——被调用方逐项核对表（symbol / 期望调用点 / grep 非测试命中 / 端到端产出 / 判定）+ 4 条可否证伪判据，明确"实现了 / 有单测 / 已导出"**不作为通过理由**；`review-implementation-template.schema.json` 增 `wiring` 章节且 **`required: true`**（硬判据，不接受降级——历史 review-implementation 文档会因此多一条 `MISSING_SECTION`，已知并接受）；`checklist-template` 图例新增 `[W]` 接线验证并补一条检查项。farm 域符号名泛化为 `{symbol}` / 占用通道表述，溯源保留在 `[来源: farm-agent 2026-09-18 回流 P0 #R9]`（六端同步分发）

---
## [0.3.38] - 2026-09-16

### 修复

- **发版跳号根治（0.3.35 → 0.3.37 跳过 0.3.36）**：根因是**双重 bump**——仓库被手工预 bump 到 0.3.36，`release.yml` 又按 patch 规则 bump 一次（0.3.36 → 0.3.37），而原"发布不变量"只比对仓库内部（package.json vs src-hash），挡不住仓库↔registry 漂移。新增 `scripts/release-preflight.ts`（CI 与本地共用的单一真源）作为**发版硬门禁**：① 仓库版本 == registry `latest`（双向拦手工 bump 与手工 publish）；② package.json == src-hash `_version`；③ 上一版 tag `v<版本>` 存在。任一不过 → workflow 在 bump 之前失败，不污染 registry
- **`publish.yml` 发布幂等**：tag push 也可能来自历史 tag 补打/重推，"Release 是否存在"去重不足（版本已在 npm 时会 E403 红一条无用流水线）→ 先查 registry，已存在则跳过 `publish`、仅按需补 GitHub Release
- **SQLite 记忆 FTS5 期望态无人创建**（`add-coder-sqlite-memory-flow-plan-v1`）：`prisma db push` 只建 Prisma 表，`add_memory_fts` 虚表 + 3 个同步触发器是原生 DDL → sqlite 项目 `recall_memory` 直接 `no such table`。现在 `init --engine sqlite` 与 `db-ensure.sh sqlite` 都会应用期望态（幂等、失败告警不阻断），并新增自助入口 `add-coder memory:reindex [--probe|--apply] [--backend postgres|sqlite] [--json]`（双后端同一条编排；退出码 0=探测成功/重建收敛、1=重建后仍缺失、2=基础设施失败）
- **Prisma 7 契约漂移（三处调用点）**：`db execute` 已移除 `--schema`（实测 7.9.1 报 unknown option；datasource 由项目 `prisma.config.ts` 提供），init 路径、`db-ensure.sh`、`memory:reindex` 三处统一去参；pnpm 分支由 `dlx` 改为 `exec`，避免自动拉取最新版 Prisma（实测会解析到 8.0-rc）造成版本漂移
- **打包产物与源码行为不一致**：tsup/esbuild 按 `target=node20` 的内置模块表把 `import("node:sqlite")` 改写成裸包名 `sqlite`，dist 产物运行时报 `Cannot find package 'sqlite'`（单测全绿但功能等于没交付）→ 改走 `createRequire`；构建产物冒烟已纳入验证步骤
- **`check_spec_sync` / `check_rahs` 的 git diff 口径缺陷**：附录路径白名单漏 `.sql`/`.prisma`、`git diff --name-only` 对非 ASCII 路径做八进制转义 → 已登记的 `.sql` 与中文架构文档被误报"不在附录中"；补白名单 + `core.quotepath=false`（六端同步分发）
- **模板真源版本对齐**：`templates/.add-coder-src-hash.json` 的 `_version` 落在 0.3.36、而包版本已是 0.3.37（发布流程 bump 版本后未重跑 `gen-src-hash`）→ 重新生成对齐；该不一致由 `tests/windows-stability.test.ts` 的发布不变量断言捕获
- **发布流程补不变量**：`release.yml` 的 bump 步骤改为「bump 版本（先不打 tag）→ 重跑 `gen-src-hash` → 断言包版本 == 模板真源版本 → 提交 → 打 tag → 推送」，tag 指向的提交不再滞后一版；手工发版口径同步写进 [CONTRIBUTING.md](./CONTRIBUTING.md) 与 [docs/npm-publish-guide.md](./docs/npm-publish-guide.md)

### 新增

- **记忆 FTS 期望态单一真源 + 生成物**：清单落库层 `src/lib/memory-fts-objects.ts`，`retrieval/fts/sqlite-fts5.sql` 降级为生成物（`scripts/memory/gen-sqlite-fts-sql.ts`，支持 `--check` 防漂移），生成物与真源逐字一致性由用例守护——三入口（init / db-ensure / CLI）共用同一实现，不再出现"TS 与 .sql 各写一份"
- **贡献者墙生成器**（`npm run contributors`）：真源 [docs/contributors.toml](./docs/contributors.toml)（人工登记——生态贡献者 / 维护者 / 文案与排序无法自动判定）→ 生成 CONTRIBUTING.md 的头像墙与 docs/ACKNOWLEDGEMENTS.md 的总览表（各自标记区间内，生成区勿手改）；`npm run contributors:check` 随 `npm test` 跑（生成区与真源不一致即失败）；`npm run contributors:audit` 追加「未登记提交作者」审计（依据真源 emails，默认不联网）
- **贡献者墙自动刷新 workflow**（`.github/workflows/contributors.yml`）：每周一 01:00 UTC + release 完成后触发——生成区滞后则开 / 更新 PR（`chore/contributors-refresh`）；出现未登记提交作者则开 / 更新「待登记作者」issue。workflow 只做编排，逻辑仍在生成器与测试里

### 文档

- **贡献者墙**（头像墙 + 上榜标准）位于 [CONTRIBUTING.md](./CONTRIBUTING.md#-贡献者墙) 简介与目录之间；**逐项明细**在 [docs/ACKNOWLEDGEMENTS.md](./docs/ACKNOWLEDGEMENTS.md)（README 底部入口）：记录 `memory_cache` 分支记忆轮动贡献、生态衍生包 [`add-coder-flash`](https://www.npmjs.com/package/add-coder-flash) 与持续输出 issue 的反馈者，逐项可核对

---
## [0.3.37] - 2026-09-15

> 版本说明：**能力合流版**，npm 实况 `latest = 0.3.37`（CI 从 0.3.35 直接切档，**0.3.36 未发布到 npm**，本条目即该版本内容）。
> 0.3.35 的记忆闭环（Phase 4/5）、core 校验层与运行时治理，
> 与本版纳入主线的 Stop 弹框频控、五端 spec 引用解析、控制面分发收敛汇于一处——
> 记忆 / 治理 / 交互三层能力全部就位。从本版起，后续开发统一在这条主线上继续。

### 修复

- **自身 `db:ensure` 补齐 raw 对象守卫**：raw 对象登记 + DROP 守卫此前只覆盖模板分发版，本版把三件事补进自身脚本——① 期望态并入 raw 对象登记段（向量段按目标库 pgvector 能力条件拼接）；② apply 前 DROP 守卫（`ADD_DB_ALLOW_DROP=yes` 才放行）；③ Atlas dev 沙箱库每次 diff 前从 template1 重建（Atlas 清理 dev-url 时会连扩展一起清掉）。该路径实测会被 diff 生成 `DROP INDEX`（`AddMemory.topic/content`、`AddMemoryEvidence.excerpt` 的 trgm 索引），现已闭环

### 变更

- **能力合流**：Stop 弹框频控（`[protocol.stop]` 规则 + 契约层哨兵计数 + 5 adapter / 6 magicDir 烘焙产物 + 冒烟/隔离脚本）、`check_dps` 五端 spec 引用解析（`shared/dps-spec-ref.ts`）、`check_spec_sync` 附录补 `.toml`、配置入口分发归 sync-magic 全部并入主线——这批能力的原始条目见下方 [0.3.34] / [0.3.33] 补记
- **数据库镜像全面换为含 pgvector**：`add-coder init` 生成模板（`composeContent`）、**代码起容器路径**（`prisma.strategy` 的 `{project}-add-postgres` 与 `{project}-add-dev`）、`podman-compose.example.yml`、README 中/英示例片段、以及 add-coder 自身 `podman-compose.add.yml` 统一改用 `docker.io/pgvector/pgvector:pg16`（PG 16.15）——向量通道开箱可用；目标环境没有 pgvector 时记忆检索仍按 fts-only 合法降级
- **template1 扩展引导 + dev 沙箱库探测**：`db-ensure.sh`（模板版 + 自身版）在 diff 前幂等补齐 `template1` 的 `pg_trgm` / `vector`，让 Atlas dev 沙箱库每次重建都扩展齐备（缺扩展时 diff 会在解析 `gin_trgm_ops` / `vector` 处中止）；模板版同时按容器 / 超级用户 / 库名依次探测，兼容各历史形态的 dev 容器
- 自适应向量迁移（`20260913090000_agent_memory_vector`）在扩展就绪后建出 `add_memory_vector`——记忆检索由此可跑向量 / 混合通道（无 pgvector 环境按 fts-only 合法降级）

### 文档

- README（中/英）跨轮记忆能力改写为「文档层 + 知识层」，预告表「对话记忆增强」置为 ✅ v0.3.35
- DEVELOPMENT 增 §十六 文档校验层 / §十七 跨轮记忆闭环 / §十八 运行时治理 + §9.6 期望态登记与 DROP 守卫，目录重建（44 条、0 悬空锚点）
- README §④ / §⑥ / §⑪ 统一为「结构差异」版式（一句主张 + 对比表 + 如实登记）；英文镜像同步并修正过时表述（DPS 定义与阈值、hooks `.sh`→`.mjs`、覆盖事件计数）

---
## [0.3.35] - 2026-09-14

> 版本说明：`package.json` 对齐 npm 实况（latest = 0.3.34，本条目随发布追加为 0.3.35）。
> 本版内容 = `memory_cache` 分支 30+ 提交（记忆闭环 Phase 4/5、校验层、运行时治理、HITL 链路、模板回灌）。

### 新增

- **文档校验层（core/validation）**：以 `templates/core/templates/*.schema.json` 为**唯一形式判定真源**的集中校验层——schema 驱动判定（章节/子章节/轮次/占位符/结构位禁词 + 锚定 + 半角全角等价）、17 类文档注册表（未注册即抛）、卡位策略（advisory/blocking + 依据）、规则适用性（Rule × Hook：锚定仅书写卡位、证据占位仅收尾卡位）；守卫删除内联实现改调 core；封口 `handoff` 因子改为"存在 ∧ 合规"；新增批量命令 `scripts/validate-docs.ts`（默认 advisory，`--strict` 才非零退出）
- **跨轮记忆闭环（Phase 4/5）**：Gate→MetricSnapshot **幂等采证**（`sourceRef=<gate>:<planKeyword>:<runId>`，runId 内容派生）、位点确定性召回（五类词表 + 特异性优先）、Handoff Digest 候选生成 + v1 兼容门面（`deprecated+mappedTo`，不转发执行）、索引探针与重建；**向量/混合召回**（pgvector / sqlite-vec 双通道 + 能力检测 + `degradedMode` 降级）；`db:ensure` **DROP 守卫 + 期望态 raw 对象登记**（`prisma/raw-objects*.sql`），Atlas diff → `Schemas are synced`
- **排序权重校准基座**：反馈统计（通道×位次×outcome）/ 冷启动批量拟合（n<5 门控）/ **权重快照作为排序参数单一事实源**（`rankingVersion` → v3 快照哈希）/ Kalman 在线估计 / FFT 节奏诊断（**不直接产出排序**）
- **运行时治理**：产物-进程**新鲜度四态判定**（`stale`/`unknown`）+ 重启标记**启动自愈**；MCP **孤儿族识别与回收**（族根 ppid 落 init/systemd 或父进程已消失 → 整族标记；sync 末尾两段式回收；服务端孤儿自退看门狗）
- **HITL 链路补全**：`create_hitl` 的 MCP Apps 分流（Codex 下不展开高维 inputRequired，支持 `_mcp_apps` 强制）+ 工具描述与行为对齐；`hitl.md` 生成器补齐 `## 审批结论` 并支持裁决回写（时间/决策/原因）；`render_hitl_approval` 返回 `stale` / `ui.rendered="unknown"` / fallback 双路径（markdown 提案 + 实例 HTML）

### 修复

- **非交互环境静默挂起**：`ask()` 在"永不 EOF 的管道"下永久阻塞（`add-coder init` 无输出卡死，实测 >75s）→ 改为宽限结队 + stderr 审计痕迹；peer 依赖安装失败只报退出码 → 带出真因
- **依赖树被夹具反写**：集成测试经 `node_modules` 符号链接真跑 `npm install`，npm reify 反写仓库依赖树 → 夹具加包管理器垫片隔离
- **三项既有测试失败**：版本硬编码（改为断言"真源版本 == 包版本"）、容器残留 + podman 映射 uid 清理（按名回收 + `podman unshare` 兜底）、基准抖动（5 次取最小值，阈值 100ms 未放宽）；端口夹具隔离到专属父目录
- **校验层自举发现**：半角/全角标点不等价导致 4 份 tasks.md 假报缺章节；`countRounds` 对模板示范写法（`## 第 1 轮 抽层`）假报 0 轮
- **追踪器口径漂移**：`plan_track` 的 `[T]` 计数改为复用校验层 `checklistStats`；`review_track` 兼容 `{plan}-plan-v1-review.md` 命名；`hitl.ts` 4 处既有 `as any` 换 MCP SDK 类型

### 模板

- `review-template` / `review-implementation-template` 增 **§0 三通道矩阵**（①生命周期流 ②内容流 ③结构化流，缺任一 = P0）；`review-implementation` 增 §6.1 **流式端点结构化字段投影完整性**；`checklist-template` 增 schema 变更后 client 新鲜度（`db:generate` + 重启校验）、三通道验收、外部契约版本漂移检查（自 farm-agent 回灌并泛化为通用表述）

### 文档

- 架构文档回填 as-built（实施现状对照表 + 校验层/运行时治理/HITL 三个子系统 + 未达标与挂账）
- 新增规范：《校验层与生命周期联动》《孤儿进程族识别、回收与自防（Ubuntu 实测，可移植做法）》

### 已知限制（如实登记）

- **Hybrid `MRR@5` 实测 0.4867 < 0.75 门槛**（FTS-only `MRR@5=0.6551`、`Recall@5=0.9592`）：门槛**不下调**，由排序校准线程以数据校准替代手调，待足够多单元封口后复跑
- widget 在 Codex `26.908` 不渲染（服务端与对照机 `26.903` 逐字节等价 → 客户端 build 行为）；审批走 markdown 提案 + 实例 HTML + 聊天拍板，结论照常落库/落文档

---
## [0.3.34] - 2026-08-19（2026-09-15 补记）

> 补记条目：0.3.33 / 0.3.34 的变更在此归档，供版本溯源对照。

### 新增

- **Stop 弹框频控**：`[protocol.stop]` 规则（caijuehub）+ 治理契约层哨兵计数（`stop-router` 按 magicDir 记录，命中频控窗口后降为单次提示）；烘焙分发到 5 adapter / 6 magicDir，配套冒烟、隔离、窗口与产物损坏降级验证脚本（`tests/stop-prompt-limit-*.sh`）

## [0.3.33] - 2026-08-18（2026-09-15 补记）

### 修复

- `check_dps` 支持五端（qoder / claude / add / vscode / codex·trae）spec 引用解析——此前正则只认 4 端，新增 `shared/dps-spec-ref.ts` 作为单一解析入口
- `check_spec_sync` 附录提取补 `.toml` 扩展名（`sync-magic-rules.toml` 等控制面文件此前不纳入清单）

### 变更

- 配置入口分发归 sync-magic（`settings.json` / `hooks.json` 走 CONFIGS 段声明式分发），`hook-bake` 回归纯烘焙器职责

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
