// post-tool-failure.ts — PostToolUseFailure 入口（Trae 版，Task 6.1 继承体系）
// 继承 core PostToolFailureRouter，命名子类 TraePostToolFailureRouter:
//   ① emit = 基类默认（stdout 固定文本——bash 原文逐字，trae 为占位实现）
// 协议差异: 无（与 core 同构）；命名子类承载端身份 + 未来演进位

import { readHookInput } from "../../../core/governance/common.js"
import { PostToolFailureRouter } from "../../../core/governance/post-tool-failure-router.js"

class TraePostToolFailureRouter extends PostToolFailureRouter {
  // 当前无 override（stdout 固定提示与 core 基线一致）；命名子类承载端身份 + 未来演进位
}

const input = readHookInput()
process.exit(new TraePostToolFailureRouter().run(input))
