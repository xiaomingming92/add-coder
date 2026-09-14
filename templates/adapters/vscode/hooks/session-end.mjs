// templates/core/governance/session-end.ts
import { unlinkSync as unlinkSync2 } from "node:fs";

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
function hasDevAction() {
  return existsSync(DEV_FLAG);
}
function clearDevAction() {
  try {
    unlinkSync(DEV_FLAG);
  } catch {
  }
}
function checkAddCompleteness(handoff, addRoute) {
  const issues = [];
  if (handoff && existsSync(handoff)) {
    const content = readFileSync(handoff, "utf-8");
    if (!/验收|收敛|闭环|本轮改了什么|devlog/.test(content)) {
      issues.push("  [ ] devlog \u7F3A\u5931\uFF08handoff \u65E0\u9A8C\u6536\u8BB0\u5F55\uFF09");
    }
    const unchecked = (content.match(/\[ \]/g) || []).length;
    if (unchecked > 0) {
      issues.push(`  [ ] handoff ${unchecked} \u9879\u672A\u52FE\u9009`);
    }
  }
  if (addRoute && existsSync(addRoute)) {
    const content = readFileSync(addRoute, "utf-8");
    const unchecked = (content.match(/\[ \]/g) || []).length;
    if (unchecked > 0) {
      issues.push(`  [ ] add-route ${unchecked} Step \u672A\u95ED\u73AF`);
    }
  }
  return issues;
}

// templates/core/governance/session-end.ts
function stateField(state, index) {
  return state.split("::")[index] ?? "";
}
var SessionEndGuard = class {
  projectDir;
  tplFlag;
  constructor(projectDir) {
    this.projectDir = projectDir ?? process.env.PROJECT_DIR ?? process.cwd();
    this.tplFlag = `/tmp/add_tpl_${projectHash()}`;
  }
  /** ① 清理 tpl-injected 标记 + dev action 标记（对齐 cleanup_tpl_flag/cleanup_dev_flag） */
  cleanupFlags() {
    try {
      unlinkSync2(this.tplFlag);
    } catch {
    }
    clearDevAction();
  }
  /** ② 审计结算（core 默认: stderr 文本；qoder 子类 override: stdout JSON additionalContext） */
  emitSettle() {
    process.stderr.write(`[ADD SessionEnd] \u4F1A\u8BDD\u7ED3\u675F \u2014 ${localIsoSeconds()}
`);
  }
  /** ② 审计结算（输出到 stderr 供日志记录，对齐 bash date -Iseconds） */
  settle() {
    this.emitSettle();
  }
  /** ③ Stop 未触发兜底（对齐 stop_fallback：dev action 标记还在 → 补 checklist 快照） */
  stopFallback() {
    if (!hasDevAction()) return;
    process.stderr.write("[ADD SessionEnd] \u26A0\uFE0F \u68C0\u6D4B\u5230 dev action \u6807\u8BB0\u672A\u6E05\u9664\u2014\u2014Stop \u53EF\u80FD\u672A\u89E6\u53D1\u9A8C\u6536\u68C0\u67E5\n");
    const state = detectActiveAdd();
    if (state === null) return;
    const handoff = stateField(state, 3);
    const addRoute = stateField(state, 4);
    if (handoff && handoff !== "none") {
      process.stderr.write("[ADD SessionEnd] \u8865\u6267\u884C checklist \u5FEB\u7167\uFF08best-effort\uFF0C\u4E0D\u963B\u65AD\uFF09\n");
      const issues = checkAddCompleteness(handoff, addRoute !== "none" ? addRoute : "");
      for (const issue of issues) {
        process.stderr.write(issue + "\n");
      }
    }
  }
  /** 主入口：①清理 → ②结算 → ③兜底（对齐 bash main） */
  run() {
    this.cleanupFlags();
    this.settle();
    this.stopFallback();
    return 0;
  }
};

// templates/adapters/vscode/hooks/session-end.ts
var VscodeSessionEndGuard = class extends SessionEndGuard {
  // 当前无 override（清理/结算/兜底与 core 基线一致）；命名子类承载端身份 + 未来演进位
};
var PROJECT_DIR = process.env.PROJECT_DIR || process.cwd();
process.exit(new VscodeSessionEndGuard(PROJECT_DIR).run());
