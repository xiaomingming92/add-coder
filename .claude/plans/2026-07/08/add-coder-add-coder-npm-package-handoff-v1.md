# add-coder npm 包 — 6 轮原子事务交接手册

> **适用场景**：6 轮原子事务变更，每轮独立收敛。将 ADD 范式从 add-coder 内部工具改造为可发布的 npm 包。
>
> **用途**：每个新对话开始时，把对应轮次章节粘贴给 LLM。

---

## 全局元信息

- **父 Plan**: `add-coder-add-coder-npm-package-plan-v1.md`
- **原子事务拓扑**: `add-coder-add-coder-npm-package-add-route-v1.md`
- **目标仓库**: `/home/xmm/ai/add-coder`
- **总文件数**: 约 90 个独立文件
- **轮次数**: 6 轮局部闭包
- **拆分原则**: 以业务原子闭包为主，以对话上下文容量为辅

```
第1轮 ── 基础准备（Prisma 模型 + 清理硬编码，可并行）
           │
           ▼
第2轮 ── 架构搭建（模板目录重组 + 适配器三层骨架）
           │
           ▼
第3轮 ── 适配器实现（Claude → Qoder → VS Code 串行）
           │
           ▼
第4轮 ── 配置 + CLI（Zod schema → CLI 重写）
           │
           ▼
第5轮 ── 测试 + 发布（集成测试 + 文档 + npm pack）
           │
           ▼
第6轮 ── 裁决层（caijue.toml 索引 + 策略 GENERATED+USER CODE + transcribe.ts）
```

---

## 原子事务边界说明

- **轮次级闭包**：每轮的文件集合形成独立边界。
- **独立验证**：每轮完成后可通过 checklist [T] 项独立验证。
- 第1轮 Task 1.0 和 1.1 可并行（互不依赖文件）。
- 第3轮三个适配器串行（Claude → Qoder → VS Code）。
- 第5轮是前 4 轮收敛后的验证合流。
- 第6轮是架构增强，不修改前 5 轮核心逻辑。

### 交接手册与 spec 的优先级

- 本 handoff 是新对话的入口索引。具体实现细节以 `.claude/specs/add-coder-add-coder-npm-package/spec.md`、`tasks.md`、`checklist.md` 为准。
- 如果 handoff 摘要与 spec/tasks/checklist 存在颗粒度差异，以 spec/tasks/checklist 为准。

---

## 第1轮：基础准备

### 你当前的位置

你是第 1 轮。上游无（本轮为起点）。

### 上游已完成

无。

### 恢复上下文审计查询（新 AI Session 首次启动必读）

```text
query_audit_logs({ planKeyword: "add-coder-npm-package" })
```
→ 返回 4 条：add.prisma (PRISMA_SCHEMA) / prisma-injector.ts (CLI) / templates (TEMPLATE_REFACTORED) / renderer.ts (RENDERER)。beforeState 均为 {}，afterState 含文件结构和关键参数。

```text
query_audit_logs({ targetId: "packages/add-coder/src/core/renderer.ts" })
```
→ 返回 1 条：placeholder 替换逻辑 `renderCore()`。

```text
query_audit_logs({ targetId: "packages/add-coder/templates/core/prisma/add.prisma" })
```
→ 返回 1 条：DevOperation + AuditLog 模型定义。

**恢复顺序建议**：
```
1. session-init SKILL
2. query_audit_logs({ planKeyword: "add-coder-npm-package" }) → 查看本轮 4 条记录
3. read ".claude/specs/add-coder-add-coder-npm-package/spec.md"
4. read ".claude/specs/add-coder-add-coder-npm-package/tasks.md"（第1轮）
5. read ".claude/specs/add-coder-add-coder-npm-package/checklist.md"（一、二、四）
```

### 原子事务目标

两个并行 Task：
- **Task 1.0**：Prisma 模型准备
- **Task 1.1**：清理硬编码 + 参数化 core 模板

### spec 文件

- `.claude/specs/add-coder-add-coder-npm-package/spec.md`
- `.claude/specs/add-coder-add-coder-npm-package/tasks.md`（第1轮）
- `.claude/specs/add-coder-add-coder-npm-package/checklist.md`（一、二、四）

### 你要改的文件（Task 1.0: 2 新建 + Task 1.1: ~70 修改）

| 文件 | 操作 | 改什么 |
|------|------|--------|
| `packages/add-coder/templates/core/prisma/add.prisma` | 新建 | DevOperation + AuditLog 模型定义 |
| `packages/add-coder/src/cli/prisma-injector.ts` | 新建 | Prisma 注入器（检测→复制→迁移→generate） |
| `templates/` 下 15 个 `.md` 模板 | 修改 | `add-coder-*` → `add-coder-*` |
| `skills/` 下 2 个 SKILL.md | 修改 | `/home/xmm/` → `/home/xmm/ai/add-coder/` |
| `scripts/mcp-server.ts` + `add-coder-mcp-server.ts` | 修改 | 数据库密码 → `process.env.DATABASE_URL` |
| `.claude/settings.json` / `.claude/mcp.json` | 修改 | 硬编码路径 → 占位符 |
| `.claude/hooks/` 下 14 个 `.sh` + `lib/` | 修改 | 项目名提取逻辑 |
| `.vscode/` 下 4 个文件 | 修改 | MCP 路径 → `/home/xmm/ai/add-coder` |
| `reports/` 下 7 个文件 | 修改 | 硬编码 → `add-coder` |
| `packages/add-coder/src/core/renderer.ts` | 新建 | 核心渲染器 |

### 关键契约

- 模板变量语法：`add-coder` 双花括号，禁止 `${var}`
- Runtime 变量：`process.env.X`，**无兜底值**，缺失时 `throw Error`
- `prisma-injector.ts`：迁移失败回滚 `add.prisma`

### 高风险误区

- 禁止在模板代码中保留 `process.env.X || "兜底值"` 反模式
- 禁止提前实现第2轮的目录迁移

### ADD-7 审计记录

| action | targetType | targetId | 说明 | 状态 |
|--------|-----------|----------|------|:--:|
| `SOURCE_CREATED` | PRISMA_SCHEMA | `templates/core/prisma/add.prisma` | DevOperation + AuditLog 模型定义 | ✅ |
| `SOURCE_CREATED` | CLI | `src/cli/prisma-injector.ts` | Prisma 注入器实现 | ✅ |
| `TEMPLATE_REFACTORED` | TEMPLATE | `templates/` 下 ~70 文件 | 硬编码清理 + 参数化 | ✅ |
| `SOURCE_CREATED` | RENDERER | `src/core/renderer.ts` | 核心渲染器 | ✅ |

**恢复关键词**：
```text
query_audit_logs({ planKeyword: "add-coder-npm-package" })
→ 返回全部本轮 ADD-7 审计记录
```

### 验证标准

#### 已完成验证

- `grep -r "farm.agent\|farm_secure_pass\|大田精准\|/home/xmm" templates/` 返回空 ✅
- `npx tsc --noEmit` 通过 ✅

#### 未执行的端到端验证

- [ ] `prisma migrate dev --schema=prisma/` 成功创建 DevOperation + AuditLog 表（原因：需要真实数据库环境）

---

## 第2轮：架构搭建

### 你当前的位置

你是第 2 轮。上游第1轮已完成 Prisma 模型准备 + 模板硬编码清理。

### 上游已完成

- `templates/core/prisma/add.prisma` 已创建
- `src/cli/prisma-injector.ts` 已实现
- `templates/` 下约 70 个文件已清理硬编码
- `src/core/renderer.ts` 已实现

### 恢复上下文审计查询（新 AI Session 首次启动必读）

```text
query_audit_logs({ planKeyword: "add-coder-npm-package" })
```
→ 返回 1 条本轮新增：TEMPLATE_REFACTORED（templates 目录重组 ~70 文件）。

```text
query_audit_logs({ targetId: "packages/add-coder/src/adapters/" })
```
→ 确认 adapter 骨架已创建。

**恢复顺序建议**：
```
1. query_audit_logs({ planKeyword: "add-coder-npm-package" })
2. read ".claude/specs/add-coder-add-coder-npm-package/tasks.md"（第2轮）
```

### 原子事务目标

将旧的扁平 `templates/` 目录迁移为 `templates/core/` + `templates/adapters/` + `templates/shared/` 三层结构，搭建 `src/adapters/` 骨架。

### spec 文件

- `.claude/specs/add-coder-add-coder-npm-package/tasks.md`（第2轮）

### 你要改的文件（22 迁移 + 4 新建）

| 旧路径 | 新路径 | 操作 |
|--------|--------|------|
| `templates/agents/` | `templates/core/agents/` | 迁移 |
| `templates/skills/` | `templates/core/skills/` | 迁移 |
| `templates/templates/*.md` (15) | `templates/core/docs/` | 迁移 |
| `templates/templates/*.schema.json` (15) | `templates/core/docs-schema/` | 迁移 |
| `templates/rules/` | `templates/core/rules/` | 迁移 |
| `templates/vocabulary/` | `templates/core/vocabulary/` | 迁移 |
| `templates/scripts/` | `templates/core/scripts/` | 迁移 |
| `templates/reports/` | `templates/core/reports/` | 迁移 |
| `templates/tools/` | `templates/core/tools/` | 迁移 |
| `templates/.claude/hooks/` | `templates/adapters/qoder/hooks/` | 迁移 |
| `templates/.claude/settings.json` | `templates/adapters/qoder/settings.json` | 迁移 |
| `templates/.claude/mcp.json` | `templates/adapters/qoder/mcp.json` | 迁移 |
| `templates/.vscode/` (4) | `templates/adapters/vscode/` | 迁移 |
| — | `templates/adapters/claude/` | 新建空壳 |
| — | `templates/shared/hooks-lib/common.sh` | 新建 |
| — | `src/adapters/{claude,qoder,vscode}/renderer.ts` | 新建骨架 |

### 关键契约

- Adapter 接口签名：`render(config: AddCoderConfig, targetDir: string, dryRun: boolean): Map<string, string>`
- 迁移完成后删除旧 `templates/` 扁平目录

### 高风险误区

- 禁止在迁移过程中修改文件内容
- 禁止提前实现第3轮的 adapter renderer 逻辑

### 验证标准

- [x] 新目录结构符合 Plan §3.2 ✅
- [x] `find templates/ -name "*.ts" | wc -l` 返回 0 ✅

---

## 第3轮：适配器实现

### 你当前的位置

你是第 3 轮。上游第2轮已完成目录重组 + 适配器骨架。

### 上游已完成

- `templates/core/` 所有模板文件已就位
- `templates/adapters/` 三端目录已创建
- Adapter 接口骨架已定义

### 恢复上下文审计查询（新 AI Session 首次启动必读）

```text
query_audit_logs({ planKeyword: "add-coder-npm-package" })
```
→ 返回 3 条本轮：claude/renderer.ts、qoder/renderer.ts、vscode/renderer.ts。afterState 含 adapter 名和关键参数（hook_matchers / no_native_hook）。

```text
query_audit_logs({ targetId: "packages/add-coder/src/adapters/claude/renderer.ts" })
```
→ 返回 1 条：hook_matchers: ["Write","Edit","Bash"]。

**恢复顺序建议**：
```
1. query_audit_logs({ planKeyword: "add-coder-npm-package" })
2. read ".claude/specs/add-coder-add-coder-npm-package/tasks.md"（第3轮）
3. read ".claude/specs/add-coder-add-coder-npm-package/checklist.md"（三）
```

### 原子事务目标

串行实现三个适配器：Claude → Qoder → VS Code。

### spec 文件

- `.claude/specs/add-coder-add-coder-npm-package/tasks.md`（第3轮）
- `.claude/specs/add-coder-add-coder-npm-package/checklist.md`（三）

### 你要改的文件（Task 3.0 Claude: 14 新建 / Task 3.1 Qoder: 3 / Task 3.2 VS Code: 3）

| 文件 | 操作 | 改什么 |
|------|------|--------|
| `templates/adapters/claude/settings.json` | 新建 | hook 配置，matcher 用标准工具名 |
| `templates/adapters/claude/mcp.json` | 新建 | Claude 格式 MCP 配置 |
| `templates/adapters/claude/hooks/` 下 12 脚本 | 新建 | 参考 Qoder，差异在 matcher |
| `src/adapters/claude/renderer.ts` | 实现 | Claude adapter 渲染器 |
| `templates/adapters/qoder/settings.json` | 修改 | matcher 双套工具名 |
| `src/adapters/qoder/renderer.ts` | 实现 | Qoder adapter 渲染器 |
| `templates/adapters/vscode/tasks.json` | 修改 | hook 模拟任务 |
| `src/adapters/vscode/renderer.ts` | 实现 | VS Code adapter 渲染器 |

### 关键契约

- Claude hooks matcher 用标准工具名（`Write`, `Edit`, `Bash`）
- Qoder hooks matcher 用双套工具名（`Write|write_to_file` 等）
- VS Code 无原生 hook，诚实声明能力边界

### 高风险误区

- 禁止在 Claude hooks 中使用 Qoder 的双套工具名 matcher
- 禁止在 VS Code adapter 中假装有 hook 能力

### 验证标准

#### 已完成验证

- `npx add-coder init --adapter claude` 生成 `.claude/` 目录 ✅
- `npx add-coder init --adapter qoder` 生成 `.claude/` 目录 ✅
- `npx add-coder init --adapter vscode` 生成 `.vscode/` 目录 ✅

---

## 第4轮：配置 + CLI

### 你当前的位置

你是第 4 轮。上游第3轮已完成三端适配器。

### 上游已完成

- Claude/Qoder/VS Code 三个 adapter 的 renderer 已实现
- 所有模板文件已就位且参数化

### 恢复上下文审计查询（新 AI Session 首次启动必读）

```text
query_audit_logs({ planKeyword: "add-coder-npm-package" })
```
→ 返回 4 条本轮：schema.ts (CONFIG)、index.ts (CLI)、init.ts (CLI)、tsup.config.ts (BUILD_CONFIG)。

```text
query_audit_logs({ targetId: "packages/add-coder/src/config/schema.ts" })
```
→ 返回 1 条：Zod schema，fields: ["projectName","sourceDir","docsDir","logDir"]。

```text
query_audit_logs({ targetId: "packages/add-coder/src/cli/commands/init.ts" })
```
→ 返回 1 条：七步流程 detect→config→prisma→core→adapter→write→summary。

**恢复顺序建议**：
```
1. query_audit_logs({ planKeyword: "add-coder-npm-package" })
2. read ".claude/specs/add-coder-add-coder-npm-package/tasks.md"（第4轮）
3. read ".claude/specs/add-coder-add-coder-npm-package/checklist.md"（五）
```

### 原子事务目标

串行：Task 4.0 配置系统（Zod schema） → Task 4.1 CLI 重写。

### spec 文件

- `.claude/specs/add-coder-add-coder-npm-package/tasks.md`（第4轮）
- `.claude/specs/add-coder-add-coder-npm-package/checklist.md`（五）

### 你要改的文件（Task 4.0: 2 新建 + Task 4.1: 10 文件）

| 文件 | 操作 | 改什么 |
|------|------|--------|
| `packages/add-coder/src/config/schema.ts` | 新建 | Zod schema `AddCoderConfig` |
| `packages/add-coder/src/config/defaults.ts` | 新建 | 默认值 |
| `packages/add-coder/src/cli/index.ts` | 新建 | commander 主入口 |
| `packages/add-coder/src/cli/commands/init.ts` | 新建 | init 命令（七步流程） |
| `packages/add-coder/src/cli/commands/sync.ts` | 新建 | sync 命令 |
| `packages/add-coder/src/cli/commands/status.ts` | 新建 | status 命令 |
| `packages/add-coder/src/cli/detect.ts` | 新建 | IDE 环境检测 |
| `packages/add-coder/src/cli/config-loader.ts` | 新建 | 配置加载 + Zod 校验 |
| `packages/add-coder/src/cli/writer.ts` | 新建 | 智能写入（四种模式） |
| `packages/add-coder/bin/add-coder.js` | 修改 | 改为加载 `dist/cli/index.js` |
| `packages/add-coder/tsup.config.ts` | 新建 | 构建配置 |
| `packages/add-coder/tsconfig.json` | 新建 | TS 编译配置 |

### 关键契约

- 配置加载优先级：交互式问答 > `add-coder.config.ts` > 自动检测 > 默认值
- Writer 四种模式：交互 / `--yes` / `--force` / `--dry-run`
- `--force` 和 `--yes` 互斥

### 高风险误区

- 禁止在 CLI 中硬编码路径

### 验证标准

#### 已完成验证

- `npx add-coder init` 在空白项目中零配置生成完整 ADD 模板 ✅
- `tsc --noEmit` 通过 ✅

---

## 第5轮：测试 + 发布

### 你当前的位置

你是第 5 轮。上游第1-4轮全部完成。

### 上游已完成

- Prisma 模型 + 硬编码清理
- 模板目录重组 + 三端适配器
- 配置系统 + CLI 重写

### 恢复上下文审计查询（新 AI Session 首次启动必读）

```text
query_audit_logs({ planKeyword: "add-coder-npm-package" })
```
→ 返回 2 条本轮：package.json (MODIFY) / bin/add-coder.js (MODIFY)。

```text
query_audit_logs({ targetId: "packages/add-coder/package.json" })
```
→ 返回 1 条：private→false, type→module, engines: node>=20, exports 多入口, scripts 含 generate。

**恢复顺序建议**：
```
1. query_audit_logs({ planKeyword: "add-coder-npm-package" })
2. read ".claude/specs/add-coder-add-coder-npm-package/tasks.md"（第5轮）
3. read ".claude/specs/add-coder-add-coder-npm-package/checklist.md"（五、六、八）
```

### 原子事务目标

集成测试 + 文档 + 发布配置，前 4 轮收敛后的验证合流。

### spec 文件

- `.claude/specs/add-coder-add-coder-npm-package/tasks.md`（第5轮）
- `.claude/specs/add-coder-add-coder-npm-package/checklist.md`（五、六、八）

### 你要改的文件（6 文件）

| 文件 | 操作 | 改什么 |
|------|------|--------|
| `packages/add-coder/tests/` | 新建 | 单元测试 + 集成测试 |
| `packages/add-coder/README.md` | 修改 | 完整使用文档 |
| `packages/add-coder/package.json` | 修改 | `"private": false`, `"type": "module"`, `"exports"` 多入口 |

### 关键契约

- `"exports"` 多入口（`.`、`./config`、`./renderer`、`./adapters/*`）
- `npm pack` 产出包含 `dist/` + `templates/` + `bin/`，不包含 `src/`

### 高风险误区

- 禁止在 README 中暗示 `npm install` 就能拿到完整 ADD 运行时

### 验证标准

#### 已完成验证

- `npx tsc --noEmit` 通过 ✅
- `grep -r "process.env.*||" dist/` 返回空 ✅
- `"private": false`, `"type": "module"`, `"exports"` 多入口 ✅

#### 未执行的端到端验证

- [ ] `npm pack` 产出正确（原因：需 npm registry 或本地 pack 验证）
- [ ] `npm pack` 后 `npm install` 在空白项目中 `npx add-coder init` 端到端通过（原因：需隔离环境）

---

## 第6轮：裁决层

### 你当前的位置

你是第 6 轮。上游第1-5轮全部完成。

### 上游已完成

- Prisma 模型 + 硬编码清理
- 模板目录重组 + 三端适配器
- 配置系统 + CLI 重写
- 集成测试 + 文档 + 发布配置

### 恢复上下文审计查询（新 AI Session 首次启动必读）

```text
query_audit_logs({ planKeyword: "add-coder-npm-package" })
```
→ 返回 6 条本轮：caijue.toml (CAIJUE_CONFIG) / caijue.ts (CAIJUE_CONFIG) / transcribe.ts (CAIJUE_CONFIG) / detect.strategy.ts (STRATEGY) / prisma.strategy.ts (STRATEGY) + 3 条 cli 薄包装重构。afterState 含 GENERATED+USER CODE 区块描述。

```text
query_audit_logs({ targetId: "packages/add-coder/src/caijuehub/caijue.toml" })
```
→ 返回 1 条：策略索引，entries: ["detect-ide","resolve-adapters","prisma-inject","write-files"]。

```text
query_audit_logs({ targetId: "packages/add-coder/src/caijuehub/transcribe.ts" })
```
→ 返回 1 条：转录引擎，generators: ["genDetectRules","genAdapterRules","genPrismaRules","genWriterRules"]。

```text
query_audit_logs({ targetId: "packages/add-coder/src/cli/detect.ts" })
```
→ 返回 1 条 MODIFY：硬编码 26 行 → 薄包装 9 行，调 detect.strategy.ts。

**恢复顺序建议**：
```
1. query_audit_logs({ planKeyword: "add-coder-npm-package" })
2. read ".claude/specs/add-coder-add-coder-npm-package/tasks.md"（第6轮）
3. read ".claude/specs/add-coder-add-coder-npm-package/checklist.md"（七）
4. 执行 npm run generate 确保 GENERATED 区块最新
```

### 原子事务目标

- **Task 6.0**：CaijueHub 核心 — `caijue.toml` 索引 + `caijue.ts` 加载器 + `transcribe.ts` 转录引擎
- **Task 6.1**：策略文件搬迁 — 每个策略文件含 GENERATED 区块（transcribe 产出规则数据）和 USER CODE 区块（手写业务逻辑）

### spec 文件

- `.claude/specs/add-coder-add-coder-npm-package/spec.md`（Requirement: CaijueHub 裁决层）
- `.claude/specs/add-coder-add-coder-npm-package/tasks.md`（第6轮）
- `.claude/specs/add-coder-add-coder-npm-package/checklist.md`（七）

### 你要改的文件（~16 个）

| 文件 | 操作 | 改什么 |
|------|------|--------|
| `src/caijuehub/caijue.toml` | 新建 | 策略索引 |
| `src/caijuehub/caijue.ts` | 新建 | TOML 索引加载器 |
| `src/caijuehub/transcribe.ts` | 新建 | 转录引擎 |
| `src/caijuehub/*-rules.toml` (4) | 新建 | 规则参数声明 |
| `src/caijuehub/strategies/*.strategy.ts` (4) | 新建 | GENERATED + USER CODE 双区块 |
| `src/cli/detect.ts` | 修改 | 薄包装 → 调 strategy |
| `src/cli/prisma-injector.ts` | 修改 | 薄包装 → 调 strategy |
| `src/cli/writer.ts` | 修改 | 薄包装 → 调 strategy |
| `src/cli/index.ts` | 修改 | 新增 `generate` 命令 |
| `package.json` | 修改 | 新增 `npm run generate` 脚本 |

### 核心设计

```
caijue.toml（索引）          *-rules.toml（规则参数）      strategies/*.ts
─────────────────           ────────────────────        ┌──────────────────┐
[[caijue]]                  detect-rules.toml    →      │ GENERATED (转录)  │
  rules = "detect-rules"    prisma-rules.toml    →      │ DETECT_RULES=[]   │
  impl = "strategies/..."   adapter-rules.toml   →      │ PRISMA_CONFIG={}   │
                            writer-rules.toml    →      ├──────────────────┤
                                                        │ USER CODE (手写)   │
转录流程：                                                 │ detectIDE()       │
npm run generate → transcribe.ts → GENERATED 区块         │ injectPrisma()    │
                                                         └──────────────────┘
```

### 关键契约

- `caijue.toml` 只做索引，不耦合规则逻辑
- `*-rules.toml` 定义规则参数，由 `transcribe.ts` 产出 GENERATED 区块
- USER CODE 区块手写业务逻辑，`npm run generate` 不覆盖
- 修改规则后：`npm run generate` → `tsup` → 行为生效

### 高风险误区

- 禁止在 `caijue.toml` 中耦合规则逻辑
- 禁止 `transcribe.ts` 包含业务函数体（只产出规则数据）
- 策略文件的 GENERATED 和 USER CODE 必须用标记隔离，`npm run generate` 不可覆盖 USER CODE

### ADD-7 审计记录

| action | targetType | targetId | 说明 | 状态 |
|--------|-----------|----------|------|:--:|
| `SOURCE_CREATED` | CAIJUE_CONFIG | `src/caijuehub/caijue.toml` | 策略索引 | ✅ |
| `SOURCE_CREATED` | CAIJUE_CONFIG | `src/caijuehub/caijue.ts` | 索引加载器 | ✅ |
| `SOURCE_CREATED` | CAIJUE_CONFIG | `src/caijuehub/transcribe.ts` | 转录引擎 | ✅ |
| `SOURCE_CREATED` | STRATEGY | `src/caijuehub/strategies/detect.strategy.ts` | GENERATED+USER CODE | ✅ |
| `SOURCE_MODIFIED` | STRATEGY | `src/caijuehub/strategies/prisma.strategy.ts` | GENERATED+USER CODE | ✅ |
| `SOURCE_MODIFIED` | CLI | `src/cli/detect.ts` | 薄包装重构 | ✅ |
| `SOURCE_MODIFIED` | CLI | `src/cli/prisma-injector.ts` | 薄包装重构 | ✅ |
| `SOURCE_MODIFIED` | CLI | `src/cli/writer.ts` | 薄包装重构 | ✅ |

### 验证标准

#### 已完成验证

- `npm run generate` 产出 4 策略文件，GENERATED + USER CODE 双区块无误 ✅
- `tsup` 构建通过 ✅
- `add-coder init --dry-run` 三端正确 ✅
- `grep -r "farm.agent\|大田\|/home/xmm" templates/` 返回空 ✅
- `tsc --noEmit` 通过 ✅

---

## 每轮收敛判定补充规则

> 以下规则与 `add-paradigm` SKILL Step 8 收敛条件并列。

### checklist 证据要求

- [x] 全部项已勾选（不得空勾选）
- [x] 每项勾选有可验证证据
- [x] 未执行项诚实保留为 `- [ ]`，注明"待后续运行时验证"

### tasks 证据要求

- [x] 全部任务已完成（tasks.md 中全部 `- [x]`）
- [x] 每个任务有对应的 checklist 项覆盖

### 收敛声明规则

当前轮次 AI 不得自行声明"本轮已收敛"。收敛声明只能由开发者或 Review AI 做出。

---

## §7 实际产出与偏离

| 项 | 计划 | 实际 | 偏离说明 |
|------|------|------|------|
| 轮次数 | 5 轮 | 6 轮 | 新增第6轮 CaijueHub 裁决层 |
| 模板目录结构 | `templates/core/` + `adapters/` | 一致 | 无 |
| 适配器 | Claude/Qoder/VS Code | 一致 | 无 |
| caijue.toml | 无 | 索引注册 4 个策略 | 新增 |
| transcribe.ts | 无 | GENERATED 区块产出引擎 | 新增 |
| 策略文件 | 无 | GENERATED+USER CODE 双区块模式 | 新增 |
| 模板部署策略 | 仅 `.add/` | `.claude/` `.claude/` 同时部署 core 内容 | IDE 只认自身 magic path，需三者各自完整 |
| `templates/core/prisma/` | add.prisma 模板 | 删除，由 injectPrisma 直接处理 | Prisma 文件不应在 `.add/` 下 |
| plans/specs 示例 | 无 | `templates/core/plans/` `specs/` 含 add-coder 示例 | 用户首次 init 即可看到完整 ADD 文档样例 |
| 三目录部署 | 仅 `.add/` | Plan 已设计，`renderCore()` 改造待执行 | 见 Plan §3.2 改造待执行清单 |
| Review v2 回流 | 无 | `.claude/reviews/add-coder-add-coder-npm-package-review-v2.md` | 代码实现评审：2 条 P0（spawnSync catch 失能、ask 重复定义）在 Plan §4.8 回流，P0-1 已补充至 Task 1.0 验收项 |

## §8 验证结果

| 检查项 | 结果 | 证据 |
|------|:--:|------|
| `tsup` 构建 | ✅ | ESM 构建成功 |
| `tsc --noEmit` | ✅ | 零类型错误 |
| `init` 默认模式 | ✅ | Core 50 文件 |
| `init --adapter claude/qoder/vscode` | ✅ | 三端正确 |
| `add-coder generate` | ✅ | 4 策略全部产出 |
| 模板硬编码清零 | ✅ | `grep -r` 返回空 |
| `add-coder --help` | ✅ | 4 命令可见 |

## §9 后置确认

- [x] tasks.md 全部 6 轮 11 Task 已完成
- [x] checklist.md 全部可验证项已勾选
- [x] `grep -r "farm.agent\|大田\|/home/xmm" templates/` 返回空
- [ ] `npm pack` → `npm install` 端到端（待运行时验证）
- [x] ADD-7 `query_audit_logs` 回查确认 — 共 20 条记录，覆盖 6 轮全部关键文件
- [x] Review v2 P0-1（spawnSync catch 失能）已记录至 Plan 并补充验收项
- [ ] Review v2 P0-2（ask 重复定义）待第6轮 CaijueHub 重构时提取到 utils
- [ ] Review v2 P1-1（unlinkSync 缺口）、P1-2/3（gitignore）待 CI 基建清单补充

---

## 附录：每轮启动模板

新对话开始时，直接把下面内容 + 对应轮次章节粘贴给 LLM：

```text
## 上下文

你在执行 add-coder npm 包工程化的 [第N轮]。
上游 [第1轮~第N-1轮] 已完成。
先读 .claude/plans/2026-07/08/add-coder-add-coder-npm-package-handoff-v1.md 的 <第N轮> 章节。

## 启动步骤（按顺序）

1. 执行 session-init SKILL
2. 执行 add-paradigm SKILL
3. 读 .claude/specs/add-coder-add-coder-npm-package/spec.md
4. 读 .claude/specs/add-coder-add-coder-npm-package/tasks.md（第N轮）
5. 读 .claude/specs/add-coder-add-coder-npm-package/checklist.md
6. 按 tasks.md 顺序执行代码修改
7. 每完成一个 Task：读 checklist.md → 逐项验证 → 附证据 → 勾选
8. 每完成一个文件修改：record_dev_operation 写入 ADD-7 审计
9. 全部代码完成后：query_audit_logs 按 planKeyword 回查确认落库

## 关键提醒

- 当前执行的是 [第N轮]/6
- 当前轮次是一个原子工程事务，不允许拆到下一轮补齐
- handoff 是入口索引；具体实现以 spec/tasks/checklist 为准
- 禁止自行声明收敛
- 禁止提前实现下一轮的核心内容
```

---

### 脱敏要求

Handoff 文档中 **禁止出现** 以下类型的硬编码值：
- 数据库密码（`POSTGRES_PASSWORD`）
- Chroma auth token（`CHROMA_AUTH_TOKEN`）
- JWT 密钥（`JWT_SECRET`）
- API Key（`OPENAI_API_KEY_*`）

所有凭据值应通过 `${ENV_VAR}` 引用，并标注"值见 `.env.development` / `.env.production`"。