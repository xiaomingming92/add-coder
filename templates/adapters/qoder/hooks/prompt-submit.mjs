// templates/core/governance/common.ts
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath as fileURLToPath3 } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

// templates/core/governance/rules.ts
var event = {
  "file": {
    "path": "{magicDir}/reports/hook-events.jsonl",
    "rotate_bytes": 262144,
    "total_bytes": 524288,
    "note": "MCP Server \u5B95\u673A\u4E0D\u4E22\u4E8B\u4EF6\uFF0C\u91CD\u542F\u540E\u4ECE\u6587\u4EF6\u6062\u590D\u6D88\u8D39"
  },
  "schema": {
    "fields": [
      "ts",
      "hook",
      "decision",
      "cmd",
      "reason",
      "planKeyword",
      "planStatus"
    ],
    "ts_format": "date -u +%Y-%m-%dT%H:%M:%SZ",
    "extra_fields": [
      "anchor_hit",
      "struct_score",
      "override"
    ]
  },
  "daily": {
    "warn_threshold": 10
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
function jsonGet(json, field) {
  const re = new RegExp(`"${field}"\\s*:\\s*"([^"]*)"`);
  const m = re.exec(json);
  return m?.[1] ?? "";
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
function isAlreadyAccepted(addRoute, handoff) {
  if (addRoute && existsSync(addRoute)) {
    const content = readFileSync(addRoute, "utf-8");
    const step8 = content.match(/Step 8[\s\S]{0,2000}/)?.[0] ?? "";
    if (/\[x\].*验证并更新项目状态/.test(step8)) {
      if (handoff && existsSync(handoff)) {
        const h = readFileSync(handoff, "utf-8");
        if (/✅.*验收|收敛|全部闭环|全部.*完成/.test(h)) {
          return true;
        }
      }
    }
  }
  return false;
}

// templates/core/governance/prompt-router.ts
import { existsSync as existsSync4, readFileSync as readFileSync3 } from "node:fs";
import { join as join4 } from "node:path";
import { spawnSync as spawnSync2 } from "node:child_process";

// templates/core/governance/vocabulary.ts
import { existsSync as existsSync2, readFileSync as readFileSync2 } from "node:fs";
import { join as join2 } from "node:path";
function serializeTrigger(e) {
  return `${e.priority}::${e.regex}::${e.action}`;
}
function vocabularyFile() {
  const magicDir = tryResolveMagicDir();
  if (!magicDir) return "";
  return join2(
    process.env.PROJECT_DIR || process.cwd(),
    magicDir,
    "vocabulary",
    "add-governance-vocabulary.md"
  );
}
function mapTableRow(line, map) {
  const cells = line.split("|");
  const prio = cells[1]?.trim() ?? "";
  const rawTrigger = cells[2] ?? "";
  const action = cells[3]?.trim() ?? "";
  const trigger = rawTrigger.replace(/`/g, "").replace(/ *\/ */g, "|").trim();
  if (!trigger) return null;
  return map(prio, trigger, action);
}
function loadTriggers() {
  const file = vocabularyFile();
  if (!file || !existsSync2(file)) return [];
  const lines = readFileSync2(file, "utf-8").split("\n");
  const out = [];
  let inRange = false;
  for (const line of lines) {
    if (/^## 类别 A: 文档类型/.test(line)) inRange = true;
    if (/^## 类别 [G-Z]/.test(line)) inRange = false;
    if (!inRange) continue;
    if (!/^\| (P0|P1|P2) /.test(line)) continue;
    const entry = mapTableRow(line, (priority, regex, action) => ({ priority, regex, action }));
    if (entry) out.push(entry);
  }
  return out;
}
function isDevKeywordLine(regex) {
  return /修\.?bug|fix\.?bug/i.test(regex);
}
function matchTrigger(prompt) {
  return loadTriggers().flatMap(({ regex, action }) => {
    if (isDevKeywordLine(regex)) return [];
    try {
      return new RegExp(regex, "i").test(prompt) ? [`[ADD \u89E6\u53D1] ${regex} \u2192 ${action}`] : [];
    } catch {
      return [];
    }
  });
}
function loadDevKeywords() {
  return loadTriggers().filter((e) => serializeTrigger(e).includes("\u5F00\u53D1|\u6539\u529F\u80FD")).map((e) => e.regex);
}

// templates/core/governance/notify.ts
import { existsSync as existsSync3, mkdirSync, renameSync, statSync, appendFileSync } from "node:fs";
import { join as join3 } from "node:path";
function writeHookEvent(hook, decision, cmd, reason, plan = "unknown", status = "none", extra = "", magicDirOverride) {
  const defaults = protocol.adapter_defaults;
  const fallback = defaults?.magic_dir_fallback ?? ".qoder";
  const dir = join3(magicDirOverride ?? (process.env.MAGIC_DIR || fallback), "reports");
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
  }
  const file = join3(dir, "hook-events.jsonl");
  if (existsSync3(file)) {
    let sz = 0;
    try {
      sz = statSync(file).size;
    } catch {
      sz = 0;
    }
    if (sz > event.file.rotate_bytes) {
      try {
        renameSync(file, `${file}.old`);
      } catch {
      }
    }
  }
  const ts = (/* @__PURE__ */ new Date()).toISOString().replace(/\.\d+Z$/, "Z");
  const extraPart = extra ? `,${extra}` : "";
  const line = `{"ts":"${ts}","hook":"${hook}","decision":"${decision}","cmd":"${cmd}","reason":"${reason}","planKeyword":"${plan}","planStatus":"${status}"${extraPart}}
`;
  appendFileSync(file, line);
}

// templates/core/governance/prompt-router.ts
var PromptRouter = class {
  magicDir;
  constructor(magicDir) {
    this.magicDir = magicDir;
  }
  // ─────────────────────────── 扩展点 ───────────────────────────
  /** prompt 提取（core: jsonGet） */
  extractPrompt(input2) {
    return jsonGet(input2, "prompt");
  }
  /** 验收幂等文本（core 协议: 6 行含 ★ 同步检查） */
  acceptedText() {
    return `[ADD \u9A8C\u6536] \u26A0\uFE0F \u5DF2\u9A8C\u6536\u3002\u8FDB\u5165 Review \u6A21\u5F0F:
  \u2460 \u91CD\u65B0\u68C0\u67E5 checklist [T]/[R] \u9879
  \u2461 \u5BA1\u67E5 audit \u8BB0\u5F55\u5B8C\u6574\u6027
  \u2462 \u5982\u6709\u5DEE\u5F02 \u2192 Review \u56DE\u6D41\u81F3 handoff\uFF08\u589E\u91CF\u66F4\u65B0\uFF0C\u4E0D\u8986\u76D6\u5DF2\u6709\u7ED3\u8BBA\uFF09
  \u2463 \u65E0\u5DEE\u5F02 \u2192 \u8BB0\u5F55 'Review \u5DF2\u786E\u8BA4\uFF0C\u65E0\u65B0\u53D1\u73B0'
  \u2605 \u540C\u6B65\u68C0\u67E5: \u5982 checklist \u6709\u65B0 cuid \u4F46 handoff \u5BA1\u8BA1\u8868\u7F3A\u5931 \u2192 \u66F4\u65B0 handoff ADD-7 \u8868 + query_audit_logs \u547D\u4EE4
`;
  }
  /** 验收后置处理（core: spawn review-checklist 子进程，输出丢弃） */
  onAccepted(handoff, addRoute) {
    const reviewScript = join4(this.magicDir, "hooks", "review-checklist.mjs");
    if (existsSync4(reviewScript)) {
      spawnSync2(process.execPath, [reviewScript, handoff, addRoute], { stdio: "ignore" });
    }
  }
  /** 开发关键词命中提示（core: 无） */
  onDevKwMatched() {
  }
  /** 开发关键词匹配（core: join("|") 单正则；qoder: 逐个正则 some） */
  devKwMatched(prompt, devKw) {
    try {
      return new RegExp(devKw.join("|"), "i").test(prompt);
    } catch {
      return false;
    }
  }
  /** Layer 2 输出通道（core: stderr） */
  layer2ToStderr() {
    return true;
  }
  /** Layer 3 状态文本（core: 单行） */
  layer3Text(plan, rounds, step, handoff) {
    return `[ADD \u72B6\u6001] Plan: ${plan}, \u8F6E\u6B21: ${rounds}, Step: ${step}, handoff: ${handoff}
`;
  }
  /** 日报告警文本（core: 含"或检查 hooks 误报"） */
  dailyWarnText(noPlan, threshold) {
    return `[Hook \u26A0\uFE0F] \u65E0 Plan \u63D0\u793A\u5DF2\u8FBE ${noPlan} \u6B21\uFF08\u2265${threshold}\uFF09\uFF0C\u5EFA\u8BAE\u521B\u5EFA Plan \u6216\u68C0\u67E5 hooks \u8BEF\u62A5
`;
  }
  /** Layer 3 附加注入（core: 无） */
  afterLayer3() {
  }
  /** 日报跳过条件（core: 不跳过；claude: MAGIC_DIR 未设置时跳过） */
  shouldSkipDaily() {
    return false;
  }
  /** 前置注入（core: 无；qoder: 无条件 "ADD workflow active" JSON） */
  preamble(_input) {
  }
  /** Layer 3 输出形态（core: 纯文本逐行；qoder: hookSpecificOutput JSON 包） */
  layer3Json() {
    return false;
  }
  /** 日报并入 Layer3 上下文（core: 独立行输出；qoder: 并入 additionalContext） */
  dailyInContext() {
    return false;
  }
  // ─────────────────────────── 流程固化 ───────────────────────────
  /** 主路由（模板方法）：返回 exit code（0 放行） */
  run(input2) {
    const prompt = this.extractPrompt(input2);
    if (prompt === "") return 0;
    this.preamble(input2);
    const matched = matchTrigger(prompt);
    if (matched.length > 0) {
      if (/验收|收敛/i.test(prompt)) {
        const addState = detectActiveAdd();
        if (addState !== null) {
          const handoff2 = addState.split("::")[3] ?? "";
          const addRoute = addState.split("::")[4] ?? "";
          if (isAlreadyAccepted(addRoute, handoff2)) {
            process.stdout.write(this.acceptedText());
            this.onAccepted(handoff2, addRoute);
            return 0;
          }
        }
      }
      for (const m of matched) process.stdout.write(m + "\n");
      return 0;
    }
    const devKw = loadDevKeywords();
    if (devKw.length === 0) return 0;
    if (!this.devKwMatched(prompt, devKw)) return 0;
    this.onDevKwMatched();
    const state = detectActiveAdd();
    if (state === null) {
      const text = `[ADD \u63D0\u793A] \u68C0\u6D4B\u5230\u5F00\u53D1\u4EFB\u52A1\uFF0C\u4F46\u65E0\u6D3B\u8DC3 ADD Plan\u3002\u5EFA\u8BAE\u5148\u6267\u884C add-paradigm SKILL:
  Step 0: \u6587\u6863\u5148\u884C (Plan \u2192 Review \u2192 Specs)
  Step 3: \u4EE3\u7801\u5B9E\u73B0 + \u5BA1\u8BA1\u690D\u5165
  Step 8: \u6536\u655B\u5224\u65AD
`;
      if (this.layer2ToStderr()) {
        process.stderr.write(text);
      } else {
        process.stdout.write(text);
      }
      writeHookEvent("prompt-submit", "info", prompt, "\u65E0\u6D3B\u8DC3 ADD Plan \u4E0B\u68C0\u6D4B\u5230\u5F00\u53D1\u4EFB\u52A1", "no-active-plan", "none");
      return 0;
    }
    const plan = state.split("::")[0] ?? "";
    const step = state.split("::")[1] ?? "";
    const rounds = state.split("::")[2] ?? "";
    const handoff = state.split("::")[3] ?? "";
    let block = this.layer3Text(plan, rounds, step, handoff);
    if (!this.shouldSkipDaily()) {
      const HOOK_JSONL = join4(this.magicDir, "reports", "hook-events.jsonl");
      if (existsSync4(HOOK_JSONL)) {
        const today = localIsoSeconds().slice(0, 10);
        const content = readFileSync3(HOOK_JSONL, "utf-8");
        const todayLines = content.split("\n").filter((l) => l.includes(`"ts":"${today}`));
        const total = todayLines.length;
        const noPlan = todayLines.filter((l) => l.includes('"planKeyword":"no-active-plan"')).length;
        if (total > 0) {
          const dailyLine = `[Hook \u6CBB\u7406] \u4ECA\u65E5\u63D0\u793A: ${total} \u6B21 | \u65E0 Plan \u63D0\u793A: ${noPlan} \u6B21`;
          const warnThreshold = event.daily.warn_threshold;
          const warnLine = noPlan >= warnThreshold ? this.dailyWarnText(noPlan, warnThreshold) : "";
          if (this.dailyInContext()) {
            block += `
${dailyLine}`;
            if (warnLine) block += `
${warnLine.trimEnd()}`;
          } else {
            process.stdout.write(dailyLine + "\n");
            if (warnLine) process.stdout.write(warnLine);
          }
        }
      }
    }
    if (this.layer3Json()) {
      process.stdout.write(
        JSON.stringify({ hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: block.trimEnd() } }) + "\n"
      );
    } else {
      process.stdout.write(block);
    }
    this.afterLayer3();
    return 0;
  }
};

// templates/core/governance/review-checklist-guard.ts
import { existsSync as existsSync5, readFileSync as readFileSync4, readdirSync } from "node:fs";
import { join as join5, basename as basename2 } from "node:path";
function checkedLines(content) {
  return content.split("\n").filter((l) => l.includes("[x]"));
}
function locateSpecFile(specRoot, planKw, name) {
  const specDir = join5(specRoot, planKw);
  const direct = join5(specDir, name);
  if (existsSync5(direct)) return direct;
  if (existsSync5(specRoot)) {
    for (const dir of readdirSync(specRoot)) {
      if (!dir.includes(planKw)) continue;
      const cand = join5(specRoot, dir, name);
      if (existsSync5(cand)) return cand;
    }
  }
  return direct;
}
function defaultSpecRoot() {
  const projectDir = process.env.PROJECT_DIR || process.cwd();
  const magicDir = tryResolveMagicDir();
  return magicDir ? join5(projectDir, magicDir, "specs") : "";
}
function checkReviewQuality(handoff, addRoute, specRoot) {
  if (handoff === "") return "";
  const projectDir = process.env.PROJECT_DIR || process.cwd();
  const planKw = basename2(handoff).replace(/-handoff.*$/, "");
  const root = specRoot ?? defaultSpecRoot();
  const checklist = locateSpecFile(root, planKw, "checklist.md");
  const tasksFile = locateSpecFile(root, planKw, "tasks.md");
  let issues = "";
  let missingDocs = "";
  if (!existsSync5(handoff)) {
    missingDocs += " Handoff";
  } else {
    const h = readFileSync4(handoff, "utf-8");
    let hSections = 0;
    if (h.includes("spec \u6587\u4EF6")) hSections++;
    if (h.includes("\u4F60\u8981\u6539\u7684\u6587\u4EF6")) hSections++;
    if (h.includes("\u9A8C\u8BC1\u6807\u51C6")) hSections++;
    if (h.includes("\u5B8C\u6210\u540E\u8BB0\u5F55 ADD-7 \u5BA1\u8BA1")) hSections++;
    if (hSections < 4) missingDocs += ` Handoff(\u7F3A\u7AE0\u8282:${hSections}/4)`;
  }
  if (!existsSync5(addRoute)) {
    missingDocs += " add-route";
  } else {
    const ar = readFileSync4(addRoute, "utf-8");
    if (!ar.includes("Task \u6620\u5C04\u8868") && !ar.includes("\u6587\u4EF6\u6E05\u5355")) {
      missingDocs += " add-route(\u7F3ATask\u6620\u5C04/\u6587\u4EF6\u6E05\u5355)";
    }
  }
  if (!existsSync5(checklist)) {
    missingDocs += " checklist";
  } else {
    const cl = readFileSync4(checklist, "utf-8");
    if (!cl.includes("[T]")) missingDocs += " checklist(\u65E0[T]\u9879)";
  }
  if (!existsSync5(tasksFile)) {
    missingDocs += " tasks";
  } else {
    const tk = readFileSync4(tasksFile, "utf-8");
    if (!/Task|\[ \]/.test(tk)) missingDocs += " tasks(\u65E0Task\u9879)";
  }
  if (missingDocs !== "") {
    return `  \u274C Step 0 \u672A\u5B8C\u6210:${missingDocs.trim().replace(/ /g, ", ")} \u6587\u4EF6\u7F3A\u5931\u3002\u56DE\u9000 Step 0.5/Step 1 \u8865\u5EFA\u540E\u518D\u8FDB\u5165\u4EE3\u7801\u5B9E\u73B0\u3002`;
  }
  if (existsSync5(checklist) && existsSync5(tasksFile)) {
    const cl = readFileSync4(checklist, "utf-8");
    const clChecked = checkedLines(cl).length;
    const clOpen = (cl.match(/\[ \]/g) || []).length;
    const tkChecked = (readFileSync4(tasksFile, "utf-8").match(/\[x\]/g) || []).length;
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
  if (existsSync5(addRoute)) {
    const ar = readFileSync4(addRoute, "utf-8");
    const arOpen = (ar.match(/\[ \]/g) || []).length;
    if (arOpen > 0) {
      issues += `  \u26A0\uFE0F add-route ${arOpen} Step \u672A\u95ED\u73AF
`;
    }
  }
  if (existsSync5(handoff) && existsSync5(checklist)) {
    const h = readFileSync4(handoff, "utf-8");
    const cl = readFileSync4(checklist, "utf-8");
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

// templates/adapters/qoder/hooks/lib/qoder-env.ts
function resolveQoderProjectDir() {
  return process.env.CLAUDE_PROJECT_DIR || process.env.QODER_PROJECT_DIR || process.env.QODERCN_PROJECT_DIR || process.cwd();
}
function injectProjectDir() {
  const dir = resolveQoderProjectDir();
  process.env.PROJECT_DIR = dir;
  return dir;
}

// templates/adapters/qoder/hooks/prompt-submit.ts
injectProjectDir();
var inferred = tryResolveMagicDir();
if (inferred && !process.env.MAGIC_DIR) process.env.MAGIC_DIR = inferred;
var MAGIC_DIR = process.env.MAGIC_DIR ?? ".qoder";
var QoderPromptRouter = class extends PromptRouter {
  /** ① 前置注入: 无条件 JSON（Qoder CN IDE stdout JSON 注入模型上下文） */
  preamble(_input) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "UserPromptSubmit",
          additionalContext: "ADD workflow active. Templates preloaded. Use add-paradigm SKILL."
        }
      }) + "\n"
    );
  }
  /** ② 验收后置: checklist 质量检查内存调用（bash 外部调用 → TS 内存调用，stdout 直出行为等价） */
  onAccepted(handoff, addRoute) {
    process.stdout.write(checkReviewQuality(handoff, addRoute) + "\n");
  }
  /** ③ 开发关键词匹配: 逐个正则 some */
  devKwMatched(prompt, devKw) {
    return devKw.some((kw) => {
      try {
        return new RegExp(kw, "i").test(prompt);
      } catch {
        return false;
      }
    });
  }
  /** ④ Layer3 JSON 输出 */
  layer3Json() {
    return true;
  }
  /** ⑤ 日报并入 additionalContext */
  dailyInContext() {
    return true;
  }
  /** ⑥ 日报告警文本（无"或检查 hooks 误报"） */
  dailyWarnText(noPlan, threshold) {
    return `[Hook \u26A0\uFE0F] \u65E0 Plan \u63D0\u793A\u5DF2\u8FBE ${noPlan} \u6B21\uFF08\u2265${threshold}\uFF09\uFF0C\u5EFA\u8BAE\u521B\u5EFA Plan`;
  }
};
var input = readHookInput();
process.exit(new QoderPromptRouter(MAGIC_DIR).run(input));
