// templates/core/governance/review-checklist-guard.ts
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join as join2, basename as basename2 } from "node:path";

// templates/core/governance/common.ts
import { basename, dirname, join } from "node:path";
import { fileURLToPath as fileURLToPath3 } from "node:url";
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
function projectHash() {
  try {
    return createHash("md5").update(`${process.env.PROJECT_DIR || process.cwd()}
`).digest("hex").slice(0, 8);
  } catch {
    return "default";
  }
}
var DEV_FLAG = `/tmp/add_dev_${projectHash()}`;

// templates/core/governance/review-checklist-guard.ts
function checkedLines(content) {
  return content.split("\n").filter((l) => l.includes("[x]"));
}
function locateSpecFile(specRoot, planKw, name) {
  const specDir = join2(specRoot, planKw);
  const direct = join2(specDir, name);
  if (existsSync(direct)) return direct;
  if (existsSync(specRoot)) {
    for (const dir of readdirSync(specRoot)) {
      if (!dir.includes(planKw)) continue;
      const cand = join2(specRoot, dir, name);
      if (existsSync(cand)) return cand;
    }
  }
  return direct;
}
function defaultSpecRoot() {
  const projectDir = process.env.PROJECT_DIR || process.cwd();
  const magicDir = tryResolveMagicDir();
  return magicDir ? join2(projectDir, magicDir, "specs") : "";
}
function checkReviewQuality(handoff2, addRoute2, specRoot) {
  if (handoff2 === "") return "";
  const projectDir = process.env.PROJECT_DIR || process.cwd();
  const planKw = basename2(handoff2).replace(/-handoff.*$/, "");
  const root = specRoot ?? defaultSpecRoot();
  const checklist = locateSpecFile(root, planKw, "checklist.md");
  const tasksFile = locateSpecFile(root, planKw, "tasks.md");
  let issues = "";
  let missingDocs = "";
  if (!existsSync(handoff2)) {
    missingDocs += " Handoff";
  } else {
    const h = readFileSync(handoff2, "utf-8");
    let hSections = 0;
    if (h.includes("spec \u6587\u4EF6")) hSections++;
    if (h.includes("\u4F60\u8981\u6539\u7684\u6587\u4EF6")) hSections++;
    if (h.includes("\u9A8C\u8BC1\u6807\u51C6")) hSections++;
    if (h.includes("\u5B8C\u6210\u540E\u8BB0\u5F55 ADD-7 \u5BA1\u8BA1")) hSections++;
    if (hSections < 4) missingDocs += ` Handoff(\u7F3A\u7AE0\u8282:${hSections}/4)`;
  }
  if (!existsSync(addRoute2)) {
    missingDocs += " add-route";
  } else {
    const ar = readFileSync(addRoute2, "utf-8");
    if (!ar.includes("Task \u6620\u5C04\u8868") && !ar.includes("\u6587\u4EF6\u6E05\u5355")) {
      missingDocs += " add-route(\u7F3ATask\u6620\u5C04/\u6587\u4EF6\u6E05\u5355)";
    }
  }
  if (!existsSync(checklist)) {
    missingDocs += " checklist";
  } else {
    const cl = readFileSync(checklist, "utf-8");
    if (!cl.includes("[T]")) missingDocs += " checklist(\u65E0[T]\u9879)";
  }
  if (!existsSync(tasksFile)) {
    missingDocs += " tasks";
  } else {
    const tk = readFileSync(tasksFile, "utf-8");
    if (!/Task|\[ \]/.test(tk)) missingDocs += " tasks(\u65E0Task\u9879)";
  }
  if (missingDocs !== "") {
    return `  \u274C Step 0 \u672A\u5B8C\u6210:${missingDocs.trim().replace(/ /g, ", ")} \u6587\u4EF6\u7F3A\u5931\u3002\u56DE\u9000 Step 0.5/Step 1 \u8865\u5EFA\u540E\u518D\u8FDB\u5165\u4EE3\u7801\u5B9E\u73B0\u3002`;
  }
  if (existsSync(checklist) && existsSync(tasksFile)) {
    const cl = readFileSync(checklist, "utf-8");
    const clChecked = checkedLines(cl).length;
    const clOpen = (cl.match(/\[ \]/g) || []).length;
    const tkChecked = (readFileSync(tasksFile, "utf-8").match(/\[x\]/g) || []).length;
    if (clOpen > 0) {
      issues += `  \u26A0\uFE0F checklist \u6709 ${clOpen} \u9879\u672A\u52FE\u9009
`;
    }
    const tItems = (cl.match(/\[T\]/g) || []).length;
    const tChecked = checkedLines(cl).filter((l) => l.includes("[T]")).length;
    if (tItems > tChecked) {
      issues += `  \u26A0\uFE0F [T] \u7F16\u8BD1\u671F\u9A8C\u8BC1: ${tChecked}/${tItems} \u901A\u8FC7
`;
    }
    let noEvidence = 0;
    for (const line of checkedLines(cl)) {
      if (/—\s*证据:\s*\S/.test(line)) continue;
      if (/npx|tsc|vitest|grep|✅|cmq[0-9a-z]{10}|18\/18|exit.*0/.test(line)) continue;
      noEvidence++;
    }
    if (noEvidence > 0) {
      issues += `  \u274C ${noEvidence} \u9879 [x] \u7F3A\u5C11\u9A8C\u6536\u8BC1\u636E\uFF08\u9700\u9644 \u2014 \u8BC1\u636E: tsc/vitest/grep/\u5BA1\u8BA1ID \u7B49\uFF09
`;
    }
    const withAudit = checkedLines(cl).filter((l) => /cmq[a-z0-9]{10,}/.test(l)).length;
    const fakeAudit = checkedLines(cl).filter((l) => /cmq\.\.\.|cmqxxx|审计.*cmq\.\./.test(l)).length;
    if (fakeAudit > 0) {
      issues += `  \u274C ${fakeAudit} \u9879 [x] \u4F7F\u7528\u4E86\u5360\u4F4D\u7B26\u5BA1\u8BA1ID\uFF08cmq.../cmqxxx\uFF09\uFF0C\u5FC5\u987B\u8C03 record_dev_operation \u83B7\u53D6\u771F\u5B9E cuid \u540E\u66FF\u6362
`;
    }
    const withEvidence = checkedLines(cl).filter(
      (l) => /tsc|vitest|npx|grep|✅|验证|确认|compgen|审计.*cmq[a-z0-9]{10}/.test(l)
    ).length;
    if (withEvidence > 0 && withAudit === 0) {
      issues += `  \u{1F4CE} \u521D\u9A8C: ${withEvidence}/${clChecked} \u9879\u6709\u8BC1\u636E\u4F46\u672A\u5199\u5BA1\u8BA1 ID\uFF08\u9700\u8C03 record_dev_operation \u843D\u5E93\uFF09
`;
    } else if (withAudit > 0 && withAudit < clChecked) {
      issues += `  \u{1F4CE} \u590D\u9A8C: ${withAudit}/${clChecked} \u9879\u5F15\u7528\u5BA1\u8BA1 ID\u3002${withEvidence}/${clChecked} \u9879\u6709\u8BC1\u636E\u3002\u8BC1\u636E\u4E00\u81F4\u5219\u4E0D\u9700\u8FFD\u5199 devlog\u65E5\u5FD7(\u8D70mcp)
`;
    }
  }
  if (existsSync(addRoute2)) {
    const ar = readFileSync(addRoute2, "utf-8");
    const arOpen = (ar.match(/\[ \]/g) || []).length;
    if (arOpen > 0) {
      issues += `  \u26A0\uFE0F add-route ${arOpen} Step \u672A\u95ED\u73AF
`;
    }
  }
  if (existsSync(handoff2) && existsSync(checklist)) {
    const h = readFileSync(handoff2, "utf-8");
    const cl = readFileSync(checklist, "utf-8");
    const cuids = [...new Set(cl.match(/cmq[a-z0-9]{10,}/g) || [])];
    const newCuids = cuids.filter((c) => !h.includes(c));
    if (newCuids.length > 0) {
      issues += `  \u274C handoff \u5BA1\u8BA1\u8868\u672A\u540C\u6B65: ${newCuids.length} \u4E2A cuid \u5728 checklist \u4E2D\u5B58\u5728\u4F46 handoff \u4E2D\u7F3A\u5931\uFF08\u9700\u66F4\u65B0 handoff ADD-7 \u8868 + query_audit_logs \u547D\u4EE4\uFF09
`;
    }
  }
  if (issues === "") {
    return "  \u2705 Review: checklist \u8D28\u91CF\u68C0\u67E5\u901A\u8FC7";
  }
  return `  \u{1F4CB} Review \u53D1\u73B0\u95EE\u9898:
${issues}`;
}
var ReviewChecklistGuard = class {
  specRoot;
  constructor(specRoot) {
    this.specRoot = specRoot;
  }
  /** 主入口：返回 exit code（0 放行 / 1 Step 0 准入失败） */
  run(handoff2, addRoute2) {
    if (handoff2 === "") return 0;
    const out = checkReviewQuality(handoff2, addRoute2, this.specRoot);
    process.stdout.write(out + "\n");
    if (out.startsWith("  \u274C Step 0 \u672A\u5B8C\u6210")) return 1;
    return 0;
  }
};

// templates/adapters/qoder/hooks/lib/qoder-env.ts
function resolveQoderProjectDir() {
  return process.env.CLAUDE_PROJECT_DIR || process.env.QODER_PROJECT_DIR || process.env.QODERCN_PROJECT_DIR || process.cwd();
}
function injectProjectDir() {
  const dir = resolveQoderProjectDir();
  process.env.PROJECT_DIR = dir;
  return dir;
}

// templates/adapters/qoder/hooks/review-checklist.ts
var QoderReviewChecklistGuard = class extends ReviewChecklistGuard {
  /** 协议差异封装: specRoot = ".qoder/specs"（qoder 端 spec 目录） */
  constructor() {
    super(".qoder/specs");
  }
  // 当前无 override（Step 0 准入 exit 1 语义与 core 基线一致）；命名子类承载端身份 + 未来演进位
};
injectProjectDir();
var handoff = process.argv[2] ?? "";
var addRoute = process.argv[3] ?? "";
process.exit(new QoderReviewChecklistGuard().run(handoff, addRoute));
