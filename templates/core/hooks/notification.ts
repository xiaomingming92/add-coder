// notification.ts — Notification 入口薄壳（Task 2.2/3.1 继承体系）
// 治理逻辑: governance/notification-router.js（NotificationRouter 探测循环 + reviews 提醒）
// 入口职责: 仅解析 + 进程语义（<50 行），治理 0 复制。

import { readHookInput } from "../governance/common.js"
import { NotificationRouter } from "../governance/notification-router.js"

const input = readHookInput()
const PROJECT_DIR = process.env.PROJECT_DIR || process.cwd()

process.exit(new NotificationRouter(PROJECT_DIR, ".add").run(input))
