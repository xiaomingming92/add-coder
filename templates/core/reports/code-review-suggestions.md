# {{projectName}} 项目代码审查建议

## 1. 重复的 LLM 模块

`src/lib/llm.ts` 和 `src/lib/llm/index.ts` 两个文件同时存在，功能重叠。旧版 `llm.ts` 使用 `globalForLLM` 模式 + IIFE 的 `llmWithTools`，新版 `index.ts` 使用 `AuditedLLM` 包装类 + 延迟初始化。`agents/index.ts` 实际引用的是 `@/lib/llm/index`，旧文件成了死代码，建议删除避免混淆。

## 2. LLM 单例存在竞态条件

`src/lib/llm/index.ts` 中 `setLLMConfig()` 会调用 `resetLLM()` 将 `llmInstance` 置为 `null`，而 `getLLM()` 在 `null` 时会重建。如果两个并发请求携带不同的 `modelConfig`，A 请求的重置可能影响 B 请求正在使用的实例。建议改为按请求/线程隔离的 LLM 实例，或使用请求级缓存。

## 3. 大量 `as any` 类型断言

`src/agents/index.ts` 中存在大量 `as any`、`as unknown as` 类型断言，特别是消息类型转换（如 `state.messages as unknown as Array<Record<string, unknown>>`）、toolResults 赋值（`toolResults: toolResults as any`）等。这些绕过了 TypeScript 类型检查，建议逐步用类型守卫或 zod schema 替代。

## 4. QWeather JWT 签名是占位符

`src/lib/farm-server-client.ts` 第 71 行的 `createQWeatherJwt()` 函数中，EdDSA 签名写死了 `"PLACEHOLDER_SIGNATURE"`。注释说"实际迁移 co-agent 天气工具时会携带完整的 JWT 签名实现"，说明这是未完成的功能，生产环境会导致认证失败。

## 5. 审计日志静默吞错

`src/lib/agent-audit-logger.ts` 中 `writeAuditLog()` 的 catch 块只做了 `console.error`，`ensureLogDir()` 的 catch 完全忽略。这意味着当 DB 不可用时，所有审计记录会静默丢失，没有告警机制。建议至少增加一个失败计数器或 metric 上报。

## 6. JWT 硬编码默认密钥

`src/lib/auth.ts` 第 4 行 `JWT_SECRET = process.env.JWT_SECRET || "dev-secret-key"`。在生产环境中如果忘记设置环境变量，会使用可预测的默认密钥，存在安全风险。建议在生产环境强制要求配置，缺失时直接拒绝启动。

## 7. `activeTracers` Map 潜在内存泄漏

`src/agents/index.ts` 第 239 行 `activeTracers` Map 的清理依赖 `endChainTrace()` 被调用。如果流式请求异常中断（客户端断开），`endChainTrace` 可能不会被调用，导致 Map 持续增长。建议增加 TTL 过期机制或定期清理。

## 8. 缺少请求体校验

`src/app/api/agent/chat/route.ts` 直接用 `await request.json()` 后做类型断言，没有用 Zod 或类似库做运行时校验。如果客户端发送了格式错误的请求体，错误会在深层抛出不友好的异常。

## 9. 脚本目录过于庞大（50+ 脚本）

`scripts/` 目录下有 50+ 个脚本，包含大量一次性迁移脚本（如 `backfill-projectId.ts`、`fix-knowledge-data.js`、`restore-from-dump.js`），还有 Windows `.bat` 和 Unix `.sh` 双份。建议将一次性脚本归档到单独目录，减少维护负担。

## 10. 大文件职责混杂

`src/agents/index.ts`（468 行）同时包含了：StateGraph 定义、ToolNode 包装器、审计包装器 `wrapNodeWithAudit`、`runAgent`/`streamAgent` 入口、Tracer 管理、`buildPartialState`。建议拆分为多个文件：

- `graph.ts` — 图定义
- `tool-node-wrapper.ts` — ToolNode 包装器
- `audit-wrapper.ts` — 审计包装器
- `agent-runner.ts` — runAgent/streamAgent 入口

## 11. Chroma 端口未绑定 localhost

`docker-compose.yml` 中 Chroma 端口映射为 `"8000:8000"`，没有绑定到 `127.0.0.1`，而 PostgreSQL 是 `"127.0.0.1:5433:5432"`。如果部署在公网机器上，Chroma 的 8000 端口会暴露在外，建议统一绑定到 `127.0.0.1`。

## 12. Docker Compose 中资源限制被注释

`docker-compose.yml` 中 PostgreSQL 和 Chroma 的 `deploy.resources` 全部被注释掉了。在生产环境中没有资源限制，某个服务 OOM 可能影响整个宿主机。建议根据实际负载启用 resource limits。

## 13. `pnpm-lock.yaml` 和 `package-lock.json` 同时存在

项目根目录同时存在 `pnpm-lock.yaml` 和 `package-lock.json`，说明可能在 npm 和 pnpm 之间切换过。建议统一使用一种包管理器，删除另一个 lock 文件。

## 14. Model config 切换使用 `require()` 动态加载

`src/lib/llm/index.ts` 第 246-247 行使用 `require("@/lib/model-config-logger")` 动态加载，这在 ESM 环境下可能不稳定。注释 `// Logger unavailable in server context` 也说明这有已知问题。建议改为静态 import 或明确的依赖注入。

## 15. Prisma 多文件 Schema 路径不一致

`schema.prisma` 注释说子文件在 `prisma/schema/` 目录下，但实际 `main.prisma` 和 `nongqing.prisma` 在 `prisma/` 根目录。而且 `prisma/` 下还有一个 `dev.db`（SQLite 文件），说明开发环境可能混用了 SQLite 和 PostgreSQL。