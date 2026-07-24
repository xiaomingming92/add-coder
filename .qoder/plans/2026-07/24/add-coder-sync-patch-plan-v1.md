# add-coder-sync-patch-plan-v1

> **Plan/Spec 边界提醒**：Plan 回答"改什么、为什么改、改哪里"——写到让 Review 能判断方向对不对、有没有遗漏维度的程度。

## PLAN 元信息

- **Plan 名称**: add-coder-sync-patch-v1
- **启动时间**: 2026-07-24T10:00:00+08:00
- **主导 AI**: Qoder
- **关联文档**:
  - ADD Route: `.qoder/plans/2026-07/24/add-coder-sync-patch-add-route-v1.md`
  - Handoff: `.qoder/plans/2026-07/24/add-coder-sync-patch-handoff-v1.md`
  - Review: `.qoder/reviews/add-coder-sync-patch-review-v1.md`

---

## HITL 计划总览（一次性提交人类审核）

| 维度 | 内容 | 人类决策 |
|------|------|:---:|
| 影响模块 | `scripts/gen-src-hash.js`（新建）、`package.json`（prepare）、`src/cli/commands/sync.ts`（核心）、`src/cli/commands/init.ts`（hash 写入）、`src/cli/index.ts`（CLI 入口） | |
| 预估文件数 | 新建 1 + 修改 4 = 5 文件 | |
| 架构变更 | ① 新增双 hash 机制：源 hash（prepare 打 npm）→ 产出 hash（init/patch 记用户）→ 两维判断（用户改没改 × 源变没变）② sync 新增 `--patch` ③ 默认行为不变 | |
| 新增依赖 | 无（Node.js 内置 `crypto` + `fs`） | |
| 风险等级 | 🟡中 — 源 hash 遗漏模板文件导致 patch 漏更新；产出 hash 丢失回退到全量 conflict | |
| 预计轮次 | 1 轮 | |

### 文件清单

| # | 文件 | 操作 | 内容 |
|---|------|:---:|------|
| 1 | `scripts/gen-src-hash.js` | 新建 | 扫描 `templates/` 生成源 hash → `templates/.add-coder-src-hash.json` |
| 2 | `package.json` | 修改 | `prepare` 脚本追加 `node scripts/gen-src-hash.js` |
| 3 | `src/cli/commands/sync.ts` | 修改 | patch 参数 + PATCH_GUARD + 双 hash 对比 + 两维分组 + selectFiles |
| 4 | `src/cli/commands/init.ts` | 修改 | 渲染后写入 `.qoder/.add-coder-hash.json`（产出 hash） |
| 5 | `src/cli/index.ts` | 修改 | sync 命令新增 `--patch` option |

> **人类确认后**：AI 在下方展开完整 Plan 设计。

---

## 一、背景与目标

### 1.1 问题现状

升级 add-coder 后用户项目模板停留在旧版本。现有 `sync` 只能补缺——对已有文件无效，且无法区分"用户改过的文件"和"add-coder 更新的同名文件"。

### 1.2 目标

```bash
npx add-coder sync --adapter=qoder --patch
```

- add-coder **build 时**算好源模板 hash，随 npm 包发布
- init / patch **写入后**记录产出 hash 到用户项目
- `--patch` 时两维判断：用户改没改（产出 hash 对比）× 源变没变（源 hash 对比）→ 自动覆盖 / 交互选择 / 跳过
- PATCH_GUARD 永远不碰 plans/specs/reviews

---

## 二、方案选型

| 方案 | 描述 | 判定 |
|------|------|:---:|
| A: `init --force` 后手动恢复 | 三步操作 | ❌ |
| B: sync `--patch` 无 hash | 全量交互 | ❌ 更新量大时手酸 |
| C: sync `--patch` + 单 hash（产出端） | 只比用户有没有改 | ❌ 分不清用户改了还是 add-coder 更新了 |
| **D: sync `--patch` + 双 hash（源 + 产出）** | 源 hash 在 build 时算好打 npm，产出 hash 在 init/patch 时记用户 | ✅ 两维精准判断 |

---

## 三、架构设计

### 3.1 双 hash 职责

| Hash | 算什么 | 何时算 | 存哪里 | 随着什么走 |
|------|--------|--------|--------|-----------|
| 源 hash | `templates/core/` + `templates/adapters/` 源文件 | `prepare`（每次 build） | `templates/.add-coder-src-hash.json` | npm 包 |
| 产出 hash | 渲染后写入用户项目的文件内容 | `init` / `sync --patch` 写入后 | `.qoder/.add-coder-hash.json` | 用户项目 |

### 3.2 两维判断矩阵

```
对每个候选文件:

① 当前用户文件 hash  vs  产出 hash 表中记录  →  "用户改过没"
② 当前模板源文件 hash  vs  源 hash 表中记录    →  "源变了没"

┌────────┬──────────────────────┬──────────────────────┐
│        │     源模板没变        │      源模板变了        │
├────────┼──────────────────────┼──────────────────────┤
│用户没改│  same — 跳过          │  auto — 静默覆盖      │
│用户改了│  skip — 不碰（尊重）   │  conflict — 交互勾选  │
└────────┴──────────────────────┴──────────────────────┘
```

| 场景 | 判定 | 行为 |
|------|------|------|
| add-coder 新版改了 `doc-format-guard.sh`，用户没改 | 用户没改 + 源变了 → **auto** | 静默覆盖 |
| add-coder 没动 `doc-format-guard.sh`，用户改了 | 用户改了 + 源没变 → **skip** | 不碰 |
| add-coder 新版改了 + 用户也改了 | 用户改了 + 源变了 → **conflict** | 交互勾选 |
| 两边都没改 | 用户没改 + 源没变 → **same** | 跳过 |
| 文件不存在 | — → **missing** | 静默写入 |

### 3.3 数据流转

```
prepare（build 时，仅 add-coder 开发者）
  └─ gen-src-hash.js 扫描 templates/ → templates/.add-coder-src-hash.json
       │
       └─ npm publish → 随包发布
              │
              ▼
npx add-coder init（用户侧）
  ├─ renderCore() + renderAdapter() → 写入文件
  └─ 对每个写入的文件算 hash → `.qoder/.add-coder-hash.json`

npx add-coder sync --patch
  ├─ renderCore() + renderAdapter() → allFiles
  ├─ PATCH_GUARD 过滤
  ├─ 读源 hash（npm 包内） + 产出 hash（用户项目内）
  ├─ 两维判断 → auto / conflict / missing / same / skip
  ├─ auto + missing → writeFiles() 静默
  ├─ conflict → selectFiles() 交互
  └─ 更新产出 hash
```

### 3.4 PATCH_GUARD 正则

```typescript
const PATCH_GUARD = [
    /[/]plans[/]/,
    /[/]specs[/]/,
    /[/]reviews[/]/,
];
```

### 3.5 回退策略

| 场景 | 行为 |
|------|------|
| 源 hash 文件不存在（npm 包损坏） | 全部进 conflict（安全兜底）。selectFiles 已支持 `[a]` 全部跳过 / `[A]` 全部覆盖 [回流: Review P2 #1 源hash缺失回退] |
| 产出 hash 文件不存在（首次 patch / 文件丢失） | 全部视作用户没改过 → auto。首次 init 即写 hash，不会出现此状态 [回流: Review P2 #2 产出hash缺失回退] |
| 单个文件不在源 hash 表中 | 不在模板范围内 → 跳过 |

### 3.6 selectFiles 复用

`src/lib/select-files.ts`（142 行，已生产使用）：勾选列表 + diff 行数 + 键盘操作。不改动。

---

## 四、实施 Task + 依赖图

```
轮次 1: gen-src-hash + sync.ts + init.ts + index.ts + package.json（5 文件）
│
├── Task 1.1: gen-src-hash.js — 扫描 templates/ 生成源 hash
├── Task 1.2: package.json — prepare 追加 gen-src-hash
├── Task 1.3: init.ts — 渲染后写入产出 hash
├── Task 1.4: sync.ts — patch 参数 + 双 hash 对比 + 两维分组 + selectFiles
└── Task 1.5: index.ts — sync 命令加 --patch option
        │
        ▼
    构建 + weather_proxy 实测
```

### 轮次 1: 核心逻辑

| # | Task | 文件 | 验收 |
|---|------|------|------|
| 1.1 | 扫描 `templates/core/` + `templates/adapters/`，遍历所有文件，计算 SHA256 前 8 位 hex，写 JSON | `scripts/gen-src-hash.js` | `node scripts/gen-src-hash.js` 生成 hash 文件 |
| 1.2 | `"prepare": "tsup && node scripts/gen-src-hash.js"` | `package.json` | `pnpm build` 后 hash 文件存在 |
| 1.3 | 渲染后对每个写入文件 `hash(content)`，写 `.qoder/.add-coder-hash.json` | `init.ts` | `npx add-coder init` 后 hash 文件存在 |
| 1.4.1 | 定义 `PATCH_GUARD` + `computeHash()` + `loadHashFile()` / `saveHashFile()` | `sync.ts` | 单元函数可测 |
| 1.4.2 | 读源 hash → 读产出 hash → 两维判断矩阵 → 五路分组 | `sync.ts` | 矩阵六场景覆盖 |
| 1.4.3 | auto + missing → 以 force 模式调用 writeFiles 覆盖写入 | `sync.ts` | 日志区分新建/覆盖 |
| 1.4.4 | conflict → `selectFiles()` | `sync.ts` | 用户可选，取消则跳过 |
| 1.4.5 | 写入后更新产出 hash | `sync.ts` | hash 文件内容正确 |
| 1.4.6 | 默认模式行为不变 | `sync.ts` | 无 `--patch` 保持原逻辑 |
| 1.5 | `--patch` option | `index.ts` | `npx add-coder sync --help` 可见 |

---

## 五、验收标准

- [ ] `pnpm build` 后 `templates/.add-coder-src-hash.json` 存在，含所有模板源文件的 hash
- [ ] `npx add-coder init` 后 `.qoder/.add-coder-hash.json` 存在，含所有渲染产出的 hash
- [ ] `sync --patch` hash 矩阵六场景正确（auto/same/skip/conflict/missing 判定）
- [ ] add-coder 更新的文件 + 用户没改 → 静默覆盖（auto）
- [ ] add-coder 没动 + 用户改了 → 跳过（skip）
- [ ] 两边都改了 → 交互勾选（conflict）
- [ ] PATCH_GUARD 保护 plans/ specs/ reviews/
- [ ] 默认 `sync` 行为不变
- [ ] `npx tsc --noEmit` 通过
- [ ] weather_proxy 实测通过

---

## 六、关联文档

| 文档 | 路径 |
|------|------|
| ADD Route | `.qoder/plans/2026-07/24/add-coder-sync-patch-add-route-v1.md` |
| Handoff | `.qoder/plans/2026-07/24/add-coder-sync-patch-handoff-v1.md` |
| Review | `.qoder/reviews/add-coder-sync-patch-review-v1.md` |
| 前置 Plan | `.qoder/plans/2026-07/23/add-coder-selfhost-sync-plan-v1.md` |
