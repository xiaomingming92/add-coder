/*
 * backfill-search-text.ts（仓根入口）— 实现真源在 templates，随模板分发到 `{magicDir}/scripts/memory/`。
 *
 * 为什么只做转发：下游项目（farm-agent 等）必须能自己跑回填，而仓根 `scripts/` 不随包分发。
 * 把实现放 templates 侧（相对路径在 templates 树与 `{magicDir}` 树中完全一致），本文件仅转发，
 * 避免"仓根一份、模板一份"的漂移（ADD-12）。
 */
await import("../../templates/core/scripts/memory/backfill-search-text.js")
