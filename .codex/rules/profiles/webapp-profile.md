# webapp-profile — Web 应用技术栈约束

> 由 add-coder 分发，可通过 `add-coder stack set webapp` 启用/切换。
> 本 profile 为 ADD 案例研究（前端/全栈 Web 应用）沉淀的技术栈约束，从 project_rules.md 迁移而来。
> 启用后，AI 必须遵守本文件中全部约束；未启用时本文件不构成约束。

## 数据库 Schema

Prisma schema 修改时：
- 新增模型必须有审计数据字段（Json 类型）
- 关联关系必须定义 `onDelete: Cascade`
- 使用 `@id @default(cuid())` 生成 ID
- 使用 `@updatedAt` 自动更新时间戳

## Agent 节点

LangGraph 节点实现时：
- 必须通过 `wrapNodeWithAudit` 包装
- `inputSnapshot` 不能为空对象 `{}`
- 路由决策必须调用 `agentAuditRoute()`
- 检索节点必须记录证据链 diff

## 代码质量

- TypeScript 编译必须通过（`npx tsc --noEmit`）
- ESLint 零 error（`npx eslint src/` 不得出现 error 级别问题，warning 逐步降低）
- 禁止 `any` 类型（必须显式定义）
- 禁止简化代码实现，一切以代码高质量为衡量标准
- 新增文件必须在项目已有目录结构内，遵循现有命名规范

## 附录 A

### A. add-coder ADD-0.3 实现（AuditCallback）

add-coder 通过 **LangChain `BaseCallbackHandler` 继承模式** 实现自动审计：

- `AuditCallback extends BaseCallbackHandler` — 继承 LangChain 标准回调接口
- `handleChainStart()` / `handleChainEnd()` / `handleChainError()` — 节点进入/退出/异常自动记录
- `handleLLMEnd()` — LLM 调用完成时记录 token 用量
- `handleToolStart()` / `handleToolEnd()` — Tool 调用完成时记录输入/输出

注入方式（`src/agents/index.ts`）：
```typescript
const callback = new AuditCallback(traceId, userId)
agent.invoke(input, { callbacks: [callback] })
```

**与 Layer 1 dev-logger 的关系**：
- Layer 1（`wrapNodeWithAudit`）：console + file，仅开发环境，AI 助手消费
- Layer 2（`AuditCallback`）：AuditLog 表，所有环境始终开启，最终用户消费
- 两者共存互补，互不干扰

**设计目标达成情况**：

| 目标 | 状态 |
|------|:----:|
| 自动记录 | ✅ |
| 不阻塞响应 | ✅ |
| 成功/失败等价 | ✅ |
| 节点过滤 | ✅ |
| traceId 全链追踪 | ✅ |
