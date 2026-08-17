// templates/core/governance/common.ts
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath as fileURLToPath3 } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

// templates/core/governance/rules.ts
var context = {
  "quadrants": [
    {
      "id": "no_add_no_dev",
      "consumed": false,
      "text": "[ADD Stop] \u65E0\u6D3B\u8DC3 Plan\uFF0C\u65E0\u4EE3\u7801\u6539\u52A8\u3002\u6B63\u5E38\u7ED3\u675F\u3002"
    },
    {
      "id": "no_add_has_dev",
      "consumed": true,
      "text": '[ADD Stop] \u26A0\uFE0F \u68C0\u6D4B\u5230\u4EE3\u7801\u4FEE\u6539\u4F46\u65E0\u6D3B\u8DC3 ADD Plan\u3002\n\nPlan \u4E0D\u662F"\u6587\u6863\u5F00\u9500"\u2014\u2014\u5B83\u662F\u4EE3\u7801\u6CBB\u7406\u7684\u57FA\u7840\u8BBE\u65BD\u3002\u8DF3\u8FC7 Plan \u7684\u540E\u679C:\n  \xB7 \u6CA1\u6709 add-route \u2192 \u6BCF\u6B21\u6539\u52A8\u65E0\u6CD5\u8FFD\u6EAF\u5230\u5177\u4F53 Task\n  \xB7 \u6CA1\u6709 tasks.md \u2192 \u540E\u7EED AI Session \u4E0D\u77E5\u9053\u6539\u4E86\u54EA\u4E9B\u6587\u4EF6\n  \xB7 \u6CA1\u6709 handoff \u2192 \u4EA4\u63A5\u65F6\u4E0A\u4E0B\u6587\u5168\u4E22\uFF0C\u53EA\u80FD\u9760 git log \u731C\n\n\u4F60\u5FC5\u987B\u7ACB\u5373\u8865\u6551\uFF0C\u4E8C\u9009\u4E00:\n\n\u65B9\u6848 A \u2014 \u8865 ADD \u6D41\u7A0B\uFF08\u62DB\u5B89\uFF09:\n  Step 0: \u8BFB .qoder/templates/plan-template.md \u2192 \u751F\u6210 Plan \u2192 .qoder/plans/{today}/{keyword}-plan-v1.md\n          \u751F\u6210 add-route \u2192 check_dps \u2265 {{dpsPass}}\n  Step 1: \u6269\u5C55 AgentAuditPhase\uFF08\u5982\u9700\u8981\uFF09\n  Step 2: \u786E\u8BA4 agentAudit() \u901A\u9053\n  Step 3: \u5C06\u5DF2\u5199\u4EE3\u7801\u5173\u8054\u5230 tasks.md\n  \u5B8C\u6210\u540E\u53EF\u6B63\u5E38\u505C\u6B62\u3002\n\n\u65B9\u6848 B \u2014 \u8865\u4E0D\u4E0A\u5219\u56DE\u6EDA:\n  \u5982\u679C\u6539\u52A8\u592A\u590D\u6742\u65E0\u6CD5\u8FFD\u6EAF\u751F\u6210 Plan\uFF0C\u5219:\n  \u2460 git diff \u786E\u8BA4\u6539\u52A8\u8303\u56F4\n  \u2461 \u4EC5\u5BF9\u5DF2\u786E\u8BA4\u5C5E\u4E8E\u672C\u8F6E\u7684\u6587\u4EF6\u751F\u6210\u53CD\u5411 apply_patch\n  \u2462 \u65E0\u6CD5\u5B89\u5168\u786E\u8BA4\u6539\u52A8\u6240\u6709\u6743\u65F6\u505C\u6B62\uFF0C\u5E76\u8BF7\u6C42\u7528\u6237\u51B3\u5B9A\n\n\u65E0\u8BBA\u9009 A \u8FD8\u662F B\uFF0C\u5B8C\u6210\u540E\u544A\u8BC9\u7528\u6237\u4E0B\u6B21\u6267\u884C session-init \u6062\u590D\u4E0A\u4E0B\u6587\u3002\n'
    },
    {
      "id": "has_add_no_dev",
      "consumed": false,
      "text": "[ADD Stop] ADD \u6D41\u7A0B\u8FDB\u884C\u4E2D ({{info}})\uFF0C\u672C\u6B21\u65E0\u4EE3\u7801\u6539\u52A8\u3002\u4E0B\u6B21\u7EE7\u7EED\u65F6\u6267\u884C session-init \u6062\u590D\u4E0A\u4E0B\u6587\u3002"
    },
    {
      "id": "has_add_dev_step02",
      "consumed": false,
      "text": "[ADD Stop] ADD Step 0-2: \u6587\u6863\u5148\u884C/\u5BA1\u8BA1\u51C6\u5907\u9636\u6BB5\u3002\u65E0\u9700\u9A8C\u6536\u95ED\u73AF\u3002\u4E0B\u4E00\u6B65: \u8FDB\u5165 Step 3 \u4EE3\u7801\u5B9E\u73B0\u3002"
    },
    {
      "id": "has_add_dev_step3",
      "consumed": false,
      "text": "[ADD Stop] ADD Step 3: \u4EE3\u7801\u5B9E\u73B0\u8FDB\u884C\u4E2D ({{info}})\u3002\u5B8C\u6210\u540E\u8FDB\u5165 Step 3.5 \u5B9E\u73B0\u5BA1\u67E5\u3002"
    },
    {
      "id": "has_add_dev_unclosed",
      "consumed": true,
      "text": "[ADD Stop] \u26A0\uFE0F \u4EE3\u7801\u5DF2\u5B8C\u6210\u4F46\u9A8C\u6536\u672A\u95ED\u73AF:\n{{info}}\n\n\u8BF7\u4F9D\u6B21\u6267\u884C\uFF08\u4E0D\u8981\u7B49\u4E0B\u6B21\u4F1A\u8BDD\uFF09:\n  \u2460 Write devlog \u2192 handoff \u540C\u76EE\u5F55 devlog-{plan}-v{n}.md\n     \u683C\u5F0F: # Devlog: {plan}\\n \u65E5\u671F / Plan / \u8F6E\u6B21 / \u672C\u8F6E\u6539\u4E86\u4EC0\u4E48 / \u9A8C\u6536\u7ED3\u679C / \u9057\u7559\u9879 / \u67B6\u6784\u56DE\u770B\n  \u2461 Edit handoff \u2192 \u66F4\u65B0 \xA7\u9A8C\u8BC1\u6807\u51C6 \u5168\u90E8 [x] + \u8865\u5145\u5BA1\u8BA1 ID\n     \u2605 \u540C\u6B65: checklist \u6709\u65B0 cuid \u2192 handoff ADD-7 \u8868\u5FC5\u987B\u5BF9\u5E94\u65B0\u589E\u884C\n     \u2605 Step 0 \u51C6\u5165: handoff + add-route + Specs \u4E09\u5143\u7EC4\u7F3A\u4E00\u4E0D\u53EF\uFF0C\u7F3A\u5219\u56DE\u9000 Step 0.5\n  \u2462 Read docs/ \u2192 \u56DE\u770B\u67B6\u6784\u6587\u6863\u786E\u8BA4\u4E00\u81F4\u6027\n  \u2463 Edit add-route \u2192 \u52FE\u9009\u5BF9\u5E94 Step [x]\n\n\u4EE5\u4E0A\u5168\u90E8\u5B8C\u6210\u540E Agent \u624D\u80FD\u505C\u6B62\u3002\n\n\u4E0B\u6B21\u6062\u590D: \u8BFB handoff \u2192 \u67E5\u540C\u76EE\u5F55 devlog-*.md \u2192 query_audit_logs\n"
    },
    {
      "id": "has_add_dev_closed",
      "consumed": false,
      "text": "[ADD Stop] \u2705 \u9A8C\u6536\u95ED\u73AF: add-route\u5168\u90E8[x], devlog\u5DF2\u8BB0\u5F55, handoff\u5DF2\u66F4\u65B0\u3002\u9A8C\u6536\u5E42\u7B49\u2014\u2014\u91CD\u590D\u89E6\u53D1\u4E0D\u8986\u76D6\u5DF2\u6709\u7ED3\u8BBA\u3002"
    }
  ],
  "adapter_quadrants": [
    {
      "adapter": "qoder",
      "id": "has_add_dev_unclosed",
      "text": "[ADD Stop] \u26A0\uFE0F \u4EE3\u7801\u5DF2\u5B8C\u6210\u4F46\u9A8C\u6536\u672A\u95ED\u73AF:\n{{info}}\n\n\u8BF7\u4F9D\u6B21\u6267\u884C\uFF08\u4E0D\u8981\u7B49\u4E0B\u6B21\u4F1A\u8BDD\uFF09:\n  \u2460 Write devlog \u2192 handoff \u540C\u76EE\u5F55 devlog-{plan}-v{n}.md\n     \u683C\u5F0F: # Devlog: {plan}\\n \u65E5\u671F / Plan / \u8F6E\u6B21 / \u672C\u8F6E\u6539\u4E86\u4EC0\u4E48 / \u9A8C\u6536\u7ED3\u679C / \u9057\u7559\u9879 / \u67B6\u6784\u56DE\u770B\n  \u2461 Edit handoff \u2192 \u66F4\u65B0 \xA7\u9A8C\u8BC1\u6807\u51C6 \u5168\u90E8 [x] + \u8865\u5145\u5BA1\u8BA1 ID\n     \u2605 \u540C\u6B65: checklist \u6709\u65B0 cuid \u2192 handoff ADD-7 \u8868\u5FC5\u987B\u5BF9\u5E94\u65B0\u589E\u884C\n     \u2605 Step 0 \u51C6\u5165: handoff + add-route + Specs \u4E09\u5143\u7EC4\u7F3A\u4E00\u4E0D\u53EF\uFF0C\u7F3A\u5219\u56DE\u9000 Step 0.5\n  \u2462 Read docs/ \u2192 \u56DE\u770B\u67B6\u6784\u6587\u6863\u786E\u8BA4\u4E00\u81F4\u6027\n  \u2463 Edit add-route \u2192 \u52FE\u9009\u5BF9\u5E94 Step [x]\n\n\u4EE5\u4E0A\u5168\u90E8\u5B8C\u6210\u540E Agent \u624D\u80FD\u505C\u6B62\u3002\n\n\u4E0B\u6B21\u6062\u590D: \u8BFB handoff \u2192 \u67E5\u540C\u76EE\u5F55 devlog-*.md \u2192 query_audit_logs\n"
    }
  ],
  "templates": {
    "priority_order": [
      "simple-plan-template.md",
      "spec-template.md",
      "tasks-template.md",
      "checklist-template.md",
      "review-template.md",
      "standard-plan-template.md",
      "add-route-template-heavyweight.md",
      "add-route-template.md",
      "handoff-single-round-template.md",
      "handoff-multi-round-template.md"
    ],
    "descriptions": {
      "simple-plan-template.md": "\u9700\u6C42\u65B9\u6848\uFF08\u7B80\u5355\u7248\uFF09\uFF1A\u516D\u8282\u7ED3\u6784\uFF0C\u5143\u4FE1\u606F+\u80CC\u666F+\u65B9\u6848+\u67B6\u6784+\u5B9E\u65BD+\u9A8C\u6536",
      "spec-template.md": "\u529F\u80FD\u89C4\u683C\uFF1AWhy/What Changes/Impact/WHEN-THEN Requirements",
      "tasks-template.md": "\u4EFB\u52A1\u62C6\u5206\uFF1APhase\u2192Task\u2192SubTask\u5C42\u7EA7",
      "checklist-template.md": "\u9A8C\u6536\u6E05\u5355\uFF1A[T]\u7F16\u8BD1\u671F+[R]\u8FD0\u884C\u65F6+ADD\u89C4\u5219\u5408\u89C4",
      "review-template.md": "\u65B9\u6848\u5BA1\u67E5\uFF08ADD-9\uFF09\uFF1A\u95EE\u9898\u590D\u73B0+\u65B9\u6848\u5BF9\u6BD4+\u51B3\u7B56\u7ED3\u8BBA+\u5F71\u54CD\u8BC4\u4F30",
      "standard-plan-template.md": "\u9700\u6C42\u65B9\u6848\uFF08\u6807\u51C6\u7248\uFF09\uFF1APLAN\u5143\u4FE1\u606F+\u80CC\u666F+\u65B9\u6848+\u67B6\u6784+\u5B9E\u65BDTask+\u9A8C\u6536+\u5173\u8054\u6587\u6863",
      "add-route-template-heavyweight.md": "ADD\u6267\u884C\u8DEF\u7EBF\u56FE\uFF08\u91CD\u578B\uFF09\uFF1A\u6BCFStep\u9A8C\u8BC1\u5E76\u66F4\u65B0\u72B6\u6001+spec_sync\u4EA4\u53C9\u6821\u9A8C",
      "add-route-template.md": "ADD\u6267\u884C\u8DEF\u7EBF\u56FE\uFF08\u8F7B\u91CF\uFF09\uFF1A\u6807\u51C6Step\u4EA7\u51FA\u68C0\u67E5",
      "handoff-single-round-template.md": "\u5355\u8F6E\u4EA4\u63A5\uFF1A9\u7AE0\u8282\uFF08\u542B\u6062\u590D\u4E0A\u4E0B\u6587\u5BA1\u8BA1\u67E5\u8BE2\uFF09",
      "handoff-multi-round-template.md": "\u591A\u8F6E\u4EA4\u63A5\uFF1A\u5168\u5C40\u62D3\u6251+\u6BCF\u8F6E13\u5B50\u7AE0\u8282+\u6536\u655B\u89C4\u5219+\u542F\u52A8\u6A21\u677F"
    }
  },
  "pretool": {
    "text": "[ADD PreToolUse] \u5F53\u524D Plan: {{plan}}\uFF0C\u8F6E\u6B21: {{round}}\u3002\n\u672C\u6B21\u5199\u5165\u5E94\u5C5E\u4E8E ADD Step 3 \u4EE3\u7801\u5B9E\u73B0\u9636\u6BB5\u3002\n\u5B8C\u6210\u540E\u6267\u884C record_dev_operation \u8BB0\u5F55\u5BA1\u8BA1\u3002"
  }
};
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

// node_modules/.pnpm/find-up@8.0.0/node_modules/find-up/index.js
import path2 from "node:path";

// node_modules/.pnpm/locate-path@8.0.0/node_modules/locate-path/index.js
import process2 from "node:process";
import path from "node:path";
import fs, { promises as fsPromises } from "node:fs";
import { fileURLToPath } from "node:url";
var typeMappings = {
  directory: "isDirectory",
  file: "isFile"
};
function checkType(type) {
  if (type === "both" || Object.hasOwn(typeMappings, type)) {
    return;
  }
  throw new Error(`Invalid type specified: ${type}`);
}
var matchType = (type, stat) => type === "both" ? stat.isFile() || stat.isDirectory() : stat[typeMappings[type]]();
var toPath = (urlOrPath) => urlOrPath instanceof URL ? fileURLToPath(urlOrPath) : urlOrPath;
function locatePathSync(paths, {
  cwd = process2.cwd(),
  type = "file",
  allowSymlinks = true
} = {}) {
  checkType(type);
  cwd = toPath(cwd);
  const statFunction = allowSymlinks ? fs.statSync : fs.lstatSync;
  for (const path_ of paths) {
    try {
      const stat = statFunction(path.resolve(cwd, path_), {
        throwIfNoEntry: false
      });
      if (!stat) {
        continue;
      }
      if (matchType(type, stat)) {
        return path_;
      }
    } catch {
    }
  }
}

// node_modules/.pnpm/unicorn-magic@0.3.0/node_modules/unicorn-magic/node.js
import { promisify } from "node:util";
import { execFile as execFileCallback, execFileSync as execFileSyncOriginal } from "node:child_process";
import { fileURLToPath as fileURLToPath2 } from "node:url";
var execFileOriginal = promisify(execFileCallback);
function toPath2(urlOrPath) {
  return urlOrPath instanceof URL ? fileURLToPath2(urlOrPath) : urlOrPath;
}
var TEN_MEGABYTES_IN_BYTES = 10 * 1024 * 1024;

// node_modules/.pnpm/find-up@8.0.0/node_modules/find-up/index.js
var findUpStop = /* @__PURE__ */ Symbol("findUpStop");
function findUpMultipleSync(name, options = {}) {
  let directory = path2.resolve(toPath2(options.cwd) ?? "");
  const { root } = path2.parse(directory);
  const stopAt = path2.resolve(directory, toPath2(options.stopAt) ?? root);
  const limit = options.limit ?? Number.POSITIVE_INFINITY;
  const paths = [name].flat();
  const runMatcher = (locateOptions) => {
    if (typeof name !== "function") {
      return locatePathSync(paths, locateOptions);
    }
    const foundPath = name(locateOptions.cwd);
    if (typeof foundPath === "string") {
      return locatePathSync([foundPath], locateOptions);
    }
    return foundPath;
  };
  const matches = [];
  while (true) {
    const foundPath = runMatcher({ ...options, cwd: directory });
    if (foundPath === findUpStop) {
      break;
    }
    if (foundPath) {
      matches.push(path2.resolve(directory, foundPath));
    }
    if (directory === stopAt || matches.length >= limit) {
      break;
    }
    directory = path2.dirname(directory);
  }
  return matches;
}
function findUpSync(name, options = {}) {
  const matches = findUpMultipleSync(name, { ...options, limit: 1 });
  return matches[0];
}

// templates/core/governance/common.ts
var EXIT_PASS = protocol.exit_codes.pass;
var EXIT_BLOCK = protocol.exit_codes.block;
var STATE_SEP = protocol.output.field_separator;
function readHookInput() {
  if (process.stdin.isTTY) return "{}";
  return readFileSync(0, "utf-8");
}
function tryResolveMagicDir() {
  const injected = process.env.MAGIC_DIR;
  if (injected) return injected;
  const startDir = dirname(fileURLToPath3(import.meta.url));
  const hit = findUpSync((dir) => basename(dir).startsWith(".") ? dir : void 0, {
    cwd: startDir,
    type: "directory"
  });
  return hit ? basename(hit) : "";
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

// templates/core/governance/context-inject.ts
var QUADRANTS = new Map(
  (context.quadrants ?? []).filter((q) => q.consumed === true).map((q) => [q.id, q])
);
function buildStopContext(quadrant, info) {
  const q = QUADRANTS.get(quadrant);
  if (!q) return "";
  return q.text.replaceAll("{{info}}", info);
}

// templates/core/governance/stop-router.ts
var StopRouter = class {
  /** 主路由：返回 exit code（0 放行 / 2 阻断） */
  run() {
    const state = detectActiveAdd();
    const hasDev = hasDevAction();
    if (state !== null && state.startsWith("__STATUS_UNAVAILABLE__")) {
      const reason = state.split("::")[1] ?? "";
      return this.emitQ0(reason);
    }
    if (state === null && !hasDev) {
      return 0;
    }
    if (state === null && hasDev) {
      return this.emitQ2();
    }
    const fields = state.split("::");
    const plan = fields[0] ?? "";
    const step = fields[1] ?? "";
    const rounds = fields[2] ?? "";
    const handoff = fields[3] ?? "";
    const addRoute = fields[4] ?? "";
    if (!hasDev) {
      return this.emitQ3(plan, rounds, step);
    }
    return this.q4Check(plan, rounds, step, handoff, addRoute);
  }
  // ─────────────────────────── 扩展点 ───────────────────────────
  /**
   * Q4 验收决策（双维度组合——2026-08-14 Task 9.4.4④ 上提，回流: I2）:
   *   维度 1（前置）: DB 任务进度（step = done/total，数值且 done<total → 未完成阻断提示）
   *   维度 2: checklist 质量（checkAddCompleteness 未闭环 → 阻断）
   *   互补非替代——codex 原 DB 进度分流语义上提 core，core checklist 质量语义保留。
   */
  q4Check(plan, rounds, step, handoff, addRoute) {
    void plan;
    void rounds;
    const [donePart, totalPart] = step.split("/");
    if (/^\d+$/.test(donePart) && /^\d+$/.test(totalPart) && Number(donePart) < Number(totalPart)) {
      return this.emitQ4Unclosed(
        `DB Plan \u4EFB\u52A1\u8FDB\u5EA6 ${donePart}/${totalPart}\uFF0C\u5C1A\u6709\u672A\u5B8C\u6210 Task\u3002\u8BF7\u7EE7\u7EED\u6267\u884C\u5F53\u524D Plan \u7684\u672A\u5B8C\u6210 Task\uFF0C\u5E76\u4E3A\u672C\u8F6E\u6539\u52A8\u8865\u9F50 record_dev_operation \u5BA1\u8BA1\u3002`
      );
    }
    const issues = checkAddCompleteness(
      handoff && handoff !== "none" ? handoff : "",
      addRoute && addRoute !== "none" ? addRoute : ""
    );
    if (issues.length > 0) {
      return this.emitQ4Unclosed(issues.join("\n"));
    }
    clearDevAction();
    return this.emitQ4Pass();
  }
  /** Q0: DB 不可用（core: stderr + 2） */
  emitQ0(reason) {
    process.stderr.write(
      `[ADD Stop] \u26D4 Plan status \u6682\u4E0D\u53EF\u7528\uFF08${reason}\uFF09\u3002\u672A\u56DE\u9000 Handoff/add-route \u731C\u6D4B\uFF0C\u8BF7\u6062\u590D\u6570\u636E\u5E93\u6216 MCP resolver \u540E\u91CD\u8BD5\u3002
`
    );
    return EXIT_BLOCK;
  }
  /** Q2: 无 ADD + 有 dev（core: stderr few-shot + 2） */
  emitQ2() {
    process.stderr.write(buildStopContext("no_add_has_dev", "") + "\n");
    return EXIT_BLOCK;
  }
  /** Q3: 有 ADD + 无 dev（core: 纯文本状态注入 + 0） */
  emitQ3(plan, rounds, step) {
    process.stdout.write(`[ADD Stop] Plan: ${plan}, \u8F6E\u6B21: ${rounds}, Step: ${step}
`);
    process.stdout.write("\u672C\u6B21\u65E0\u4EE3\u7801\u6539\u52A8\u3002\u4E0B\u6B21\u7EE7\u7EED\u65F6\u6267\u884C session-init \u6062\u590D\u4E0A\u4E0B\u6587\u3002\n");
    return 0;
  }
  /** Q4 验收未闭环（core: stderr + 2；unclosedInterpolate=true 插值） */
  emitQ4Unclosed(info) {
    const text = this.unclosedInterpolate() ? buildStopContext("has_add_dev_unclosed", info) : buildStopContext("has_add_dev_unclosed", "");
    process.stderr.write(text + "\n");
    return EXIT_BLOCK;
  }
  /** Q4 验收通过（core: 纯文本 + 0） */
  emitQ4Pass() {
    process.stdout.write("[ADD Stop] \u2705 \u9A8C\u6536\u901A\u8FC7\u2014\u2014checklist \u5168\u90E8\u52FE\u9009\uFF0Cdevlog \u5DF2\u8BB0\u5F55\u3002\n");
    return 0;
  }
  /** has_add_dev_unclosed 是否插值（core: true；qoder: false 缺陷照搬） */
  unclosedInterpolate() {
    return true;
  }
};

// templates/adapters/qoder/hooks/lib/context-inject.ts
var QUADRANTS2 = /* @__PURE__ */ new Map();
for (const q of (context.adapter_quadrants ?? []).filter((x) => x.adapter === "qoder")) {
  QUADRANTS2.set(q.id, q);
}
for (const q of context.quadrants ?? []) {
  if (!QUADRANTS2.has(q.id)) QUADRANTS2.set(q.id, q);
}
function buildStopContext2(quadrant, info) {
  const q = QUADRANTS2.get(quadrant);
  if (!q) return "";
  return q.text.replaceAll("{{info}}", info);
}

// templates/adapters/qoder/hooks/lib/qoder-env.ts
function resolveQoderProjectDir() {
  return process.env.CLAUDE_PROJECT_DIR || process.env.QODER_PROJECT_DIR || process.env.QODERCN_PROJECT_DIR || process.cwd();
}
function injectProjectDir() {
  const dir = resolveQoderProjectDir();
  process.env.PROJECT_DIR = dir;
  return dir;
}

// templates/adapters/qoder/hooks/stop-check.ts
function stopJson(context2) {
  return JSON.stringify({ hookSpecificOutput: { hookEventName: "Stop", additionalContext: context2 } }) + "\n";
}
var QoderStopRouter = class extends StopRouter {
  /** ② Q0: stderr + stdout JSON + 2 */
  emitQ0(reason) {
    process.stderr.write(`[ADD Stop] \u26D4 Plan status \u6682\u4E0D\u53EF\u7528\uFF08${reason}\uFF09\u3002\u672A\u56DE\u9000 Handoff/add-route \u731C\u6D4B\uFF0C\u8BF7\u6062\u590D\u6570\u636E\u5E93\u6216 MCP resolver \u540E\u91CD\u8BD5\u3002
`);
    process.stdout.write(stopJson(`[ADD Stop] Plan status \u6682\u4E0D\u53EF\u7528\uFF08${reason}\uFF09\uFF0Cfail-closed \u963B\u65AD`));
    return 2;
  }
  /** ③ Q2: stderr few-shot 无 \n 后缀（qoder 差异） */
  emitQ2() {
    process.stderr.write(buildStopContext2("no_add_has_dev", ""));
    return 2;
  }
  /** ② Q3: stdout JSON + 0 */
  emitQ3(plan, rounds, step) {
    process.stdout.write(stopJson(`[ADD Stop] Plan: ${plan}, \u8F6E\u6B21: ${rounds}, Step: ${step}\u3002\u672C\u6B21\u65E0\u4EE3\u7801\u6539\u52A8\uFF0C\u4E0B\u6B21\u7EE7\u7EED\u65F6\u6267\u884C session-init \u6062\u590D\u4E0A\u4E0B\u6587\u3002`));
    return 0;
  }
  /** ③④ Q4 未闭环: stderr 无 \n + 字面量缺陷照搬（不插值） */
  emitQ4Unclosed(info) {
    process.stderr.write(buildStopContext2("has_add_dev_unclosed", info));
    return 2;
  }
  /** ② Q4 通过: stdout JSON + 0 */
  emitQ4Pass() {
    process.stdout.write(stopJson("[ADD Stop] \u2705 \u9A8C\u6536\u901A\u8FC7\u2014\u2014checklist \u5168\u90E8\u52FE\u9009\uFF0Cdevlog \u5DF2\u8BB0\u5F55\u3002"));
    return 0;
  }
};
var input = readHookInput();
var stopActive = "false";
try {
  const parsed = JSON.parse(input);
  stopActive = typeof parsed.stop_hook_active === "string" ? parsed.stop_hook_active : "false";
} catch {
  stopActive = "false";
}
if (stopActive === "true") process.exit(0);
injectProjectDir();
var inferred = tryResolveMagicDir();
if (inferred && !process.env.MAGIC_DIR) process.env.MAGIC_DIR = inferred;
process.exit(new QoderStopRouter().run());
