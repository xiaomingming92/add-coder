// pre-compact.ts — 上下文压缩前 ADD 状态保存（入口薄壳，Task 2.2/3.1 继承体系）
// 治理逻辑: governance/pre-compact-guard.js（PreCompactGuard 状态保存 + tpl 标记清理）
// 入口职责: 仅解析 + 进程语义（<50 行），治理 0 复制。

import { PreCompactGuard } from "../governance/pre-compact-guard.js"

process.env.PROJECT_DIR = process.env.PROJECT_DIR || process.cwd()

process.exit(new PreCompactGuard().run())
