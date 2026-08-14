// review-checklist.ts — 验收 Review 模式（Qoder CN 版，Task 4.1 继承体系补全）
// 继承 core ReviewChecklistGuard，命名子类 QoderReviewChecklistGuard:
//   ① specRoot = ".qoder/specs"（构造参数——checkReviewQuality 默认值同，qoder 协议差异）
//   ② Step 0 准入失败 exit 1 语义 = 基类（qoder bash 原文逐字）
// 被 prompt-submit 的「验收」幂等检查后调用。

import { ReviewChecklistGuard } from "../../../core/governance/review-checklist-guard.js"
import { injectProjectDir } from "./lib/qoder-env.js"

class QoderReviewChecklistGuard extends ReviewChecklistGuard {
  /** 协议差异封装: specRoot = ".qoder/specs"（qoder 端 spec 目录） */
  constructor() {
    super(".qoder/specs")
  }

  // 当前无 override（Step 0 准入 exit 1 语义与 core 基线一致）；命名子类承载端身份 + 未来演进位
}

injectProjectDir()

const handoff = process.argv[2] ?? ""
const addRoute = process.argv[3] ?? ""

process.exit(new QoderReviewChecklistGuard().run(handoff, addRoute))
