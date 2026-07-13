# add-coder

**AI 代码治理的落地方案** — [codein2027](https://github.com/xiaomingming92/codein2027) 快速构建 ADD 编程范式的完整脚手架。以「审计即基础设施」为核心，彻底打破编程过程黑盒与跨轮失忆，让编程范式进化为可审计、可追溯、可收敛的新时代。[本项目github地址](https://github.com/xiaomingming92/add-coder),[本项目NPM包地址](https://www.npmjs.com/package/add-coder)

```bash
npx add-coder init
```

---

## 这不是模板工具，这是架构差异

市面上已有大量 AI 编程模板、hook 适配器、MCP 脚手架。add-coder 与它们的根本区别不在「生成什么文件」，而在 **架构层面的范式转换**：

### ① 审计是基础设施，而非事后日志

传统 AI 开发：对话 → 生成代码 → 事后翻聊天记录找「谁改了什么」

| 传统模式 | add-coder |
|---------|----------|
| 日志是 append-only 文本文件 | 审计是 **结构化数据表**（DevOperation + AuditLog），支持按 plan/step/agent/tool 多维查询 |
| 审计靠开发者自觉记录 | **MCP 审计工具链** 自动记录每次操作，系统闸门强制检查 |
| 无关联性 | 审计事件天然关联 Plan → Spec → Task → Step → Tool Call，形成完整证据链 |

### ② 门禁驱动，而非自由对话

传统 AI coding 是「你说我做」，质量完全依赖 LLM 当天状态。add-coder 在架构中嵌入了 **双质量闸门**：

```
DPS (Design-Process Symmetry)  — 设计/实现/文档/审计 四维各 25%，< 85% BLOCKED
RAHS (Runtime Architecture Health Score) — 运行时架构健康度，< 90% BLOCKED
```

这不是「建议」，是**架构阻断** — 不通过闸门的 Step 无法推进到下一步。

### ③ 跨轮记忆，而非每轮失忆

AI 对话的致命缺陷：上次讨论的架构决策、已修复的 Bug、达成的约定，下轮对话全部遗忘。add-coder 在架构层面解决：

- **Handoff 文档** — 每轮 Session 结束时自动生成结构化交接文档，下轮会话自动加载
- **Plan 索引** — 所有 Plan 通过 `index.md` 集中索引，支持模糊匹配快速定位
- **DevLog 时序记录** — 每一步操作写入 `{YYYY-MM}/{DD}/` 时间轴，可回溯任意历史状态

### ④ Policy-Update-Loop：治理自我进化

不是静态模板，而是**闭环自适应系统**：

```
执行 → 审计 → 边界报告 → 规则调整 → 下一轮执行
```

运行时产生的 Report 会反过来更新 governance rules，实现治理策略的持续进化。

### ⑤ 多 IDE 的 Hook 即治理层

hook 不是「通知推送」，而是 **IDE 运行时拦截层**：

| Hook 类型 | 作用 |
|----------|------|
| PreToolUse | 工具调用前校验白名单、注入上下文、DPS 条件检查 |
| PostToolUse | 自动审计记录、Plan 同步检测、格式守卫 |
| PreCompact | 跨轮上下文压缩时强制保留关键文档路径 |
| PromptSubmit | 注入 ADD 词汇表触发词，确保 LLM 对「验收」「门禁」等命令零延迟响应 |

每个 IDE（Claude/Qoder/VS Code）有各自的 hook 实现，但**治理逻辑统一** — 架构一致，适配层不同。

---

## 快速开始

```bash
npx add-coder init
```

首次 init 自动检测 IDE，交互式引导完成 Prisma 初始化、User 模型注入、ADD 模板部署。

### 完整初始化流程

```bash
# ① 首次执行（自动：prisma init + User 模型 + add.prisma + 模板部署）
npx add-coder init
# → 是否执行 prisma init？[Y/n] y
# → 已将 DATABASE_URL 迁移到 .env.development
# → 已注入 User 模型
# → 已复制 add.prisma
# → Core 模板: 55 文件 + adapter 模板已就位

# ② 编辑 .env.development 配置数据库连接串
DATABASE_URL="postgresql://user:pass@localhost:5432/mydb?schema=public"

# ③ 第二次执行（自动：prisma migrate + generate）
npx add-coder init --yes
# → prisma migrate dev（创建 DevOperation + AuditLog 表）
# → prisma generate
# → ADD 治理模型已就绪 ✓
```

> **环境文件优先级**：`.env.development.local` > `.env.development` > `.env.local` > `.env`

## 命令

| 命令 | 说明 |
|------|------|
| `init` | 初始化 ADD 模板，支持 `--adapter claude\|qoder\|vscode\|auto` |
| `sync` | 增量同步缺失文件 |
| `status` | 检查模板完整性 |

### init 内部流程

| 步骤 | 动作 | 说明 |
|------|------|------|
| ① | 检测 IDE | 扫描 `.qoder/` `.claude/` `.vscode/` 存在性，或通过 `--adapter` 指定 |
| ② | 加载配置 | 交互式问答 > `add-coder.config.ts` > 自动检测 > 默认值 |
| ③ | Prisma 注入 | 检测 Prisma → 引导安装 → 注入 User 模型 → 复制 `add.prisma` → 迁移 |
| ④ | 渲染模板 | 55 个 core 模板文件（skills/agents/templates/plans/specs/scripts…） |
| ⑤ | 部署适配 | 将 core 内容复制到 `.add/` `.qoder/` `.claude/` 三目录，补 IDE 专属 hooks/mcp |
| ⑥ | 写入文件 | 交互/yes/force/dry-run 四种模式，`.sh` 脚本自动 `chmod` |
| ⑦ | 输出摘要 | 新建/跳过/覆盖统计 + 下一步提示 |

### init 选项

| 选项 | 说明 |
|------|------|
| `--adapter <type>` | 目标 IDE：claude / qoder / vscode / auto（默认） |
| `--config <path>` | 指定配置文件 |
| `--yes` | 跳过交互，只创建新文件 |
| `--force` | 覆盖已有文件 |
| `--dry-run` | 预览模式，不写入 |

## 生成内容

| 目录 | 内容 |
|------|------|
| `.add/` | ADD 共享核心（skills、agents、docs、scripts、rules 等） |
| `.claude/` | Claude Code 适配（hooks、settings.json） |
| `.qoder/` | Qoder 适配（hooks、settings.json、mcp.json） |
| `.vscode/` | VS Code 适配（settings.json、tasks.json） |

## MCP 审计工具链

`init` 自动部署 MCP 服务器 (`mcp-server.ts`) 到项目中，IDE 通过 `mcp.json` 加载。提供以下审计与治理工具：

| 工具 | 用途 | 触发场景 |
|------|------|---------|
| `record_dev_operation` | 记录开发操作审计（before/after/reason） | 每次文件变更、配置修改 |
| `query_audit_logs` | 按 planKeyword / targetId 查询审计记录 | 跨会话恢复上下文、验证迭代证据 |
| `get_project_context` | 获取 ADD 工作流状态快照 | 空白对话开局 |
| `get_db_schema` | 获取 Prisma schema 信息 | 数据库相关操作 |
| `check_dps` | DPS 闸门（设计/实现/文档/审计 四维各 25%） | Step 0 末尾 |
| `check_rahs` | RAHS 闸门（运行时架构健康度） | Step 4/8 |
| `check_add_route_status` | add-route 文件存在性校验 | Step 3 前 |
| `check_spec_sync` | Spec 文档勾选状态与代码一致性 | Spec 执行后 |
| `find_related_docs` | 检索相关架构/规范文档 | 语境理解 |

> 完整工具列表见 [MCP 工具链规范](https://github.com/xiaomingming92/codein2027/blob/main/docs/大田精准耕播智能决策系统/knowledge/02-规范/%E3%80%8A%E5%BC%80%E5%8F%91%E6%93%8D%E4%BD%9C%E5%AE%A1%E8%AE%A1%E5%AD%98%E6%A1%A3%E8%A7%84%E8%8C%83%E3%80%8B.md)。

## 架构全景

```
                    ┌─────────────┐
                    │  ADD 范式    │
                    │  Step 0-9    │
                    └──────┬──────┘
                           │ 门禁驱动
              ┌────────────┼────────────┐
              ▼            ▼            ▼
       ┌──────────┐ ┌──────────┐ ┌──────────┐
       │ DPS 闸门 │ │ RAHS 闸门│ │合规检查  │
       └────┬─────┘ └────┬─────┘ └────┬─────┘
            │            │            │
              ▼            ▼            ▼
       ┌─────────────────────────────────────┐
       │         审计基础设施层                │
       │  DevOperation / AuditLog 表           │
       │  MCP 审计工具链                       │
       │  Handoff / DevLog 时序文档            │
       └─────────────────────────────────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
       ┌──────────┐ ┌──────────┐ ┌──────────┐
       │ Claude   │ │  Qoder   │ │  VS Code │
       │ Hooks    │ │  Hooks   │ │  Config  │
       └──────────┘ └──────────┘ └──────────┘
                           │
              ┌────────────┘
              ▼
       ┌─────────────────────────────────────┐
       │     Caijuehub 规则引擎               │
       │  TOML 驱动的策略体系                 │
       │  检测/适配/Prisma/写入 全可配置       │
       └─────────────────────────────────────┘
```

## 前置条件

- Node.js >= 20
- Prisma >= 6.9 / ^7.0（`init` 时自动检测，无则引导安装）
- PostgreSQL（MCP 工具链依赖 DevOperation + AuditLog 表）

> **推荐**：使用 Podman/Docker 运行 PostgreSQL，参考配置：
> ```yaml
> postgres:
>   image: docker.io/postgres:16-alpine
>   ports: ["127.0.0.1:5433:5432"]
>   environment:
>     POSTGRES_DB: mydb
>     POSTGRES_USER: admin
>     POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
> ```
> 数据卷建议挂载到 `~/data/your_project/postgres/`，避免容器销毁丢失数据。
