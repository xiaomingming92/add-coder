import { prisma } from "../shared/prisma.js"
import type { Task } from "./runner.js"

export async function persistTask(task: Task): Promise<void> {
  try {
    const typedPrisma = prisma as Record<string, Record<string, (...a: unknown[]) => unknown>>
    await typedPrisma.auditLog.create({
      data: {
        userId: "system",
        action: `TASK_${task.status.toUpperCase()}`,
        targetType: "TASK",
        targetId: task.id,
        reason: task.type,
        afterState: { progress: task.progress, result: task.result ?? null }
      }
    })
  } catch { /* intentionally empty */ }
}

export type { Task }
