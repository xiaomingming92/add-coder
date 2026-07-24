# add-coder-selfhost-sync-plan-v1

> Plan 回答"改什么、为什么改、改哪里"，不写实现细节。

## PLAN 元信息

- Plan 名称: add-coder-selfhost-sync-v1
- 启动时间: 2026-07-23
- 主导 AI: Qoder
- ADD-7 审计策略:

| 文件 | targetType | action | beforeState | afterState | 状态 |
|-----|-----------|--------|------------|-----------|------|
| scripts/sync-magic-dirs.sh | SCRIPT | CREATE | 无 | 按源→目标映射同步 | 待实施 |
| .add/hooks/ | HOOK | MODIFY | 手工维护 | 同步自 core | 待实施 |
| .claude/hooks/ | HOOK | MODIFY | 手工维护 | 同步自 adapters/claude | 待实施 |
| .qoder/hooks/ | HOOK | MODIFY | 手工维护 | 同步自 adapters/qoder | 待实施 |
| .vscode/hooks/ | HOOK | MODIFY | 手工维护 | 同步自 adapters/vscode | 待实施 |
| templates/adapters/codex/hooks/ | HOOK | MODIFY | 可能过时 | 同步自 core | 待实施 |
| templates/adapters/trae/hooks/ | HOOK | MODIFY | 可能过时 | 同步自 core | 待实施 |

---

## 一、背景与目标

### 1.1 问题现状

add-coder 自身 4 个运行时适配器目录（.add/.claude/.qoder/.vscode），每个含 hooks/~15 文件、lib/~7 文件、templates/~20 文件。这些与 `templates/core/` 完全一致但独立存放。

每次改动需手动同步 5 处（core + 4 dir），频繁遗漏。今天 doc-format-guard.sh 的 schema 修复在 7 处中多次漏掉，simple-plan-template.schema.json 同样。

### 1.2 目标

修改一处，所有 magic dir 自动生效。消灭手动同步遗漏。

---

## 二、方案选型

| 方案 | 实现 | 改动 | 风险 | 结论 |
|------|------|------|------|------|
| A: 软链接 | hooks/templates → templates/core/ | 小 | init 产出需特殊处理 | 备选 |
| B: sync 脚本 | add-coder sync 一键复制 | 中 | 低 | ✅ |
| C: init 自举 | add-coder init --self | 中 | 低 | 可叠加 |

选型：**B** 改动最小、不破坏 init、立即可用。

---

## 三、架构设计

### 3.1 源→目标映射

每个适配器有自己的维护源，运行时目录从源同步：

```
源（唯一真相）                      目标（运行时，sync 自动对齐）
──────────────────────────────    ─────────────────────────────
templates/adapters/claude/hooks/ → .claude/hooks/
templates/adapters/qoder/hooks/  → .qoder/hooks/
templates/adapters/vscode/hooks/ → .vscode/hooks/
templates/core/hooks/            → .add/hooks/         （.add 无自有 hooks）
templates/core/templates/        → .add/.claude/.qoder/.vscode/templates/
templates/core/hooks/            → adapters/codex/hooks/ （从 core 派生）
templates/core/hooks/            → adapters/trae/hooks/  （从 core 派生）
```

### 3.2 开发流程

```
修改 templates/adapters/qoder/hooks/xxx.sh
  → npm run sync
  → .qoder/hooks/xxx.sh 自动对齐
  → 重启 IDE，hook 生效
```

---

## 四、实施 Task

| # | 任务 | 文件 | 验收 |
|---|------|------|------|
| 1.1 | sync 脚本 | scripts/sync-magic-dirs.sh（新建） | 执行后 4 dir 与 core 零差异 |
| 1.2 | npm script | package.json +"sync" | npm run sync 可用 |
| 1.3 | 回归验证 | 运行 sync | diff -r 全绿 |

---

## 五、验收标准

- [ ] npm run sync 后，7 对源→目标全部零差异
- [ ] adapter 独有文件（mcp.json/settings.json/plans/等）未被覆盖
- [ ] 改 adapters/qoder/hooks/ + sync → .qoder/hooks/ 同步生效
- [ ] 改 core/templates/ + sync → 4 dir 的 templates/ 同步生效

---

## 六、关联文档

| 文档 | 路径 |
|------|------|
| sync 脚本 | scripts/sync-magic-dirs.sh |
| 核心模板 | templates/core/ |

---

*Plan v1 | 2026-07-23 | planKeyword: add-coder-selfhost-sync*
