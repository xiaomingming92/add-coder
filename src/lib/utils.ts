import { createInterface } from "readline";
import { existsSync } from "fs";
import { resolve } from "path";
import type { Readable } from "stream";

// 非 TTY 管道队列（RPT-02/#16 + RPT-04/#17）：预读 stdin 全量，按行入队，EOF 终止
let pipeQueue: string[] | null = null;
let pipeReady: Promise<void> | null = null;

/** 读取非 TTY stdin 直到 EOF，并按非空行建立一次性答案队列。 */
export function collectPipeAnswers(input: Readable): Promise<string[]> {
  return new Promise((resolveAnswers) => {
    const answers: string[] = [];
    let buffer = "";
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (buffer.trim()) answers.push(buffer.trim());
      resolveAnswers(answers);
    };

    input.setEncoding("utf-8");
    input.on("data", (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      answers.push(...lines.filter((line) => line.trim() !== ""));
    });
    input.once("end", finish);
    input.once("error", finish);
    input.resume();
  });
}

/** 消费一行；EOF 后队列为空时返回空串，绝不再次等待 stdin。 */
export function takePipeAnswer(queue: string[]): string {
  return (queue.shift() ?? "").trim().toLowerCase();
}

function ensurePipeQueue(): Promise<void> {
  if (pipeReady) return pipeReady;
  if (process.stdin.isTTY) return (pipeReady = Promise.resolve());
  pipeReady = collectPipeAnswers(process.stdin).then((answers) => {
    pipeQueue = answers;
  });
  return pipeReady;
}

export async function ask(q: string): Promise<string> {
  await ensurePipeQueue();
  if (pipeQueue) {
    // 非 TTY：队列消费（EOF 终止不挂起、多问顺序消费——RPT-02/04）
    return takePipeAnswer(pipeQueue);
  }
  // TTY：既有 readline 逐问（不变）
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((r) => { rl.question(q, (a) => { rl.close(); r(a.trim().toLowerCase()); }); });
}

export function detectPm(projectRoot: string): "pnpm" | "npm" {
    return existsSync(resolve(projectRoot, "pnpm-lock.yaml")) ? "pnpm" : "npm";
}
