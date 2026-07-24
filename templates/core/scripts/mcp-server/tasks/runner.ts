type TaskStatus = "pending" | "running" | "done" | "failed"
export interface Task { id: string; type: string; status: TaskStatus; progress: number; result?: string; createdAt: Date }

const taskQueue: Task[] = []

export function enqueueTask(type: string): string {
  const id = `task-${Date.now()}-${Math.random().toString(36).slice(2,6)}`
  taskQueue.push({ id, type, status: "pending", progress: 0, createdAt: new Date() })
  return id
}

export function getTaskStatus(id: string): Task | undefined { return taskQueue.find(t => t.id === id) }

export function getAllTasks(): Task[] { return [...taskQueue] }

export async function runTask(id: string, handler: () => Promise<string>) {
  const task = taskQueue.find(t => t.id === id); if (!task) return
  task.status = "running"; task.progress = 10
  try { task.result = await handler(); task.status = "done"; task.progress = 100 } catch (e) { task.status = "failed"; task.result = e instanceof Error ? e.message : String(e) }
}
