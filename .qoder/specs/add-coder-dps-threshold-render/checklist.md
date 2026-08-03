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

- [ ] [T] `pnpm exec tsc --noEmit` 零错误（renderer.ts 改动后） — 证据: (待填写)|审计: (待填写)
- [ ] [T] `pnpm run build` 成功（tsup，分发前置） — 证据: (待填写)|审计: (待填写)

## 二、renderer 占位符注入（Task 1.1）[T]/[E]

- [ ] [E] renderer.ts 含 `{{dpsPass}}`/`{{dpsWarn}}` 替换逻辑 — 证据: `grep -n "dpsPass" src/core/renderer.ts`|审计: (待填写)
- [ ] [E] 无 `[display]` 段新增（P1-1 合规） — 证据: `grep -c "\[display\]" src/caijuehub/dps-scoring-rules.toml` = 0|审计: (待填写)
- [ ] [T] transcribe.ts 未改动（P1-1） — 证据: `git diff --stat src/caijuehub/transcribe.ts` 空|审计: (待填写)
- [ ] [E] TOML 缺失时占位符保持原样 + 警告（不静默注入 0） — 证据: 实现含 fallback 分支|审计: (待填写)

## 三、check_dps description 动态化（Task 1.2）[E]

- [ ] [E] description 含 `${CFG.THRESHOLD_PASS}` 模板串 — 证据: `grep -n "THRESHOLD_PASS" templates/core/scripts/mcp-server/tools/gateway/check_dps.ts`|审计: (待填写)
- [ ] [E] 判定逻辑分支未改动 — 证据: `git diff` 仅 description 行|审计: (待填写)

## 四、模板占位符化（Task 1.3）[E]

- [ ] [E] templates/ 内 "≥ 85"/">= 85" 归零（豁免除外） — 证据: `grep -rn "≥ 85\|>= 85" templates/` 仅豁免清单|审计: (待填写)
- [ ] [E] 28 处替换完成（core 14 + adapters 10） — 证据: `grep -rn "dpsPass" templates/` 覆盖 28 处|审计: (待填写)
- [ ] [E] RAHS ≥ 90 未触碰（范围外） — 证据: `grep -c "RAHS ≥ 90" templates/` 不变|审计: (待填写)

## 五、同步验证（Task 1.4）[R]

- [ ] [R] `pnpm run sync` 后全部 magic 目录（.qoder/.claude/.vscode）grep "≥ 85" 归零 — 证据: 命令输出|审计: (待填写)
- [ ] [R] `{{dpsPass}}` 在渲染副本中已替换为 "80" — 证据: `grep -rn "dpsPass" .qoder/` 归零 + 渲染值为 80|审计: (待填写)

## 六、豁免边界（Task 1.5）[E]

- [ ] [E] gateway.backup 未改未删 — 证据: `ls templates/core/scripts/mcp-server/tools/gateway.backup` 存在|审计: (待填写)
- [ ] [E] 模板内历史 add-route 未改未删 — 证据: 文件存在且含 "≥ 85"|审计: (待填写)
- [ ] [E] 豁免清单已写入 add-route 边界 — 证据: add-route Step 3 边界段|审计: (待填写)

## 七、文档声明式（Task 2.1）[E]

- [ ] [E] README 中英 2 处声明式 — 证据: `grep -n "dps-scoring-rules.toml" README.md`|审计: (待填写)
- [ ] [E] GUIDE 2 处声明式 — 证据: `grep -n "dps-scoring-rules.toml" GUIDE.md`|审计: (待填写)
- [ ] [E] docs/caijuehub.md 1 处声明式 — 证据: `grep -n "dps-scoring-rules.toml" docs/caijuehub.md`|审计: (待填写)

## 八、分发验证（Task 2.2）[R]

- [ ] [R] gen-src-hash 更新（266 文件含新 hash） — 证据: `pnpm exec tsx scripts/gen-src-hash.ts` 输出|审计: (待填写)
- [ ] [R] 用户项目 `sync --adapter=qoder --patch` 后副本正确（≥ 80 渲染值） — 证据: 用户项目 grep|审计: (待填写)

## 九、全链归零（Task 2.3）[E]

- [ ] [E] grep "85" 仅剩豁免清单（gateway.backup、历史 add-route、.qoder 历史计划） — 证据: `grep -rn "85" templates/ src/ README.md GUIDE.md docs/` 输出|审计: (待填写)

## 十、缺陷记录（Task 2.4）[E]

- [ ] [E] plan.ts `.hitl` 过滤缺陷已记录（独立任务） — 证据: 记录于 add-route 边界|审计: (待填写)

## ADD 规则合规检查

- [ ] [E] ADD-7：每文件修改已记录 record_dev_operation — 证据: `query_audit_logs({ planKeyword: "add-coder-dps-threshold-render" })`|审计: (待填写)
- [ ] [E] 真源原则合规（只改 templates/ 真源，副本经 sync） — 证据: `git diff --stat` 路径均在真源|审计: (待填写)
- [ ] [E] 边界合规（豁免清单未触碰） — 证据: Task 1.5 项|审计: (待填写)
- [ ] [E] Plan/Spec 一致性 — 证据: `check_spec_sync` 结果|审计: (待填写)
