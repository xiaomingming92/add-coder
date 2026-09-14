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
function localIsoSeconds() {
  const d = /* @__PURE__ */ new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const offAbs = Math.abs(offsetMin);
  const off = `${sign}${pad(Math.floor(offAbs / 60))}:${pad(offAbs % 60)}`;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${off}`;
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

// templates/core/governance/subagent-stop-router.ts
import { existsSync as existsSync2, readFileSync as readFileSync2 } from "node:fs";
var SubagentStopRouter = class {
  /** 对齐 bash jq -r '.agent_type // .subagent_name // "unknown"'：
   * 空输入/非法 JSON → jq 无输出 → 空串（不是 "unknown"）；字段缺失才回退 "unknown" */
  agentNameFrom(input2) {
    if (input2.trim() === "") return "";
    try {
      const parsed = JSON.parse(input2);
      const v = parsed.agent_type ?? parsed.subagent_name;
      return typeof v === "string" && v !== "" ? v : "unknown";
    } catch {
      return "";
    }
  }
  // ─────────────────────────── 扩展点 ───────────────────────────
  /** ① 无活跃 Plan 告警（core: stderr；qoder 子类 override: stdout JSON） */
  emitNoPlanWarn(agentName) {
    process.stderr.write(`[ADD SubagentStop] \u26A0\uFE0F ${agentName} \u5DF2\u5B8C\u6210\uFF0C\u4F46\u65E0\u6D3B\u8DC3 ADD Plan \u65E0\u6CD5\u6821\u9A8C\u8FB9\u754C
`);
  }
  /** ② 边界通过审计（core: stderr；qoder 子类 override: stdout JSON） */
  emitBoundaryPass(agentName, planKw, _handoff) {
    process.stderr.write(`[ADD SubagentStop] ${agentName} \u5DF2\u5B8C\u6210 \u2014 \u5173\u8054 Plan: ${planKw}
`);
    process.stderr.write(`[ADD SubagentStop] ${agentName} \u8FB9\u754C\u6821\u9A8C\u901A\u8FC7 \u2014 ${localIsoSeconds()}
`);
  }
  /** 交付物越界检查开关（core: true；qoder: false——qoder 轻量提示无阻断） */
  checkDeliverables() {
    return true;
  }
  /** 主路由：返回 exit code（0 放行 / 2 阻断） */
  run(input2) {
    const agentName = this.agentNameFrom(input2);
    const state = detectActiveAdd();
    if (state === null) {
      this.emitNoPlanWarn(agentName);
      return 0;
    }
    const planKw = state.split("::")[0] ?? "";
    const handoff = state.split("::")[3] ?? "";
    if (this.checkDeliverables() && handoff && handoff !== "none" && existsSync2(handoff)) {
      const deliverablesRaw = (() => {
        try {
          const parsed = JSON.parse(input2);
          return typeof parsed.deliverables === "string" ? parsed.deliverables : "";
        } catch {
          return "";
        }
      })();
      if (deliverablesRaw !== "") {
        const handoffContent = readFileSync2(handoff, "utf-8");
        const violations = [];
        for (const f of deliverablesRaw.split(/\s+/)) {
          if (f === "") continue;
          if (!handoffContent.includes(f)) violations.push(f);
        }
        if (violations.length > 0) {
          process.stderr.write(`[ADD SubagentStop] \u274C ${agentName} \u4EA4\u4ED8\u7269\u8D85\u51FA spec \u8FB9\u754C: ${violations.join(" ")}
`);
          process.stderr.write("[ADD SubagentStop] \u8981\u6C42\u91CD\u505A\u2014\u2014\u8BF7\u68C0\u67E5\u8FD9\u4E9B\u6587\u4EF6\u662F\u5426\u5C5E\u4E8E\u672C\u8F6E spec \u8303\u56F4\n");
          return EXIT_BLOCK;
        }
      }
    }
    this.emitBoundaryPass(agentName, planKw, handoff);
    return 0;
  }
};

// templates/adapters/claude/hooks/lib/claude-env.ts
function resolveClaudeProjectDir() {
  return process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

// templates/adapters/claude/hooks/subagent-stop.ts
process.env.PROJECT_DIR = resolveClaudeProjectDir();
var input = readHookInput();
process.exit(new SubagentStopRouter().run(input));
