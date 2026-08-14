// templates/core/governance/common.ts
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
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
function projectHash() {
  try {
    return createHash("md5").update(`${process.env.PROJECT_DIR || process.cwd()}
`).digest("hex").slice(0, 8);
  } catch {
    return "default";
  }
}
var DEV_FLAG = `/tmp/add_dev_${projectHash()}`;

// templates/adapters/claude/hooks/permission-denied.ts
var input = readHookInput();
var toolName = jsonGet(input, "tool_name");
if (toolName === "") {
  toolName = input.match(/"tool_name"\s*:\s*"([^"]*)"/)?.[1] ?? "unknown";
}
var reason = jsonGet(input, "reason");
if (reason === "") {
  reason = input.match(/"reason"\s*:\s*"([^"]*)"/)?.[1] ?? "\u6743\u9650\u88AB\u62D2\u7EDD";
}
process.stderr.write(`[ADD PermissionDenied] ${toolName} \u88AB\u62D2\u7EDD: ${reason}
`);
switch (toolName) {
  case "Bash":
    process.stderr.write("[ADD PermissionDenied] \u5EFA\u8BAE: \u4F7F\u7528\u5B89\u5168\u7684\u7B49\u4EF7\u547D\u4EE4\uFF0C\u6216\u901A\u8FC7 permission-gate.sh \u767D\u540D\u5355\u653E\u884C\n");
    break;
  case "Write":
  case "Edit":
    process.stderr.write("[ADD PermissionDenied] \u5EFA\u8BAE: \u68C0\u67E5\u76EE\u6807\u8DEF\u5F84\u662F\u5426\u5728\u9879\u76EE\u8303\u56F4\u5185\uFF0C\u654F\u611F\u6587\u4EF6\uFF08.env\u7B49\uFF09\u4E0D\u53EF\u5199\u5165\n");
    break;
  case "Read":
    process.stderr.write("[ADD PermissionDenied] \u5EFA\u8BAE: \u8BE5\u6587\u4EF6\u53EF\u80FD\u53D7\u8BFB\u4FDD\u62A4\uFF0C\u5C1D\u8BD5\u8BFB\u53D6\u9879\u76EE\u516C\u6709\u6587\u4EF6\u66FF\u4EE3\n");
    break;
}
process.exit(0);
