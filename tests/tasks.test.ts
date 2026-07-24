/**
 * MCP Tasks 单元测试
 * 测试 runner.ts 的任务队列 + 状态机，不依赖 prisma
 *
 * 运行: npx vitest run tests/tasks.test.ts
 */

import { describe, it, expect, beforeEach } from "vitest"

// 直接 re-import 确保每次测试拿到全新的闭包队列
// runner.ts 内部是模块级 taskQueue，vitest 的模块缓存意味着
// 同一文件内的多个 describe 共享同一个队列实例

describe("Tasks 任务队列", () => {
  it("enqueueTask 返回 task-id 格式", async () => {
    const { enqueueTask } = await import("../templates/core/scripts/mcp-server/tasks/runner.js")
    const id = enqueueTask("audit-scan")
    expect(id).toMatch(/^task-\d+-[a-z0-9]{4}$/)
  })

  it("getTaskStatus 返回 pending 状态", async () => {
    const { enqueueTask, getTaskStatus } = await import("../templates/core/scripts/mcp-server/tasks/runner.js")
    const id = enqueueTask("npm-check")
    const task = getTaskStatus(id)
    expect(task).toBeDefined()
    expect(task!.status).toBe("pending")
    expect(task!.type).toBe("npm-check")
    expect(task!.progress).toBe(0)
  })

  it("enqueueTask 多次调用产生不同 ID", async () => {
    const { enqueueTask } = await import("../templates/core/scripts/mcp-server/tasks/runner.js")
    const ids = [enqueueTask("a"), enqueueTask("b"), enqueueTask("c")]
    expect(new Set(ids).size).toBe(3)
  })
})

describe("Tasks 状态机", () => {
  it("pending → done", async () => {
    const { enqueueTask, runTask, getTaskStatus } = await import("../templates/core/scripts/mcp-server/tasks/runner.js")
    const id = enqueueTask("batch-review")
    await runTask(id, async () => "3 files reviewed")
    const task = getTaskStatus(id)
    expect(task!.status).toBe("done")
    expect(task!.result).toBe("3 files reviewed")
    expect(task!.progress).toBe(100)
  })

  it("pending → failed", async () => {
    const { enqueueTask, runTask, getTaskStatus } = await import("../templates/core/scripts/mcp-server/tasks/runner.js")
    const id = enqueueTask("broken-task")
    await runTask(id, async () => { throw new Error("connection refused") })
    const task = getTaskStatus(id)
    expect(task!.status).toBe("failed")
    expect(task!.result).toContain("connection refused")
  })

  it("pending → running → done 状态转换", async () => {
    const { enqueueTask, runTask, getTaskStatus } = await import("../templates/core/scripts/mcp-server/tasks/runner.js")
    const id = enqueueTask("state-check")
    let capturedRunning = false
    await runTask(id, async () => {
      // 在执行 handler 内部检查状态
      const self = getTaskStatus(id)
      expect(self!.status).toBe("running")
      capturedRunning = true
      return "ok"
    })
    expect(capturedRunning).toBe(true)
    const task = getTaskStatus(id)
    expect(task!.status).toBe("done")
  })

  it("不存在的 ID 返回 undefined", async () => {
    const { getTaskStatus } = await import("../templates/core/scripts/mcp-server/tasks/runner.js")
    expect(getTaskStatus("nonexistent")).toBeUndefined()
  })
})

describe("Tasks getAllTasks", () => {
  it("返回所有任务副本", async () => {
    const { enqueueTask, getAllTasks } = await import("../templates/core/scripts/mcp-server/tasks/runner.js")
    enqueueTask("x"); enqueueTask("y")
    const all = getAllTasks()
    expect(all.length).toBeGreaterThanOrEqual(2)
    // 返回的是副本，修改不影响内部队列
    all.push({ id: "fake", type: "fake", status: "fake" as any, progress: 0, createdAt: new Date() })
    expect(getAllTasks().length).toBe(all.length - 1)
  })
})
