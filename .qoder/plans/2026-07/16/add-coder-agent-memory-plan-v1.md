# add-coder-agent-memory-plan-v1

> 在 add-coder 治理层实现 ADD Memory 系统，后续集成到 farm-agent。

**创建时间**: 2026-07-16T15:00:00+08:00
**主导 AI**: Qoder

---

## 一、Plan 概述

- **现状**: ADD 治理层仅有 Handoff（Plan 级交接），缺少跨 Plan 的长期项目知识记忆。对话中积累的架构决策、踩坑经验、对话熵值、代码质量变化全部丢失。
- **目标**: 在 add-coder 治理体系中构建 Memory 层——Prisma 数据库模型 + MCP 工具 + ADD Hook 集成，贯穿 Plan→Spec→Gate→Handoff 全流程。
- **核心原则**: 
  1. PG 用户用 pgvector（零额外基础设施），SQLite 用户用 SQLite-Vec（嵌入式，零依赖）
  2. 不同 Chroma——add-coder init 不需要多部署一个容器
  3. 记忆表 `AddMemory` 与现有 `DevOperation` / `AuditLog` 平级，共享 Prisma 管理

### 1.1 Handoff vs Memory

| | Handoff | Memory |
|---|---|---|
| 粒度 | Plan 一份 | 项目全局 |
| 存什么 | 做了什么、任务状态 | 知道了什么、为什么 |
| 写入触发 | Step 8 收敛 | Plan→Spec→Gate→Handoff 全流程 |
| 检索 | session-init 稀疏加载 | pgvector 语义 + 关键词混合 |

### 1.2 向量后端双模式

| 数据库 | 向量方案 | 部署代价 |
|--------|---------|---------|
| PostgreSQL | `CREATE EXTENSION vector`（pgvector） | 零，PG 已运行 |
| SQLite | SQLite-Vec 嵌入式扩展 | 零，~2MB 编译进二进制 |

---

## 二、架构设计

### 2.1 数据模型（Prisma）

```prisma
enum MemoryPhase {
  PLAN_CREATE
  SPEC_DESIGN
  DPS_GATE
  CODE_IMPLEMENT
  RAHS_GATE
  HANDOFF_CLOSE
  MANUAL
}

enum MemoryCategory {
  ARCH_DECISION
  PITFALL
  CODING_STYLE
  CODE_QUALITY
  ENTROPY_LOG
  FILE_QUALITY
  BUG_ROOT_CAUSE
  CONVENTION
}

model AddMemory {
  id           String         @id @default(cuid())
  planKeyword  String?
  handoffRef   String?
  phase        MemoryPhase
  category     MemoryCategory
  topic        String
  content      String
  entropy      Float?
  codeQuality  Float?
  metadata     Json?
  createdAt    DateTime       @default(now())
  updatedAt    DateTime       @updatedAt

  @@index([planKeyword])
  @@index([handoffRef])
  @@index([phase])
  @@index([category])
}
```

pgvector 列由 SQL migration 单独创建（Prisma 不原生支持 vector 类型）：
```sql
CREATE EXTENSION IF NOT EXISTS vector;
ALTER TABLE "AddMemory" ADD COLUMN IF NOT EXISTS embedding vector(384);
```

SQLite 用户用 SQLite-Vec 扩展，mcp-server.ts 中检测 dialect 自动选择路径。

### 2.2 MCP 工具

| 工具 | 参数 | 逻辑 |
|------|------|------|
| `append_memory` | topic, content, category, phase, planKeyword?, handoffRef?, entropy?, codeQuality? | 写入 PG/SQLite + 向量 |
| `search_memory` | keyword, category?, topK? | 关键词 + 语义混合召回 |
| `read_memory` | planKeyword?, category?, limit? | 按条件读取 |
| `link_memory_to_handoff` | handoffRef, memoryIds[] | 关联记忆到 Handoff |
| `get_memory_stats` | planKeyword? | 熵值趋势、质量变化 |

### 2.3 混合检索

```
search_memory(keyword)
  ├── PG: WHERE content ILIKE '%keyword%'  → 关键词候选
  ├── PG: ORDER BY embedding <-> query_vec → 语义候选
  └── 合并去重 + 按 score 排序 → 返回 topK
```

embedding 模型用 `all-MiniLM-L6-v2`（384 维，本地运行，无需 API key）。

---

## 三、ADD 全流程集成

### ❶ 触发词

`.qoder/vocabulary/add-governance-vocabulary.md` 新增：

| 触发词 | 行为 |
|--------|------|
| `记忆` / `之前` / `上次` | LLM 调用 `search_memory` |
| `记住` / `记录下` | LLM 调用 `append_memory` |

### ❷ Hook 集成

| Hook | 动作 |
|------|------|
| `PromptSubmit` | 注入 RAG 指令："先检索相关记忆再回复" |
| `PostToolUse` | write 后检测 → 提示是否值得记 |
| `session-init` | L1 核心记忆 + L2 向量检索 |

### ❸ Plan 制定 → append_memory

Step 0 `create_plan` 后自动记录：
```text
append_memory({ phase: PLAN_CREATE, category: ARCH_DECISION, topic: "Plan 制定: {planKeyword}", ... })
```

### ❹ Spec 制定 → append_memory

Step 3 `check_spec_sync` 通过后自动记录。

### ❺ DPS 门禁 → 熵值 + 文件质量

`check_dps` 返回结果后自动记录：
```text
append_memory({ phase: DPS_GATE, entropy: 0.42, topic: "DPS 门禁通过", content: "得分: 92/100..." })
```

### ❻ RAHS 门禁 → 回流熵值 + 代码质量

`check_rahs` 返回结果后自动记录：
```text
append_memory({ phase: RAHS_GATE, entropy: 0.28, codeQuality: 0.85, ... })
```

### ❼ Handoff ↔ Memory 关联

Step 8 devlog 收尾：
```
① handoff 生成 → search_memory({ planKeyword }) 检索关联记忆
② link_memory_to_handoff({ handoffRef, memoryIds })
③ 下次 session-init → 通过 handoffRef 反向查记忆
```

---

## 四、Tasks

```
轮次 1: 数据模型
  ├── Task 1.1: Prisma schema 新增枚举 + AddMemory 模型
  └── Task 1.2: PG: pgvector extension migration / SQLite: SQLite-Vec 集成

轮次 2: MCP 工具
  ├── Task 2.1: append_memory（PG 写入 + embedding）
  ├── Task 2.2: search_memory（关键词 + 向量混合召回）
  ├── Task 2.3: read_memory / get_memory_stats
  └── Task 2.4: link_memory_to_handoff

轮次 3: Hook 集成
  ├── Task 3.1: PromptSubmit 注入 memory RAG
  ├── Task 3.2: PostToolUse 记忆写入检测
  ├── Task 3.3: session-init L1+L2 加载
  └── Task 3.4: 触发词词汇表更新

轮次 4: ADD 门禁集成
  ├── Task 4.1: check_dps 后收集熵值
  ├── Task 4.2: check_rahs 后收集代码质量
  └── Task 4.3: devlog 后 handoff-memory 关联
```

### 轮次 1: 数据模型

| # | 任务 | 文件 | 说明 | 验收 |
|---|------|------|------|------|
| 1.1 | 新增模型 | `prisma/schema.prisma` | MemoryPhase、MemoryCategory 枚举 + AddMemory 表 | `prisma migrate dev` |
| 1.2 | 向量扩展 | migration | PG: pgvector extension + embedding 列 / SQLite: SQLite-Vec | 向量列可读写 |

### 轮次 2: MCP 核心工具

| # | 任务 | 文件 | 说明 | 验收 |
|---|------|------|------|------|
| 2.1 | append_memory | `src/mcp/memory-tools.ts` | PG/SQLite 写入 + embedding | 工具返回成功 |
| 2.2 | search_memory | 同上 | 混合检索 | 召回率 > 80% |
| 2.3 | read/stats | 同上 | 读取 + 统计 | 返回值正确 |
| 2.4 | link | 同上 | 关联 handoff | SQL 验证 |

### 轮次 3: Hook 集成

| # | 任务 | 文件 | 说明 | 验收 |
|---|------|------|------|------|
| 3.1 | PromptSubmit | `prompt-submit.sh` | RAG 注入 | LLM 自动检索 |
| 3.2 | PostToolUse | `post-tool-use.sh` | 写后检测 | 日志可验证 |
| 3.3 | session-init | vocabulary | L1+L2 | 新对话加载 |
| 3.4 | 词汇表 | vocabulary | 触发词 | 触发 LLM 调用 |

### 轮次 4: ADD 门禁集成

| # | 任务 | 文件 | 说明 | 验收 |
|---|------|------|------|------|
| 4.1 | DPS | `check_dps` | 记录熵值 | memory 表有 DPS_GATE |
| 4.2 | RAHS | `check_rahs` | 记录质量 | memory 表有 RAHS_GATE |
| 4.3 | devlog | `record_dev_operation` | handoff 关联 | link 可验证 |

---

## 五、Handoff

### 5.1 交接前状态

add-coder 治理层已有 Prisma 模型（AddUser、DevOperation、AuditLog）、MCP 工具链（20+ 工具）、Hook 体系（PromptSubmit/PostToolUse/PreToolUse）。

### 5.2 交接后状态

- 新增 `AddMemory` 模型（PG: +pgvector / SQLite: +SQLite-Vec）
- 新增 `src/mcp/memory-tools.ts`（5 个 memory 工具）
- Hook 三层集成
- ADD 门禁自动收集记忆

### 5.3 改动清单

| # | 文件 | 操作 |
|---|------|------|
| 1 | `prisma/schema.prisma` | 新增 MemoryPhase、MemoryCategory 枚举 + AddMemory 表 |
| 2 | `prisma/migrations/*_pgvector.sql` | PG vector extension + embedding 列 |
| 3 | `src/mcp/memory-tools.ts` | 新增 5 个 memory MCP 工具 |
| 4 | `templates/core/scripts/db-ensure.sh` | PG 用户自动启用 pgvector |
| 5 | `templates/core/hooks/prompt-submit.sh` | 注入 memory RAG |
| 6 | `templates/core/hooks/post-tool-use.sh` | 记忆写入检测 |
| 7 | `templates/core/vocabulary/*.md` | 触发词更新 |

### 5.4 后置确认

- [ ] `npx prisma migrate dev` 通过（PG + pgvector 正常）
- [ ] `npx tsc --noEmit` 通过
- [ ] 5 个 memory MCP 工具均可调用
- [ ] PG 向量检索可用 / SQLite 向量检索可用
- [ ] Handoff ↔ Memory 关联链路验证通过

---

## 六、验收标准

- [ ] Prisma schema 含完整 AddMemory 模型，PG/SQLite 均可 migrate
- [ ] append/search/read/link/stats 五工具正常
- [ ] 混合检索召回率 > 80%
- [ ] session-init 自动加载 L1 + L2 记忆
- [ ] check_dps / check_rahs 后自动记录记忆
- [ ] devlog 后 handoff 与 memory 正确关联

---

## 七、关联

| 类型 | 路径 |
|------|------|
| Handoff | 见本文第五部分 |
| Review | `.qoder/reviews/add-coder-agent-memory-review-v1.md` |
| Prisma Schema | `prisma/schema.prisma` |
| MCP | `src/mcp/memory-tools.ts` |
