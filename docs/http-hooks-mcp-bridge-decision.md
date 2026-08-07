# 架构决策：HTTP Hooks 不跟进，只做 MCP 转发桥接

> **决策日期**：2026-08-07
> **决策状态**：已定（HITL TONGYI，Plan `add-coder-http-hooks-mcp-bridge-plan-v1`）
> **决策人**：项目所有者

---

## 一、决策声明

**Qoder 的 HTTP Hooks 不跟进——不实现 HTTP Hooks 处理器、不接入 caijuehub 治理根、不绑定宿主 IDE 私有回调协议。HTTP 事件源只通过 MCP 转发桥接接入，治理逻辑始终锚定 MCP 端。**

适用范围：Qoder v1.23.0（2026-08-06）HTTP Hooks、trae 企业版 HTTP Hooks、qoder-cn HTTP Hooks——一律不原生适配。

## 二、背景

Qoder v1.23.0（2026-08-06）发布能力：实时语音协作、定时任务升级、Deeplink 插件安装、**HTTP Hooks**（工具调用/会话关键节点事件推送，依据返回结果放行/拦截/注入上下文，便于集中实施安全策略、审计与外部集成）。trae 企业版与 qoder-cn 已有同类能力。

add-coder 的治理逻辑位于 **MCP 工具层**（`.add/scripts/mcp-server` 的 17 门禁卡位），通过适配层分离覆盖 5 个 IDE（claude / qoder / vscode / trae / codex）。

## 三、决策依据

1. **HTTP 是 MCP 的传输层，不是竞争者**：MCP 规范原生定义 `Streamable HTTP transport` 与 SSE——"HTTP 向 MCP 靠拢"不是预测，是现状。在 MCP 端做 HTTP 转发 = 走 MCP 原生路径，不是绕路。

2. **HTTP Hooks 宣称的能力，MCP 已有对等物**：

   | HTTP Hooks 能力 | MCP 对等物 | add-coder 现状 |
   |----------------|-----------|----------------|
   | 工具调用事件推送 | MCP Notifications（工具结果/资源变更通知） | 规范原生 |
   | 放行 / 拦截 | 工具权限 + 门禁 | 17 Hook 卡位已实现 |
   | 注入上下文 | MCP Resources | 12 端点已实现（`policy://`、`oncall://current` 等） |
   | 集中安全策略 | MCP 工具链 + caijuehub TOML | 跨 IDE 统一 |

3. **跟进 = 破坏架构原则**：HTTP Hooks 是宿主 IDE 的私有回调协议（各家实现不同）。接入治理根 = 治理逻辑绑定单个 IDE = 违背「治理逻辑统一 · 适配层分离」。多 IDE 一致性是 add-coder 的核心资产（17 卡位 × 5 IDE）。

4. **绑定私有协议的长期成本**：HTTP Hooks 的接口形态、事件语义、鉴权方式随 IDE 厂商演化（trae 的 ≠ qoder 的 ≠ 未来某家的），每跟一个 = 多一份维护面；而 MCP 协议由开放社区标准化（Anthropic 发起，OpenAI/Google/Microsoft 等跟进）。

## 四、桥接设计（唯一接入形态）

```
宿主 IDE HTTP 事件源（未来某家成为事实标准时）
        │  HTTP 推送
        ▼
┌───────────────────────────────┐
│  MCP 转发桥（add-coder 侧）    │
│  ┌─────────────────────────┐  │
│  │ http_events:// 资源      │  │  事件源注册与鉴权
│  ├─────────────────────────┤  │
│  │ 转发工具 record_http_    │  │  事件 → 结构化审计
│  │ event                    │  │   → 送入 MCP 治理管道
│  └─────────────────────────┘  │
└───────────────┬───────────────┘
                ▼
       MCP 治理管道（17 卡位 + caijuehub TOML）
       放行 / 拦截 / 注入上下文 / 审计
```

- **治理逻辑位置不变**：裁决、门禁、审计全部留在 MCP 端（与现有 17 卡位一致）
- **HTTP 只做事件输入**：转发桥把 HTTP 事件结构化后送入治理管道，HTTP 本身不参与决策
- **转发桥是预留**：当前不实现（无事实标准事件源），仅在设计层面预留 `http_events://` 资源 + 转发工具形态

## 五、风险与预案

| 风险 | 影响 | 预案 |
|------|------|------|
| 某 IDE 的 HTTP Hooks 生态先于 MCP 成为事实标准（企业客户点名要求） | 短期集成诉求无法直接满足 | 启用 MCP 转发桥（http_events 资源 + 转发工具），治理仍在 MCP 端——无需改架构 |
| HTTP Hooks 与 MCP Notifications 语义重叠导致认知混乱 | 团队理解分歧 | 本决策文档即边界声明：HTTP 只做事件输入，决策只在 MCP 端 |

## 六、不跟进清单（明确禁止）

- ❌ 不实现 HTTP Hooks 处理器（Qoder / trae / qoder-cn 均不实现）
- ❌ 不把 HTTP Hooks 事件接入 caijuehub 裁决
- ❌ 不在模板中生成 HTTP Hooks 配置
- ✅ 允许：未来在 MCP 端实现 `http_events` 转发桥（前置条件：出现事实标准事件源）

## 七、关联

| 类型 | 路径 |
|------|------|
| 治理架构 | [`caijuehub.md`](./caijuehub.md) |
| 多适配原则 | `README.md`（治理逻辑统一·适配层分离） |
| 决策 Plan | `.qoder/plans/2026-08/07/add-coder-http-hooks-mcp-bridge-plan-v1.md` |
