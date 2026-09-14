// templates/core/governance/common.ts
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

// templates/core/governance/rules.ts
var protocol = {
  "exit_codes": {
    "pass": 0,
    "block": 2,
    "note": "\u5192\u70DF\u6821\u9A8C: \u4EA7\u7269\u9000\u51FA\u7801 \u2208 {0,2}\uFF08\u5176\u4F59\u4E3A\u975E\u9884\u671F\uFF0C\u9700\u4FEE\u590D\uFF09"
  },
  "output": {
    "stdout_json_only": true,
    "stderr_human_text": true,
    "field_separator": "::",
    "magic_dir_resolution": "\u6CE8\u5165\u4F18\u5148 \u2192 \u7269\u7406\u4F4D\u7F6E\u63A8\u5BFC \u2192 failClosed\uFF08\u7981\u6B62\u731C\u6D4B adapter \u540D\uFF09"
  },
  "adapters": {
    "claude": {
      "stdout_form": "plain-text",
      "project_dir_env": "CLAUDE_PROJECT_DIR",
      "magic_dir": ".claude",
      "handlerTypes": [
        "command",
        "mcp_tool"
      ]
    },
    "qoder": {
      "stdout_form": "json",
      "project_dir_env": "QODER_PROJECT_DIR",
      "magic_dir": ".qoder",
      "handlerTypes": [
        "command",
        "http"
      ]
    },
    "codex": {
      "stdout_form": "systemMessage",
      "project_dir_env": "git-toplevel",
      "magic_dir": ".codex",
      "handlerTypes": [
        "command"
      ]
    },
    "vscode": {
      "stdout_form": "plain-text",
      "project_dir_env": "PWD",
      "magic_dir": ".vscode",
      "handlerTypes": [
        "command"
      ]
    },
    "trae": {
      "stdout_form": "plain-text",
      "project_dir_env": "PWD",
      "magic_dir": ".trae",
      "handlerTypes": [
        "command"
      ]
    }
  },
  "event_outputs": {
    "qoder": {
      "SessionStart": "additionalContext",
      "UserPromptSubmit": "additionalContext",
      "PreToolUse": "permissionDecision",
      "Stop": "additionalContext",
      "PostToolUse": "feedback",
      "SubagentStart": "additionalContext",
      "SubagentStop": "additionalContext",
      "PostToolUseFailure": "text",
      "PermissionRequest": "text",
      "SessionEnd": "text",
      "PreCompact": "text",
      "Notification": "text"
    },
    "claude": {
      "SessionStart": "additionalContext",
      "UserPromptSubmit": "additionalContext",
      "PreToolUse": "permissionDecision",
      "Stop": "text",
      "PostToolUse": "feedback",
      "SubagentStart": "text",
      "SubagentStop": "text",
      "PostToolUseFailure": "text",
      "PermissionRequest": "text",
      "SessionEnd": "text",
      "PreCompact": "text",
      "Notification": "text"
    },
    "codex": {
      "Stop": "systemMessage",
      "PostToolUse": "text"
    },
    "vscode": {
      "PostToolUse": "text"
    },
    "trae": {
      "PostToolUse": "text"
    }
  },
  "core": {
    "stdout_form": "json",
    "magic_dir": ".add",
    "note": "core \u5165\u53E3\u534F\u8BAE = qoder \u540C\u6784\u53C2\u8003\u5B9E\u73B0\uFF1Badapter \u4EC5\u4FDD\u7559\u672C\u8868\u58F0\u660E\u7684\u79C1\u6709\u5DEE\u5F02"
  },
  "adapter_defaults": {
    "magic_dir_fallback": ".qoder",
    "probe_magic_dirs": [
      ".claude",
      ".qoder",
      ".vscode",
      ".add",
      ".trae",
      ".codex"
    ]
  }
};

// templates/core/governance/common.ts
var EXIT_PASS = protocol.exit_codes.pass;
var EXIT_BLOCK = protocol.exit_codes.block;
var STATE_SEP = protocol.output.field_separator;
function readHookInput() {
  if (process.stdin.isTTY) return "{}";
  return readFileSync(0, "utf-8");
}
function jsonGet(json, field) {
  const re = new RegExp(`"${field}"\\s*:\\s*"([^"]*)"`);
  const m = re.exec(json);
  return m?.[1] ?? "";
}
function queryPlanStatus() {
  const magicDir = process.env.MAGIC_DIR;
  if (!magicDir) {
    return {
      stdout: '{"availability":"STATUS_UNAVAILABLE","source":"database","reason":"magicDir \u672A\u6CE8\u5165\u4E14\u65E0\u6CD5\u4ECE\u7269\u7406\u4F4D\u7F6E\u63A8\u5BFC"}',
      exitCode: 3
    };
  }
  const bridge = join(
    process.env.PROJECT_DIR || process.cwd(),
    magicDir,
    "scripts",
    "plan-status-bridge.ts"
  );
  if (!existsSync(bridge)) {
    return {
      stdout: '{"availability":"STATUS_UNAVAILABLE","source":"database","reason":"plan-status bridge missing"}',
      exitCode: 3
    };
  }
  const r = spawnSync("node", ["--import", "tsx", bridge], {
    encoding: "utf-8",
    timeout: 1e4
  });
  return { stdout: r.stdout ?? "", exitCode: r.status ?? -1 };
}
function detectActiveAdd() {
  const r = queryPlanStatus();
  if (r.exitCode !== 0) {
    let reason = "database status unavailable";
    try {
      const parsed = JSON.parse(r.stdout);
      if (parsed.reason) reason = parsed.reason;
    } catch {
    }
    return `__STATUS_UNAVAILABLE__::${reason}::database::none::none`;
  }
  let snapshot;
  try {
    snapshot = JSON.parse(r.stdout);
  } catch {
    return null;
  }
  if (!(snapshot.availability === "READY" && snapshot.isActive === true)) return null;
  const done = snapshot.progress?.doneTasks ?? 0;
  const total = snapshot.progress?.totalTasks ?? 0;
  const approval = snapshot.approvalStatus ?? "none";
  return `${snapshot.planName}::${done}/${total}::${approval}::none::none`;
}
function projectHash() {
  try {
    return createHash("md5").update(`${process.env.PROJECT_DIR || process.cwd()}
`).digest("hex").slice(0, 8);
  } catch {
    return "default";
  }
}
var DEV_FLAG = `/tmp/add_dev_${projectHash()}`;

// templates/core/governance/notification-router.ts
import { existsSync as existsSync2, readdirSync } from "node:fs";
import { join as join2 } from "node:path";
var NotificationRouter = class {
  projectDir;
  fallbackMagicDir;
  constructor(projectDir, fallbackMagicDir) {
    this.projectDir = projectDir;
    this.fallbackMagicDir = fallbackMagicDir;
  }
  /** 提醒输出（core 默认: 含 Plan 前缀——bash 原文逐字；qoder 子类 override 无前缀） */
  emitReminder(plan, reviewsDir) {
    process.stdout.write(`[ADD Notification] Plan: ${plan} \u2014 \u8BF7\u68C0\u67E5 Review \u6587\u6863: ${reviewsDir}
`);
  }
  /**
   * magicDir 解析（core 默认: env 优先 → 跨端探测循环 → fallback；bash 原文逐字）:
   * 扩展点: qoder 子类 override 为固定值（qoder bash 原文硬编码 ${PROJECT_DIR}/.qoder/reviews，无探测循环）。
   * Task 9.4 中立化: 探测列表从 hook-protocol-rules.toml [protocol.adapter_defaults.probe_magic_dirs] 读取——
   * 原硬编码 [".claude", ".qoder", ".vscode", ".add"] 缺 .trae/.codex（新增端需改代码）；声明化后随端演进。
   */
  resolveMagicDir() {
    const env = process.env.MAGIC_DIR;
    if (env) return env;
    const defaults = protocol.adapter_defaults;
    const probeList = defaults?.probe_magic_dirs ?? [".claude", ".qoder", ".vscode", ".add"];
    for (const m of probeList) {
      if (existsSync2(join2(this.projectDir, m))) return m;
    }
    return this.fallbackMagicDir;
  }
  /** 主路由：返回 exit code（0） */
  run(input2) {
    const ntype = jsonGet(input2, "notification_type");
    if (ntype !== "result") return 0;
    const state = detectActiveAdd();
    if (state === null) return 0;
    const plan = state.split("::")[0] ?? "";
    const magicDir = this.resolveMagicDir();
    const reviewsDir = join2(this.projectDir, magicDir, "reviews");
    if (existsSync2(reviewsDir) && readdirSync(reviewsDir).some((f) => f.endsWith(".md"))) {
      this.emitReminder(plan, reviewsDir);
    }
    return 0;
  }
};

// templates/adapters/claude/hooks/lib/claude-env.ts
function resolveClaudeProjectDir() {
  return process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

// templates/adapters/claude/hooks/notification.ts
var ClaudeNotificationRouter = class extends NotificationRouter {
  /** 协议差异封装: fallbackMagicDir = ".claude"（claude 端兜底，bash 原文逐字） */
  constructor(projectDir) {
    super(projectDir, ".claude");
  }
  // 当前无 override（提醒文本与 core 基线一致）；命名子类承载端身份 + 未来演进位
};
process.env.PROJECT_DIR = resolveClaudeProjectDir();
var input = readHookInput();
process.exit(new ClaudeNotificationRouter(process.env.PROJECT_DIR).run(input));
