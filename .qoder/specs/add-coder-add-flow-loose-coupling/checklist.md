# Checklist: add-coder-add-flow-loose-coupling

## 一、编译与 Lint 门禁

- [ ] [T] post-tool-use.sh 语法检查通过 — 证据: `bash -n`
- [ ] [T] pre-tool-use.sh 语法检查通过 — 证据: `bash -n`

## ADD 规则合规检查

- [ ] [E] post-tool-use 不阻断写入（exit 0，仅 stderr 注入）
- [ ] [E] pre-tool-use 不阻断写入（exit 0，仅 stderr 注入）
- [ ] [E] DPS 自动哨兵逻辑正确（≥80 建, <80 不建）
- [ ] [E] plan_track MCP 调用失败不阻断 hook

## 功能验证

- [ ] [R] DPS ≥ 80 后哨兵文件出现
- [ ] [R] DPS < 80 时无哨兵 + stderr 有 Review 提示
- [ ] [R] specs/ 写入后 plan_track 被调用
- [ ] [R] add-route Step 8 全 [x] 后 stderr 有 devlog 提醒
- [ ] [R] Guardian 可走 plan_status 获取 addRoutePath
- [ ] [R] check_spec_sync 调用更快（无 tasks/checklist 扫描）
