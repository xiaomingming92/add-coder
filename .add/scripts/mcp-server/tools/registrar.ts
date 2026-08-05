import type { McpServer } from "@modelcontextprotocol/server"

/**
 * 工具注册器最小契约（基类接口）。
 *
 * 所有 registerXxxTools 只依赖 registerTool 一个成员，而非整个 McpServer：
 * - 各模块注册函数 = 派生实现，签名收敛到最小依赖
 * - registerAllTools 可注入装饰版 registrar（如 D9 项目身份前缀），
 *   无需伪造 McpServer 对象，类型安全
 */
export type ToolRegistrar = Pick<McpServer, "registerTool">
