# add-coder-hook-notify-upgrade-review-v1

## Review 元信息
- Review 对象: `.qoder/plans/2026-07/24/add-coder-hook-notify-upgrade-plan-v1.md`
- Review 范围: Hook 通知机制升级方案评审
- Review 时间: 2026-07-24
- Review 类型: 方案选型 + 架构设计
- 前置阅读: add-route, Specs 三元组

## 1. 总体结论
方向正确。jsonl + fs.watch + record_dev_operation 三层架构兼顾 hook 宕机容错和数据持久化。方案 C 选型合理。

## 2. 正向评价
- ✅ 方案 C 选型正确：bash 原生 + 零依赖
- ✅ Plan 关联设计正确：detect_active_add + planKeyword/planStatus
- ✅ 不变约束清晰：exit 2 不改、无新增依赖
- ✅ 兼容性：所有 adapter hooks 统一替换模式，|| true 保证向后兼容

## 3. 问题清单
| # | 严重度 | 类别 | 问题 | 建议 |
|---|:---:|------|------|------|
| 1 | 🟡 中 | 性能影响 | fs.watch 回调中 record_dev_operation 是异步 DB 写，可能积压 | 用内存队列 + 批量写入 | ✅ 同意 |
| 2 | 🟡 中 | 安全/权限 | jsonl 写 ~28 个 hook 同时 append，竞态条件 | printf >> 原子性保证单行不截断；jsonl 行级解析容错交叠行；MCP 端按 ts 去重防重复落库 | ✅ 同意（三层保险） |
| 3 | 🟢 低 | 存储/索引成本 | DevOperation 表新增 HOOK_INTERCEPT 类型，查询性能 | 对 planKeyword 建索引 | ✅ 同意 |

## 4. 影响评估
无破坏性变更。向后兼容（source + || true 保证静默失败）。影响范围限定 hook 脚本 + MCP notifications 模块。

## 5. 建议修正优先级
- 高: #1 性能积压
- 中: #2 竞态条件
- 低: #3 存储索引

## 6. 最终建议
可进入 Step 1，从轮次 1 开始。建议轮次 3 后验证 fs.watch 回调延迟。
