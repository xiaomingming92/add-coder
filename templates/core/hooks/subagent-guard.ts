// subagent-guard.ts — SubagentStart 入口薄壳（Task 3.1 能力对齐）
// 治理逻辑: governance/subagent-guard-router.js（SubagentGuardRouter 状态注入——对齐强版语义）
// 能力对齐注: 原 core 为弱版（事件提示空话），已对齐 claude/vscode/qoder 强版（状态注入）
// 入口职责: 仅解析 + 进程语义（<50 行），治理 0 复制。

import { SubagentGuardRouter } from "../governance/subagent-guard-router.js"

process.exit(new SubagentGuardRouter().run())
