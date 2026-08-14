// lib/qoder-env.ts — Qoder CN 私有环境解析（PROJECT_DIR 注入链）
// 契约: qoder 端所有 hook 的 PROJECT_DIR 来源 = ${CLAUDE_PROJECT_DIR:-${QODER_PROJECT_DIR:-${QODERCN_PROJECT_DIR:-$PWD}}}
// （对齐 qoder state-detect.sh 宿主注入链，与 claude-env.ts 同构）

/** 解析项目根目录（对齐 bash ${CLAUDE_PROJECT_DIR:-${QODER_PROJECT_DIR:-${QODERCN_PROJECT_DIR:-$PWD}}}） */
export function resolveQoderProjectDir(): string {
  return (
    process.env.CLAUDE_PROJECT_DIR ||
    process.env.QODER_PROJECT_DIR ||
    process.env.QODERCN_PROJECT_DIR ||
    process.cwd()
  )
}

/**
 * 注入 PROJECT_DIR 到 process.env（对齐 bash export PROJECT_DIR）。
 * 入口统一调用；后续 hash/路径计算均消费该值。
 */
export function injectProjectDir(): string {
  const dir = resolveQoderProjectDir()
  process.env.PROJECT_DIR = dir
  return dir
}
