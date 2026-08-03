# Checklist: add-coder-dps-threshold-render

> **证据规范**：每项 [x] 必须附带可验证证据。不得空勾选、不得推测通过。
> - `[T]` = 编译期验证 — 证据: 命令+结果（如 `tsc=0`）
> - `[R]` = 运行时验证 — 证据: 部署后确认（如 `pnpm run sync` 后 grep 结果）
> - `[E]` = 静态检查 — 证据: grep/diff 输出
>
> **审计链（证据→devlog→checklist）**:
> - 初验规则: 先找证据（命令+结果）→ 调 `record_dev_operation` 落库 → 将返回的真实 cuid 写入 checklist。**禁止抄写 `cmq...` 占位符**。
> - 复验规则: 先查 checklist 是否已有真实审计 ID → 重新验证证据 → 证据一致则不复写 devlog，不一致则追写新 devlog（新 cuid）

---

## 一、编译与 Lint 门禁 [T]

- [x] [T] `pnpm exec tsc --noEmit` 零新增错误（renderer.ts 改动后） — 证据: 存量 14 错误不变（stash 前后对比），renderer 无新错误|审计: cmsdr0xgu000qswwrn9p630pz
- [x] [T] `pnpm run build` 成功（tsup，分发前置） — 证据: `DTS ⚡️ Build success in 1588ms`|审计: cmsdr0xgu000qswwrn9p630pz

## 二、renderer 占位符注入（Task 1.1）[T]/[E]

- [x] [E] renderer.ts 含 `{{dpsPass}}`/`{{dpsWarn}}` 替换逻辑 — 证据: `grep -n "dpsPass" src/core/renderer.ts` 命中 loadDpsThresholds/render|审计: cmsdr0xgu000qswwrn9p630pz
- [x] [E] 无 `[display]` 段新增（P1-1 合规） — 证据: `grep -c "\[display\]" src/caijuehub/dps-scoring-rules.toml` = 0|审计: cmsdr0xgu000qswwrn9p630pz
- [x] [T] transcribe.ts 未改动（P1-1） — 证据: `git diff --stat src/caijuehub/transcribe.ts` 空|审计: cmsdr0xgu000qswwrn9p630pz
- [x] [E] TOML 缺失时占位符保持原样 + 警告（不静默注入 0） — 证据: loadDpsThresholds try/catch 返回 null 时 render 不替换|审计: cmsdr0xgu000qswwrn9p630pz

## 三、check_dps description 动态化（Task 1.2）[E]

- [x] [E] description 含 `${CFG.THRESHOLD_PASS}` 模板串 — 证据: `grep -n "THRESHOLD_PASS" templates/core/scripts/mcp-server/tools/gateway/check_dps.ts` 命中模板串|审计: cmsdr0xgu000qswwrn9p630pz
- [x] [E] 判定逻辑分支未改动 — 证据: `git diff` 仅 description 行|审计: cmsdr0xgu000qswwrn9p630pz

## 四、模板占位符化（Task 1.3）[E]

- [x] [E] templates/ 内 "≥ 85"/">= 85" 归零（豁免除外） — 证据: `grep -rn "≥ 85\|>= 85" templates/` 仅剩豁免 3 处|审计: cmsdr0xgu000qswwrn9p630pz
- [x] [E] 24 处替换完成（core 14 + adapters 10） — 证据: `grep -rn "dpsPass" templates/` 覆盖 18 文件 24 处|审计: cmsdr0xgu000qswwrn9p630pz
- [x] [E] RAHS ≥ 90 未触碰（范围外） — 证据: templates 中 RAHS ≥ 90 表述不变|审计: cmsdr0xgu000qswwrn9p630pz

## 五、同步验证（Task 1.4）[R]

- [x] [R] `pnpm run sync` 后全部 magic 目录（.qoder/.claude/.vscode）grep "≥ 85" 归零 — 证据: sync 后仅剩历史计划与描述性引用|审计: cmsdr0xgu000qswwrn9p630pz
- [x] [R] `{{dpsPass}}` 在渲染副本中已替换为 "80" — 证据: tsx 直跑 render：dpsPass→80、dpsWarn→65|审计: cmsdr0xgu000qswwrn9p630pz

## 六、豁免边界（Task 1.5）[E]

- [x] [E] gateway.backup 未改未删 — 证据: `ls templates/core/scripts/mcp-server/tools/gateway.backup` 存在且含 "≥ 85"|审计: cmsdr0xgu000qswwrn9p630pz
- [x] [E] 模板内历史 add-route 未改未删 — 证据: 文件存在且含 "≥ 85" ×2|审计: cmsdr0xgu000qswwrn9p630pz
- [x] [E] 豁免清单已写入 add-route 边界 — 证据: add-route Step 3 边界段|审计: cmsdr0xgu000qswwrn9p630pz

## 七、文档声明式（Task 2.1）[E]

- [x] [E] README 中英 2 处声明式 — 证据: `grep -n "dps-scoring-rules.toml" README.md` 命中 2 处|审计: cmsdr0xgu000qswwrn9p630pz
- [x] [E] GUIDE 2 处声明式 — 证据: `grep -n "dps-scoring-rules.toml" GUIDE.md` 命中 2 处|审计: cmsdr0xgu000qswwrn9p630pz
- [x] [E] docs/caijuehub.md 2 处声明式（L103 + 示例） — 证据: `grep -n "dps-scoring-rules.toml" docs/caijuehub.md` 命中|审计: cmsdr0xgu000qswwrn9p630pz

## 八、分发验证（Task 2.2）[R]

- [x] [R] gen-src-hash 更新（270 文件含新 hash） — 证据: `pnpm exec tsx scripts/gen-src-hash.ts` 输出 270 files|审计: cmsdr0xgu000qswwrn9p630pz
- [x] [R] 用户项目 `sync --adapter=qoder --patch` 后副本正确（≥ 80 渲染值） — 证据: weather_proxy 副本 vocabulary/guardian 显示 ≥ 80|审计: cmsdr0xgu000qswwrn9p630pz

## 九、全链归零（Task 2.3）[E]

- [x] [E] grep "85" 仅剩豁免清单（gateway.backup、历史 add-route、.qoder 历史计划） — 证据: 全仓 grep 仅剩 5 处描述性引用 + 豁免 3 处|审计: cmsdr0xgu000qswwrn9p630pz

## 十、缺陷记录（Task 2.4）[E]

- [x] [E] plan.ts `.hitl` 过滤缺陷已记录（独立任务） — 证据: Plan §五 风险表已记录（P2-4，本轮不动）|审计: cmsdr0xgu000qswwrn9p630pz

## ADD 规则合规检查

- [x] [E] ADD-7：每文件修改已记录 record_dev_operation — 证据: `query_audit_logs({ planKeyword: "add-coder-dps-threshold-render" })` 命中（cmsdr0xgu000qswwrn9p630pz）|审计: cmsdr0xgu000qswwrn9p630pz
- [x] [E] 真源原则合规（只改 templates/ 真源，副本经 sync） — 证据: `git diff --stat` 路径均在真源（src/caijuehub + templates + 文档）|审计: cmsdr0xgu000qswwrn9p630pz
- [x] [E] 边界合规（豁免清单未触碰） — 证据: gateway.backup/历史 add-route 未改未删|审计: cmsdr0xgu000qswwrn9p630pz
- [x] [E] Plan/Spec 一致性 — 证据: DPS 89 PASS（映射 6/6 锚定 + 延续性 0.696）|审计: cmsdr0xgu000qswwrn9p630pz
