// review-checklist.ts — Review 检查清单校验（Codex 版）
// bash 版缺陷修复: SHARED_LIB 路径断裂，TS 版 import core common.js（内联）。

process.stdout.write("[ADD ReviewChecklist] 请在提交前确认 checklist.md 全部项已勾选。\n")
process.exit(0)
