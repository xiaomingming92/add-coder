/*
 * create_hitl 的交互裁决（手写模块；**不要放进 hitl-interaction.strategy.ts**——
 * 那是 `hitl-interaction-rules.toml` 的生成产物，任何手写逻辑都会被 generate 覆盖）。
 *
 * 背景（2026-09-14 修复 Codex 空转）：
 * 客户端按安装环境裁决交互方式：Qoder=genui、Codex=mcpApps、其余=inputRequired。
 * `update_hitl` 早已有 `mcpApps` 分支（引导走 core widget），但 `create_hitl` **漏了这一支**，
 * 于是 Codex 下走 elicitation 弹框 → 客户端不展示 → 一直"还在要输入" →
 * 连续 8 轮后以 `inputRequired.maxRounds` 失败（实测报 `still required input after 8 rounds`）。
 */

/**
 * create_hitl 是否需要跳过"创建确认弹框"：
 * - `_fallback` / `_use_genui`：调用方显式声明的无弹框路径（既有语义）；
 * - **`mcpApps`（Codex）**：审批交互在 core widget（`render_hitl_approval`）里完成，
 *   此处直接产出 DRAFT 提案，再由 widget 供用户拍板。
 */
export function shouldSkipHitlCreateDialog(
  mode: string, // 运行期取 toml 裁决值，收窄到 string 边界
  flags: { fallback?: boolean; useGenui?: boolean; mcpApps?: boolean } = {},
): boolean {
  /*
   * `_mcp_apps` 显式开关（2026-09-14 自 farm-agent 回灌）：环境裁决之外再给调用方一个强制入口——
   * 适配其它客户端/build、或需要确定性地走 widget 流程时不必依赖 toml 探测结果。
   */
  return Boolean(flags.useGenui || flags.fallback || flags.mcpApps) || mode === "mcpApps"
}
