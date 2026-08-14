// session-end.ts — SessionEnd 入口（VS Code Copilot 版，Task 5.1 继承体系）
// 继承 core SessionEndGuard，命名子类 VscodeSessionEndGuard:
//   完整治理（标记清理 + 审计结算 + Stop 兜底）——能力对齐注（2026-08-14 发现）:
//   bash 版薄包装 source lib/session-end.sh 后 main 因 BASH_SOURCE 守卫不执行
//   （卡位 #2 完全失效）；TS 版实现完整治理，与 core/qoder/trae 对齐。
//   当前无 override，命名子类承载端身份 + 未来演进位
// 协议差异仅剩: PROJECT_DIR = $PWD（vscode 无注入链）

import { SessionEndGuard } from "../../../core/governance/session-end.js"

class VscodeSessionEndGuard extends SessionEndGuard {
  // 当前无 override（清理/结算/兜底与 core 基线一致）；命名子类承载端身份 + 未来演进位
}

const PROJECT_DIR = process.env.PROJECT_DIR || process.cwd()
process.exit(new VscodeSessionEndGuard(PROJECT_DIR).run())
