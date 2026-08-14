// lib/review-checklist.ts — 验收 Review 模式（Qoder CN 版，Task 4.1 收敛）
// R2 回流: review-checklist 逻辑已收敛 core governance/review-checklist-guard.ts
// （checkReviewQuality 逐字迁移 + specRoot 参数化）；本文件仅 re-export 保持 import 兼容。

export { checkReviewQuality } from "../../../../core/governance/review-checklist-guard.js"
