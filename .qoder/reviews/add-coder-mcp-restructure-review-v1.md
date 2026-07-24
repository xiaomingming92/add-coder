# add-coder-mcp-restructure-review-v1

## Review 元信息
- Review 对象: `.qoder/plans/2026-07/23/add-coder-mcp-restructure-plan-v1.md`
- Review 范围: MCP 六能力架构重构方案评审
- Review 时间: 2026-07-23
- Review 类型: 方案选型 + 架构设计评审
- 前置阅读: add-route, Specs 三元组

## 1. 总体结论
方向正确——从单文件 3467 行重构为六能力模块化架构，方案选型合理。轮次设计遵循 ADD 注意力原则（串行合并）。

## 2. 正向评价
- ✅ 方案选型正确：四能力全覆盖方案 C
- ✅ shared 层设计可复用
- ✅ 不变约束清晰：mcp.json 路径不变
- ✅ Resources URI 设计完整（6 个端点）

## 3. 问题清单
| # | 严重度 | 类别 | 问题 | 建议 |
|---|:---:|------|------|------|
| 1 | 🟡 中 | 性能影响 | 26 个新文件增加模块加载开销，需评估 tsc 编译时间 | 轮次 3 后 benchmark tsc 耗时，对比重构前 |
| 2 | 🟡 中 | 存储/索引成本 | `tasks/store.ts` 新增 DB 表，需确认 migration 策略 | 使用已有 DevOperation 表或新建 TaskResult 表 |
| 3 | 🟢 低 | 兼容性 | 入口路径不变是约束，但需验证所有 IDE 的 mcp.json 格式一致 | 覆盖 Qoder/Claude/VS Code 三端 dry-run |

## 4. 影响评估
本次为纯架构重构，不修改 17 工具行为，不引入外部依赖。影响范围限定在 `templates/core/scripts/` 目录。

## 5. 建议修正优先级
- 高: 无 P0 问题
- 中: #1 性能基准、#2 存储策略
- 低: #3 多 IDE 验证

## 6. 最终建议
可进入 Step 1，建议轮次 3 后执行 tsc benchmark，轮次 6 前确定 tasks 存储方案。
