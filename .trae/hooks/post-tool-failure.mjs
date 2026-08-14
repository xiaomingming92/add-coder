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
function projectHash() {
  try {
    return createHash("md5").update(`${process.env.PROJECT_DIR || process.cwd()}
`).digest("hex").slice(0, 8);
  } catch {
    return "default";
  }
}
var DEV_FLAG = `/tmp/add_dev_${projectHash()}`;

// templates/core/governance/post-tool-failure-router.ts
function fieldOr(json, field, fallback) {
  const re = new RegExp(`"${field}"\\s*:\\s*"([^"]*)"`);
  const m = re.exec(json);
  return m ? m[1] : fallback;
}
var PostToolFailureRouter = class {
  /** 主路由：返回 exit code（0） */
  run(input2) {
    const empty = input2.trim() === "";
    const toolName = empty ? this.emptyUsesFallback() ? this.fallbackToolName() : "" : fieldOr(input2, "tool_name", this.fallbackToolName());
    const error = empty ? this.emptyUsesFallback() ? this.fallbackError() : "" : fieldOr(input2, "error", this.fallbackError());
    this.emit(toolName, error);
    return 0;
  }
  /** 空输入是否走 fallback（core/qoder: false——空串；vscode 子类 override: true——bash grep || echo 语义） */
  emptyUsesFallback() {
    return false;
  }
  /** tool_name 缺失回退（core: ""；qoder 子类 override: "unknown"） */
  fallbackToolName() {
    return "";
  }
  /** error 缺失回退（core: ""；qoder 子类 override: "unknown"；vscode 子类 override: "未知错误"） */
  fallbackError() {
    return "";
  }
  /** 输出（core 默认: stdout 固定文本——bash 原文逐字；adapter 子类 override 用 toolName/error） */
  emit(_toolName, _error) {
    process.stdout.write("[ADD PostToolFailure] \u5DE5\u5177\u8C03\u7528\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u9519\u8BEF\u4FE1\u606F\u5E76\u4FEE\u590D\u3002\n");
  }
};

// templates/adapters/trae/hooks/post-tool-failure.ts
var TraePostToolFailureRouter = class extends PostToolFailureRouter {
  // 当前无 override（stdout 固定提示与 core 基线一致）；命名子类承载端身份 + 未来演进位
};
var input = readHookInput();
process.exit(new TraePostToolFailureRouter().run(input));
