// permission-gate.ts — PermissionRequest 入口（VS Code Copilot 版，Task 5.1 继承体系）
// 继承 core PermissionGateRouter，命名子类 VscodePermissionGateRouter:
//   ① tool_name 缺失回退 ""（bash `// empty` 语义）——基类默认，无 override
//   ② emit = 基类默认（仅高风险工具 Bash/Write/Edit stdout 二次确认，bash 原文逐字）
// 协议差异: 无（与 core 同构）；命名子类承载端身份 + 未来演进位

import { readHookInput } from "../../../core/governance/common.js"
import { PermissionGateRouter } from "../../../core/governance/permission-gate-router.js"

class VscodePermissionGateRouter extends PermissionGateRouter {
  // 当前无 override（`// empty` 回退 + 高风险工具提示与 core 基线一致）；命名子类承载端身份 + 未来演进位
}

const input = readHookInput()
process.exit(new VscodePermissionGateRouter().run(input))
