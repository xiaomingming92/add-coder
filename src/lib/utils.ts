import { createInterface } from "readline";
import { existsSync } from "fs";
import { resolve } from "path";
import type { Readable } from "stream";

// 非 TTY 管道队列（RPT-02/#16 + RPT-04/#17）：预读 stdin 全量，按行入队，EOF 终止
let pipeQueue: string[] | null = null;
let pipeReady: Promise<void> | null = null;

/**
 * 非 TTY 输入宽限（2026-09-14 修复"自动化静默挂起"）：
 * 上游把 stdin 接成 **永不 EOF 的管道** 时（`execSync(stdio:"pipe")`、`spawn(stdio:["pipe",...])`、
 * 部分 CI/agent 沙箱都不会主动关管道），旧实现死等 `end` →
 * `add-coder init` 在"备份失败是否自担风险继续"处**无输出地永久挂起**（实测 >75s 未退出，
 * 且非 TTY 分支连问题文本都不打印，日志里只看到"卡住"）。
 * 新语义：**有输入照旧**（数据到达即重置宽限，管道写完就收）；既无数据又无 EOF 时按"无输入"结队，
 * 空串即调用方的**既有默认值**（拒绝/否）——与 EOF 语义完全一致，只是不再无限等待。
 */
export const PIPE_ANSWER_GRACE_MS = 3000;

/** 读取非 TTY stdin 直到 EOF **或宽限期到**，并按非空行建立一次性答案队列。 */
export function collectPipeAnswers(input: Readable, graceMs: number = PIPE_ANSWER_GRACE_MS): Promise<string[]> {
  return new Promise((resolveAnswers) => {
    const answers: string[] = [];
    let buffer = "";
    let settled = false;
    let timer: NodeJS.Timeout | null = null;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (buffer.trim()) answers.push(buffer.trim());
      resolveAnswers(answers);
    };
    const armGrace = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(finish, graceMs);
    };

    input.setEncoding("utf-8");
    input.on("data", (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      answers.push(...lines.filter((line) => line.trim() !== ""));
      armGrace(); // 有输入 → 顺延宽限（长管道不会被中途截断）
    });
    input.once("end", finish);
    input.once("error", finish);
    input.resume();
    armGrace();
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
    // 非 TTY：队列消费（EOF/宽限终止不挂起、多问顺序消费——RPT-02/04）
    const a = takePipeAnswer(pipeQueue);
    // 非 TTY 分支原本**不输出问题文本**，自动化日志里无法判断"在问什么/为什么停"——补审计痕迹
    process.stderr.write(a === "" ? `${q.trim()}（非交互无输入 → 取默认）\n` : `${q.trim()} → ${a}\n`);
    return a;
  }
  // TTY：既有 readline 逐问（不变）
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((r) => { rl.question(q, (a) => { rl.close(); r(a.trim().toLowerCase()); }); });
}

export function detectPm(projectRoot: string): "pnpm" | "npm" {
    return existsSync(resolve(projectRoot, "pnpm-lock.yaml")) ? "pnpm" : "npm";
}
