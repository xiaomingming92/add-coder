// templates/core/governance/session-start-guard.ts
import { existsSync as existsSync3, readdirSync, statSync } from "node:fs";
import { join as join3 } from "node:path";

// templates/core/governance/common.ts
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath as fileURLToPath3 } from "node:url";
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

// templates/core/governance/preload-templates.ts
import { existsSync as existsSync2, readFileSync as readFileSync2, writeFileSync as writeFileSync2 } from "node:fs";
import { join as join2, dirname as dirname2 } from "node:path";
import { createHash as createHash2 } from "node:crypto";
import { fileURLToPath as fileURLToPath4 } from "node:url";
function stripFrontmatter(lines) {
  const out = [];
  let inFm = false;
  lines.forEach((line, idx) => {
    if (idx === 0 && line === "---") {
      inFm = true;
      return;
    }
    if (inFm && line === "---") {
      inFm = false;
      return;
    }
    if (!inFm) out.push(line);
  });
  return out;
}
function projectHash2(projectDir) {
  try {
    return createHash2("md5").update(projectDir).digest("hex").slice(0, 8);
  } catch {
    return "default";
  }
}
function parseArgs(argv) {
  const args = { mode: "index", top: 0, mark: false };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--index":
        args.mode = "index";
        break;
      case "--full":
        args.mode = "full";
        break;
      case "--top":
        args.top = Number(argv[++i] ?? "0") || 0;
        break;
      case "--mark":
        args.mark = true;
        break;
      default:
        break;
    }
  }
  return args;
}
var PreloadTemplates = class _PreloadTemplates {
  templatesDir;
  tplFlag;
  static TEMPLATES = Object.freeze({
    "simple-plan-template.md": "\u9700\u6C42\u65B9\u6848\uFF08\u7B80\u5355\u7248\uFF09\uFF1A\u516D\u8282\u7ED3\u6784\uFF0C\u5143\u4FE1\u606F+\u80CC\u666F+\u65B9\u6848+\u67B6\u6784+\u5B9E\u65BD+\u9A8C\u6536",
    "spec-template.md": "\u529F\u80FD\u89C4\u683C\uFF1AWhy/What Changes/Impact/WHEN-THEN Requirements",
    "tasks-template.md": "\u4EFB\u52A1\u62C6\u5206\uFF1APhase\u2192Task\u2192SubTask\u5C42\u7EA7",
    "checklist-template.md": "\u9A8C\u6536\u6E05\u5355\uFF1A[T]\u7F16\u8BD1\u671F+[R]\u8FD0\u884C\u65F6+ADD\u89C4\u5219\u5408\u89C4",
    "review-template.md": "\u65B9\u6848\u5BA1\u67E5\uFF08ADD-9\uFF09\uFF1A\u95EE\u9898\u590D\u73B0+\u65B9\u6848\u5BF9\u6BD4+\u51B3\u7B56\u7ED3\u8BBA+\u5F71\u54CD\u8BC4\u4F30",
    "standard-plan-template.md": "\u9700\u6C42\u65B9\u6848\uFF08\u6807\u51C6\u7248\uFF09\uFF1APLAN\u5143\u4FE1\u606F+\u80CC\u666F+\u65B9\u6848+\u67B6\u6784+\u5B9E\u65BDTask+\u9A8C\u6536+\u5173\u8054\u6587\u6863",
    "add-route-template-heavyweight.md": "ADD\u6267\u884C\u8DEF\u7EBF\u56FE\uFF08\u91CD\u578B\uFF09\uFF1A\u6BCFStep\u9A8C\u8BC1\u5E76\u66F4\u65B0\u72B6\u6001+spec_sync\u4EA4\u53C9\u6821\u9A8C",
    "add-route-template.md": "ADD\u6267\u884C\u8DEF\u7EBF\u56FE\uFF08\u8F7B\u91CF\uFF09\uFF1A\u6807\u51C6Step\u4EA7\u51FA\u68C0\u67E5",
    "handoff-single-round-template.md": "\u5355\u8F6E\u4EA4\u63A5\uFF1A9\u7AE0\u8282\uFF08\u542B\u6062\u590D\u4E0A\u4E0B\u6587\u5BA1\u8BA1\u67E5\u8BE2\uFF09",
    "handoff-multi-round-template.md": "\u591A\u8F6E\u4EA4\u63A5\uFF1A\u5168\u5C40\u62D3\u6251+\u6BCF\u8F6E13\u5B50\u7AE0\u8282+\u6536\u655B\u89C4\u5219+\u542F\u52A8\u6A21\u677F",
    "review-implementation-template.md": "\u5B9E\u73B0\u5BA1\u67E5\uFF08ADD-10\uFF09\uFF1A\u683C\u5F0F\u5951\u7EA6+\u6846\u67B6\u7248\u672C+\u6570\u636E\u6A21\u578B+E2E curl",
    "review-runtime-template.md": "\u8FD0\u884C\u65F6\u7EA0\u504F\uFF08ADD-11\uFF09\uFF1A\u53D1\u73B0\u5217\u8868+\u6839\u56E0\u5206\u6790+\u6D41\u7A0B\u6539\u8FDB\u9879",
    "prd-standard-template.md": "\u4EA7\u54C1\u9700\u6C42\u6587\u6863\uFF08\u65B0\u5EFA\uFF09\uFF1A\u80CC\u666F\u76EE\u6807+\u7528\u6237\u573A\u666F+\u529F\u80FD\u9700\u6C42+\u9A8C\u6536\u6807\u51C6",
    "prd-incremental-template.md": "\u4EA7\u54C1\u9700\u6C42\u6587\u6863\uFF08\u589E\u91CF\uFF09\uFF1A\u53D8\u66F4\u6458\u8981+diff\u5F0F\u8BB0\u5F55",
    "fix-verification-template.md": "\u4FEE\u590D\u9A8C\u8BC1\u6A21\u677F",
    "report-template.md": "\u4EE3\u7801\u5BA1\u67E5\u62A5\u544A\u6A21\u677F",
    "runtime-report-template.md": "\u8FD0\u884C\u65F6\u62A5\u544A\u6A21\u677F",
    "TERMINOLOGY.md": "\u6A21\u677F\u672F\u8BED\u901F\u67E5"
  });
  static PRIORITY_ORDER = Object.freeze([
    "simple-plan-template.md",
    "spec-template.md",
    "tasks-template.md",
    "checklist-template.md",
    "review-template.md",
    "standard-plan-template.md",
    "add-route-template-heavyweight.md",
    "add-route-template.md",
    "handoff-single-round-template.md",
    "handoff-multi-round-template.md",
    "review-implementation-template.md",
    "review-runtime-template.md",
    "prd-standard-template.md",
    "prd-incremental-template.md",
    "fix-verification-template.md",
    "report-template.md",
    "runtime-report-template.md",
    "TERMINOLOGY.md"
  ]);
  /**
   * 模板目录 find-up 解析（复用 find-up 包，与 src/shared/paths.ts projectRoot 同范式）：
   *   从 startDir 向上找第一个 templates 目录（esbuild bundle 内联，产物零依赖）：
   *     - 产物 <magicDir>/hooks/xxx.mjs → <magicDir>/templates（分发物化）
   *     - 源码 templates/core/governance/preload-templates.ts → templates/core/templates（源码模板）
   *   命中条件：目录含至少一个标准模板（防命中仓库根 templates/ 空壳）；
   *   目录存在但标准模板缺失 = 物化异常 → 返回 null，由 validate() fail-fast（不继续向上找）。
   *   缺陷修复（2026-08-14 Task 5.1）: 原写死 join(dirname, "..", "..", "templates") 固定层级，
   *   产物从 hooks/ 上溯两级到仓库根 templates/（无标准模板）——被 refresh-fixed 反写掩盖，
   *   golden 重抓暴露；改 find-up 锚点查找，层级零漂移。
   */
  static findTemplatesDir(startDir) {
    const hit = findUpSync("templates", { cwd: startDir, type: "directory" });
    if (!hit) return null;
    return _PreloadTemplates.PRIORITY_ORDER.some((t) => existsSync2(join2(hit, t))) ? hit : null;
  }
  constructor(templatesDir, tplFlag) {
    const startDir = dirname2(fileURLToPath4(import.meta.url));
    this.templatesDir = templatesDir ?? _PreloadTemplates.findTemplatesDir(startDir) ?? join2(startDir, "..", "templates");
    this.tplFlag = tplFlag ?? `/tmp/add_tpl_${projectHash2(process.env.PROJECT_DIR || process.cwd())}`;
  }
  /** 模板目录存在性校验（fail-fast：目录缺失/标准模板全缺 → 抛错，由 CLI 层转 exit 1） */
  validate() {
    if (!existsSync2(this.templatesDir)) {
      throw new Error(
        `[ADD preload] \u6A21\u677F\u76EE\u5F55\u4E0D\u5B58\u5728: ${this.templatesDir}\uFF08\u751F\u6210\u6001\u7269\u5316\u7F3A\u5931\uFF0C\u8BF7\u6267\u884C add-coder sync \u540E\u91CD\u8BD5\uFF09`
      );
    }
    const available = _PreloadTemplates.PRIORITY_ORDER.filter(
      (t) => existsSync2(join2(this.templatesDir, t))
    ).length;
    if (available === 0) {
      throw new Error(
        `[ADD preload] \u6A21\u677F\u76EE\u5F55\u4E2D\u672A\u627E\u5230 ADD \u6807\u51C6\u6A21\u677F: ${this.templatesDir}\uFF08\u7F3A\u5931\u6E05\u5355: ${_PreloadTemplates.PRIORITY_ORDER.join(" ")}\uFF09`
      );
    }
  }
  /** 读取模板内容（strip frontmatter） */
  readTemplate(file) {
    const path3 = join2(this.templatesDir, file);
    if (!existsSync2(path3)) return "";
    return stripFrontmatter(readFileSync2(path3, "utf-8").split("\n")).join("\n");
  }
  /** --index 模式输出（对齐 bash output_index 逐字） */
  index() {
    const lines = ["## ADD \u53EF\u7528\u6A21\u677F\u6E05\u5355", "", "| # | \u6A21\u677F\u6587\u4EF6 | \u7528\u9014 |", "|---|---------|------|"];
    let i = 1;
    for (const tmpl of _PreloadTemplates.PRIORITY_ORDER) {
      if (existsSync2(join2(this.templatesDir, tmpl))) {
        lines.push(`| ${i} | ${tmpl} | ${_PreloadTemplates.TEMPLATES[tmpl] ?? "\u6A21\u677F\u6587\u4EF6"} |`);
        i++;
      }
    }
    return lines.join("\n") + "\n";
  }
  /** --full 模式输出（对齐 bash output_full 逐字） */
  full(top) {
    const lines = ["## ADD \u6A21\u677F\u5168\u6587\u5185\u5BB9", ""];
    let count = 0;
    for (const tmpl of _PreloadTemplates.PRIORITY_ORDER) {
      if (!existsSync2(join2(this.templatesDir, tmpl))) continue;
      count++;
      if (top > 0 && count > top) break;
      lines.push("---", `### ${tmpl}`, "", this.readTemplate(tmpl), "");
    }
    return lines.join("\n") + "\n";
  }
  isInjected() {
    return existsSync2(this.tplFlag);
  }
  /** 标记模板已注入（tpl-injected 去重：同会话二次命中不重复注入） */
  markInjected() {
    try {
      writeFileSync2(this.tplFlag, "");
    } catch {
    }
  }
  /** CLI 入口：解析参数 → 校验 → 输出；去重命中时 stderr 提示并 exit 0 */
  run(argv) {
    const { mode, top, mark } = parseArgs(argv);
    this.validate();
    if (mode === "index") {
      process.stdout.write(this.index());
      return 0;
    }
    if (this.isInjected() && !mark) {
      process.stderr.write("[ADD preload] \u6A21\u677F\u5DF2\u5728\u672C\u4F1A\u8BDD\u6CE8\u5165\uFF0C\u8DF3\u8FC7\u91CD\u590D\u6CE8\u5165\uFF08tpl-injected \u6807\u8BB0\u5B58\u5728\uFF09\n");
      return 0;
    }
    process.stdout.write(this.full(top));
    this.markInjected();
    return 0;
  }
};

// templates/core/governance/session-start-guard.ts
var SessionStartGuard = class {
  projectDir;
  magicDir;
  constructor(projectDir) {
    this.projectDir = projectDir;
    const inferred = tryResolveMagicDir();
    if (inferred && !process.env.MAGIC_DIR) {
      process.env.MAGIC_DIR = inferred;
    }
    this.magicDir = process.env.MAGIC_DIR ?? "";
  }
  /** 主入口：返回 exit code（0） */
  run() {
    const state = detectActiveAdd();
    this.emitState(state);
    this.emitIndex();
    this.emitTodoReminder(state);
    this.emitHitlPending();
    return 0;
  }
  // ─────────────────────────── 扩展点 ───────────────────────────
  /** ① ADD 状态恢复输出（core: 纯文本块） */
  emitState(state) {
    if (state === null) return;
    const [plan, step, rounds, handoff] = state.split("::");
    process.stdout.write(`[ADD SessionStart] \u68C0\u6D4B\u5230\u6D3B\u8DC3 ADD Plan:
  Plan: ${plan}
  \u8F6E\u6B21: ${rounds}
  \u5F53\u524D Step: ${step}
  handoff: ${handoff}
  \u6062\u590D\u547D\u4EE4: query_audit_logs({ planKeyword: '${plan}' })
`);
  }
  /** ② 模板索引输出（core: 纯文本 index） */
  emitIndex() {
    try {
      process.stdout.write(new PreloadTemplates().index());
    } catch {
    }
  }
  /** ③ 代办刷新（core: 活跃 Plan 时输出提醒；claude: 无此段） */
  emitTodoReminder(state) {
    if (state !== null) {
      const plan = state.split("::")[0] ?? "";
      process.stdout.write(`[\u4EE3\u529E] \u68C0\u6D4B\u5230\u6D3B\u8DC3 Plan: ${plan}\u3002\u5982\u6709\u672A\u52A0\u8F7D\u7684 IDE \u4EE3\u529E\u6E05\u5355\uFF0C\u8BF7\u4ECE tasks.md \xA7IDE JSON \u5237\u65B0 TodoWrite\u3002
`);
    }
  }
  /** ④ HITL 待审批检测（core: 7 天内 .hitl.md 计数提示；claude: 无此段） */
  emitHitlPending() {
    const PLANS_DIR = this.magicDir ? join3(this.projectDir, this.magicDir, "plans") : "";
    if (PLANS_DIR && existsSync3(PLANS_DIR)) {
      const weekAgo = Date.now() - 7 * 864e5;
      const hitlCount = readdirSync(PLANS_DIR).filter((f) => f.endsWith(".hitl.md")).filter((f) => {
        try {
          return statSync(join3(PLANS_DIR, f)).mtimeMs >= weekAgo;
        } catch {
          return false;
        }
      }).length;
      if (hitlCount > 0) {
        process.stdout.write(`[HITL \u5F85\u5BA1\u6279] \u68C0\u6D4B\u5230 ${hitlCount} \u4E2A\u5F85\u5BA1\u6279 HITL \u63D0\u6848\uFF0C\u8BF7\u68C0\u67E5\u5E76\u5904\u7406
`);
      }
    }
  }
};

// templates/adapters/trae/hooks/session-start.ts
var TraeSessionStartGuard = class extends SessionStartGuard {
  // 当前无 override（四段与 core 基线一致）；命名子类承载端身份 + 未来演进位
};
process.env.PROJECT_DIR = process.env.PROJECT_DIR || process.cwd();
process.exit(new TraeSessionStartGuard(process.env.PROJECT_DIR).run());
