// templates/adapters/claude/hooks/doc-format-guard.ts
import { readFileSync as readFileSync3 } from "node:fs";

// templates/core/governance/doc-format-guard.ts
import { existsSync as existsSync3, mkdirSync as mkdirSync2, appendFileSync as appendFileSync2, readFileSync as readFileSync2, readdirSync } from "node:fs";
import { join as join3, basename as basename2, dirname as dirname2 } from "node:path";
import { spawnSync as spawnSync2 } from "node:child_process";

// templates/core/governance/common.ts
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

// templates/core/governance/rules.ts
var doc = {
  "token_rules": [
    {
      "template": "add-route-template-heavyweight.md",
      "tokens": [
        "add-route",
        "heavy"
      ]
    },
    {
      "template": "add-route-template.md",
      "tokens": [
        "add-route"
      ]
    },
    {
      "template": "hitl-template.md",
      "tokens": [
        "hitl"
      ]
    },
    {
      "template": "",
      "tokens": [
        "handoff"
      ]
    },
    {
      "template": "checklist-template.md",
      "tokens": [
        "checklist"
      ]
    },
    {
      "template": "fix-verification-template.md",
      "tokens": [
        "fix-verif"
      ]
    },
    {
      "template": "runtime-report-template.md",
      "tokens": [
        "report",
        "runtime"
      ]
    },
    {
      "template": "report-template.md",
      "tokens": [
        "report"
      ]
    },
    {
      "template": "tasks-template.md",
      "tokens": [
        "tasks"
      ]
    },
    {
      "template": "spec-template.md",
      "tokens": [
        "spec"
      ]
    },
    {
      "template": "standard-plan-template.md",
      "tokens": [
        "plan"
      ]
    }
  ],
  "content_rules": [
    {
      "marker": "## PLAN \u5143\u4FE1\u606F",
      "template": "standard-plan-template.md"
    },
    {
      "marker": "## \u4E00\u3001Plan \u6982\u8FF0",
      "template": "simple-plan-template.md"
    },
    {
      "marker": "## \u56DB\u3001Handoff",
      "template": "simple-plan-template.md"
    },
    {
      "marker": "## Review \u5143\u4FE1\u606F",
      "template": "review-template.md",
      "sub_markers": [
        {
          "marker": "\u8FD0\u884C\u65F6\u9A8C\u8BC1",
          "template": "review-runtime-template.md"
        },
        {
          "marker": "\u8DE8\u4ED3\u5E93\u683C\u5F0F\u5951\u7EA6",
          "template": "review-implementation-template.md"
        }
      ]
    },
    {
      "marker": "## Why",
      "template": "spec-template.md"
    },
    {
      "marker": "## Preconditions",
      "template": "tasks-template.md"
    },
    {
      "marker": "\u5BA1\u8BA1\u94FE\uFF08\u8BC1\u636E\u2192devlog\u2192checklist\uFF09",
      "template": "checklist-template.md"
    }
  ],
  "adapter_content_rules": [
    {
      "adapter": "claude",
      "marker": "## \u56DB\u3001Handoff",
      "template": "simple-standard-plan-template.md"
    },
    {
      "adapter": "claude",
      "marker": "## PLAN \u5143\u4FE1\u606F",
      "template": "standard-plan-template.md"
    },
    {
      "adapter": "claude",
      "marker": "## \u4E00\u3001Plan \u6982\u8FF0",
      "template": "simple-plan-template.md"
    },
    {
      "adapter": "claude",
      "marker": "## Review \u5143\u4FE1\u606F",
      "template": "review-template.md",
      "sub_markers": [
        {
          "marker": "\u8FD0\u884C\u65F6\u9A8C\u8BC1",
          "template": "review-runtime-template.md"
        },
        {
          "marker": "\u8DE8\u4ED3\u5E93\u683C\u5F0F\u5951\u7EA6",
          "template": "review-implementation-template.md"
        }
      ]
    },
    {
      "adapter": "claude",
      "marker": "## Why",
      "template": "spec-template.md"
    },
    {
      "adapter": "claude",
      "marker": "## Preconditions",
      "template": "tasks-template.md"
    },
    {
      "adapter": "claude",
      "marker": "\u5BA1\u8BA1\u94FE\uFF08\u8BC1\u636E\u2192devlog\u2192checklist\uFF09",
      "template": "checklist-template.md"
    }
  ],
  "handoff": {
    "marker_multi": "## \u5168\u5C40\u5143\u4FE1\u606F",
    "marker_single": "## 1. \u4EA4\u63A5\u524D\u72B6\u6001"
  },
  "fallback_rules": [
    {
      "template": "add-route-template-heavyweight.md",
      "tokens": [
        "add-route",
        "heavy"
      ]
    },
    {
      "template": "add-route-template.md",
      "tokens": [
        "add-route"
      ]
    },
    {
      "template": "standard-plan-template.md",
      "tokens": [
        "plan"
      ]
    },
    {
      "template": "tasks-template.md",
      "tokens": [
        "tasks"
      ]
    },
    {
      "template": "spec-template.md",
      "tokens": [
        "spec"
      ]
    },
    {
      "template": "checklist-template.md",
      "tokens": [
        "checklist"
      ]
    },
    {
      "template": "runtime-report-template.md",
      "tokens": [
        "report",
        "runtime"
      ]
    },
    {
      "template": "report-template.md",
      "tokens": [
        "report"
      ]
    },
    {
      "template": "fix-verification-template.md",
      "tokens": [
        "fix-verif"
      ]
    },
    {
      "template": "hitl-template.md",
      "tokens": [
        "hitl"
      ]
    }
  ],
  "incremental": {
    "regex": "~~.+~~|\u2192|\\[\\d{4}-\\d{2}-\\d{2}\\s+\u4FEE\u8BA2"
  },
  "anti_cheat": {
    "max_file_count": 3,
    "fuzzy_file_regex": "\u7B49\\s*\\d*\\s*\u4E2A\u6587\u4EF6|\u7B49\\s*\u82E5\u5E72",
    "fuzzy_decision_regex": "\u7B49\\s*\u82E5\u5E72\\s*(\u51B3\u7B56|\u65B9\u6848|\u8BBE\u8BA1)",
    "forbidden_heading": "## \u4E09\u3001\u67B6\u6784\u8BBE\u8BA1"
  }
};
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

// templates/core/governance/notify.ts
import { existsSync as existsSync2, mkdirSync, renameSync, statSync, appendFileSync } from "node:fs";
import { join as join2 } from "node:path";
function writeHookEvent(hook, decision, cmd, reason, plan = "unknown", status = "none", extra = "", magicDirOverride) {
  const defaults = protocol.adapter_defaults;
  const fallback = defaults?.magic_dir_fallback ?? ".qoder";
  const dir = join2(magicDirOverride ?? (process.env.MAGIC_DIR || fallback), "reports");
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
  }
  const file = join2(dir, "hook-events.jsonl");
  if (existsSync2(file)) {
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

// templates/core/governance/doc-format-guard.ts
function extractContent(input) {
  const ti = input.tool_input;
  if (!ti) return "";
  if (typeof ti.file_content === "string") return ti.file_content;
  if (typeof ti.content === "string") return ti.content;
  if (typeof ti.new_string === "string") return ti.new_string;
  const reps = ti.replacements;
  if (reps && reps.length > 0 && typeof reps[0].new_text === "string") return reps[0].new_text;
  return "";
}
function templateNameByToken(filePath) {
  const base = basename2(filePath).replace(/-v\d.*$/, "");
  for (const rule of doc.token_rules ?? []) {
    if (rule.tokens.every((t) => base.includes(t))) return rule.template;
  }
  return "";
}
function templateNameByContent(content, filePath, adapterName) {
  const rules = adapterName === "core" ? doc.content_rules ?? [] : (doc.adapter_content_rules ?? []).filter((r) => r.adapter === adapterName);
  for (const rule of rules) {
    if (content.includes(rule.marker)) {
      for (const sub of rule.sub_markers ?? []) {
        if (content.includes(sub.marker)) return sub.template;
      }
      return rule.template;
    }
  }
  if (filePath.includes("handoff")) {
    const handoffRules = doc.handoff;
    if (content.includes(handoffRules.marker_multi)) return "handoff-multi-round-template.md";
    if (content.includes(handoffRules.marker_single)) return "handoff-single-round-template.md";
    return null;
  }
  for (const rule of doc.fallback_rules ?? []) {
    if (rule.tokens.every((t) => filePath.includes(t))) return rule.template;
  }
  return null;
}
function isIncrementalEdit(content) {
  const regex = doc.incremental.regex;
  return new RegExp(regex).test(content);
}
var DocFormatGuard = class {
  projectDir;
  magicDir;
  planKeyword;
  planStatus;
  /** adapter 名（缺省 core；adapter 子类传名加载独立内容探测链） */
  adapterName;
  issues = [];
  constructor(projectDir, magicDir, adapterName = "core") {
    this.projectDir = projectDir;
    this.magicDir = magicDir;
    this.adapterName = adapterName;
    const active = detectActiveAdd();
    if (active !== null) {
      this.planKeyword = active.split("::")[0] ?? "";
      this.planStatus = "active";
    } else {
      this.planKeyword = "no-active-plan";
      this.planStatus = "none";
    }
  }
  /** 识别模板：token → 内容 → null（无法识别）；handoff 内容无法识别时由调用方阻断
   *  protected: adapter 子类可 override 探测链（如 claude 版 simple-standard-plan 分支） */
  identifyTemplate(filePath, content) {
    let name = templateNameByToken(filePath);
    if (name === "") {
      const byContent = templateNameByContent(content, filePath, this.adapterName);
      if (byContent === null && filePath.includes("handoff")) {
        return { handoffUnrecognized: true };
      }
      if (byContent === null) {
        if (isIncrementalEdit(content)) {
          return null;
        }
        return null;
      }
      name = byContent;
    }
    return { name };
  }
  /** 读取 schema.json（含默认空结构） */
  loadSchema(templateName) {
    const schemaFile = join3(this.projectDir, this.magicDir, "templates", templateName.replace(/\.md$/, ".schema.json"));
    if (!existsSync3(schemaFile)) return null;
    try {
      return JSON.parse(readFileSync2(schemaFile, "utf-8"));
    } catch {
      return null;
    }
  }
  /** 章节/锚定/占位符/禁词校验，返回 struct 统计 */
  runSchemaChecks(schema, templateName, content, isSearchReplace) {
    const templatesDir = join3(this.projectDir, this.magicDir, "templates");
    let applied = 0;
    let missed = 0;
    let anchorHit = true;
    const headings = schema.sections.filter((s) => s.heading).map((s) => s.heading);
    const requiredHeadings = schema.sections.filter((s) => s.required === true && s.heading).map((s) => s.heading);
    const subs = schema.sections.flatMap((s) => s.subsections ?? []).filter((s) => s.heading).map((s) => s.heading);
    const placeholders = schema.placeholders ?? [];
    const terms = schema.forbidden_terms ?? [];
    if (!isSearchReplace) {
      for (const section of schema.sections) {
        if (!section.anchor) continue;
        applied++;
        const templateContent = existsSync3(join3(templatesDir, templateName)) ? readFileSync2(join3(templatesDir, templateName), "utf-8") : "";
        const refLine = templateContent.split("\n").find((l) => l.includes(section.anchor));
        if (!refLine) {
          process.stderr.write(`[doc-format-guard] anchor_miss: schema ${section.id} \u58F0\u660E\u7684 anchor '${section.anchor}' \u5728 ${templateName} \u4E2D\u672A\u5B9A\u4F4D\uFF0C\u8DF3\u8FC7\u8BE5\u89C4\u5219\uFF08\u5192\u70DF\u5DE1\u68C0\u5151\u5E95\uFF09
`);
          applied--;
          continue;
        }
        const tokens = [...new Set(refLine.replace(/[#*`|(){]/g, " ").split(/\s+/).filter((t) => t !== "" && !t.includes("{")))];
        if (tokens.length === 0) {
          applied--;
          continue;
        }
        let scope = content;
        if (section.within) {
          if (content.includes(section.within)) {
            const startIdx = content.indexOf(section.within);
            const endIdx = content.indexOf("\n## ", startIdx + 1);
            scope = content.slice(startIdx, endIdx === -1 ? void 0 : endIdx);
          } else {
            process.stderr.write(`[doc-format-guard] within_miss: schema ${section.id} \u7684 within '${section.within}' \u5728\u6587\u6863\u4E2D\u672A\u5B9A\u4F4D\uFF0C\u8DF3\u8FC7\u8BE5\u89C4\u5219
`);
            applied--;
            continue;
          }
        }
        const missTokens = tokens.filter((tok) => !scope.includes(tok));
        if (missTokens.length > 0) {
          this.issues.push(`  \u7F3A\u951A\u70B9(${section.id}): ${missTokens.join(" ")}`);
          missed++;
          anchorHit = false;
        }
      }
      for (const heading of requiredHeadings) {
        applied++;
        if (!content.includes(heading)) {
          this.issues.push(`  \u7F3A\u7AE0\u8282: ${heading}`);
          missed++;
        }
      }
      for (const sub of subs) {
        applied++;
        if (!content.includes(sub)) {
          this.issues.push(`  \u7F3A\u5B50\u7AE0\u8282: ${sub}`);
          missed++;
        }
      }
    }
    for (const ph of placeholders) {
      if (content.includes(ph)) {
        this.issues.push(`  \u672A\u66FF\u6362\u5360\u4F4D\u7B26: ${ph}`);
        missed++;
      }
    }
    let structText = (content.match(/^#{2,}\s.*$/gm) ?? []).join("\n");
    const col = typeof schema.groupColumn === "number" ? schema.groupColumn : Number(schema.groupColumn);
    if (!Number.isNaN(col) && col > 0) {
      const colLines = content.split("\n").map((l) => {
        const cells = l.split("|");
        return cells.length > col ? (cells[col + 1] ?? "").trim() : "";
      }).filter(Boolean);
      structText += "\n" + colLines.join("\n");
    }
    for (const term of terms) {
      applied++;
      if (structText.includes(term)) {
        this.issues.push(`  \u7ED3\u6784\u4F4D\u7981\u8BCD: ${term}`);
        missed++;
      }
    }
    return { applied, missed, anchorHit };
  }
  /** 算法化规则校验（真源: [doc.anti_cheat] + HITL 表非空 + handoff 冲突）
   *  protected: adapter 子类可 override（如 claude 版无算法规则段） */
  runAlgoChecks(templateName, filePath, content) {
    const antiCheat = doc.anti_cheat;
    if (templateName.includes("simple-plan")) {
      const fileCount = (content.match(/^\|\s*`[^`]+`/gm) || []).length;
      if (fileCount > antiCheat.max_file_count) {
        this.issues.push(`  \u274C \u7CBE\u7B80\u7248\u53CD\u4F5C\u5F0A: \u6D89\u53CA ${fileCount} \u4E2A\u6587\u4EF6\uFF08\u8D85\u8FC7 ${antiCheat.max_file_count} \u4E2A\u9650\u5236\uFF09\uFF0C\u5E94\u6539\u7528 standard-plan-template.md`);
      }
      if (new RegExp(antiCheat.fuzzy_file_regex).test(content)) {
        this.issues.push("  \u274C \u7CBE\u7B80\u7248\u53CD\u4F5C\u5F0A: HITL \u8868\u6587\u4EF6\u6E05\u5355\u4F7F\u7528\u6A21\u7CCA\u63CF\u8FF0\uFF08'\u7B49 N \u4E2A\u6587\u4EF6'\uFF09\uFF0C\u5FC5\u987B\u5217\u51FA\u5B9E\u9645\u5B8C\u6574\u8DEF\u5F84");
      }
      if (new RegExp(antiCheat.fuzzy_decision_regex).test(content)) {
        this.issues.push("  \u274C \u7CBE\u7B80\u7248\u53CD\u4F5C\u5F0A: HITL \u8868\u65B9\u6848/\u8BBE\u8BA1\u51B3\u7B56\u4F7F\u7528\u6A21\u7CCA\u63CF\u8FF0\uFF08'\u7B49\u82E5\u5E72\u51B3\u7B56'\uFF09\uFF0C\u5FC5\u987B\u9010\u6761\u5217\u51FA");
      }
      if (content.includes(antiCheat.forbidden_heading)) {
        this.issues.push("  \u274C \u7CBE\u7B80\u7248\u53CD\u4F5C\u5F0A: \u5305\u542B '## \u4E09\u3001\u67B6\u6784\u8BBE\u8BA1' \u7AE0\u8282\uFF0C\u7CBE\u7B80\u7248\u4E0D\u5E94\u6709\u67B6\u6784\u8BBE\u8BA1\u2014\u2014\u5E94\u6539\u7528 standard-plan-template.md");
      }
    }
    if (/plan|review/.test(templateName)) {
      if (content.includes("## HITL")) {
        const hitlSection = content.slice(content.indexOf("## HITL"));
        const hitlRows = (hitlSection.match(/^\|\s*[^|{]*\s*\|/gm) || []).length;
        const hitlData = hitlRows - 2;
        if (hitlData < 1) {
          this.issues.push("  \u26A0\uFE0F  HITL \u8868\u4E3A\u7A7A\u2014\u2014\u5FC5\u987B\u586B\u5199\u81F3\u5C11 1 \u884C\u5B9E\u9645\u5185\u5BB9\u540E\u518D\u63D0\u4EA4\u5BA1\u6838");
        }
      }
    }
    if (templateName.includes("simple-plan")) {
      const planBase = basename2(filePath).replace(/-plan-v.*/, "");
      const planDir = dirname2(filePath);
      const pattern = `${planBase}-handoff`;
      const found = (() => {
        try {
          return readdirSync(planDir).some((f) => f.startsWith(pattern) && f.endsWith(".md"));
        } catch {
          return false;
        }
      })();
      if (found) {
        this.issues.push(`  \u274C \u7CBE\u7B80\u7248 Handoff \u51B2\u7A81: \u68C0\u6D4B\u5230\u72EC\u7ACB handoff \u6587\u4EF6\uFF08${pattern}*.md\uFF09\u3002\u7CBE\u7B80\u7248 Plan \u7684 Handoff \u5DF2\u878D\u5408\u5728 \xA7\u56DB\uFF0C\u4E0D\u5E94\u751F\u6210\u72EC\u7ACB\u6587\u4EF6\u3002\u8BF7\u5220\u9664\u72EC\u7ACB handoff \u6587\u4EF6\u6216\u6539\u7528 standard-plan-template.md`);
      }
    }
  }
  /** 主入口：返回 exit code（0 放行 / 2 阻断） */
  run(inputRaw) {
    const input = (() => {
      try {
        return JSON.parse(inputRaw);
      } catch {
        return {};
      }
    })();
    const ti = input.tool_input;
    if (inputRaw.trim() !== "" && !ti) {
      process.stderr.write("jq: error (at <stdin>:1): null (null) has no keys\n");
    }
    try {
      const debugDir = join3(this.projectDir, this.magicDir, "debug-dump");
      mkdirSync2(debugDir, { recursive: true });
      const log = [
        `=== ${localIsoSeconds()} ===`,
        `file_path: ${typeof ti?.file_path === "string" ? ti.file_path : "EMPTY"}`,
        `has_file_content: ${ti && typeof ti.file_content === "string"}`,
        `has_replacements: ${ti && Array.isArray(ti.replacements)}`
      ];
      if (ti && typeof ti.file_content === "string") {
        log.push(`[file_content[500]]: ${ti.file_content.slice(0, 500)}`);
      }
      if (ti && Array.isArray(ti.replacements) && ti.replacements[0]?.new_text) {
        log.push(`[replacement_new_text[500]]: ${ti.replacements[0].new_text.slice(0, 500)}`);
      }
      log.push(`top_keys: ${Object.keys(input).join(", ")}`);
      log.push(`tool_input_keys: ${ti ? Object.keys(ti).join(", ") : "NO_TOOL_INPUT"}`);
      log.push("=== DONE ===");
      appendFileSync2(join3(debugDir, "stdin.log"), log.join("\n") + "\n");
    } catch {
    }
    const filePath = typeof ti?.file_path === "string" ? ti.file_path : "";
    if (filePath === "") return 0;
    if (!new RegExp(`${this.magicDir}/(plans|specs)/`).test(filePath)) return 0;
    const CONTENT = extractContent(input);
    if (CONTENT === "") {
      process.stderr.write("\u26D4 \u62D2\u7EDD\uFF1AWrite \u5DE5\u5177\u672A\u4F20 file_content\uFF0C\u65E0\u6CD5\u6821\u9A8C\u624B\u5199\u6587\u6863\u683C\u5F0F\n");
      process.stdout.write('{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"Write \u5DE5\u5177\u672A\u4F20 file_content\uFF0C\u65E0\u6CD5\u6821\u9A8C\u624B\u5199\u6587\u6863\u3002\u8BF7\u7528 SearchReplace \u6539\u5199\u5DF2\u6709\u6587\u4EF6\uFF0C\u6216\u7528 Write \u5DE5\u5177\u91CD\u8BD5\u3002"}}\n');
      writeHookEvent("doc-format-guard", "deny", "Write", "Write \u5DE5\u5177\u672A\u4F20 file_content", this.planKeyword, this.planStatus);
      return 2;
    }
    const identified = this.identifyTemplate(filePath, CONTENT);
    let TEMPLATE_NAME = "";
    if (identified && "handoffUnrecognized" in identified) {
      process.stderr.write("\u26D4 handoff \u6587\u4EF6\u5185\u5BB9\u65E0\u6CD5\u8BC6\u522B\u6A21\u677F\u7C7B\u578B\uFF08\u7F3A '## \u5168\u5C40\u5143\u4FE1\u606F' \u6216 '## 1. \u4EA4\u63A5\u524D\u72B6\u6001'\uFF09\uFF0C\u62D2\u7EDD\u5199\u5165\n");
      process.stdout.write('{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"handoff \u5185\u5BB9\u4E0D\u7B26\u5408 single/multi \u6A21\u677F\u89C4\u8303"}}\n');
      writeHookEvent("doc-format-guard", "deny", filePath, "handoff \u6A21\u677F\u7C7B\u578B\u65E0\u6CD5\u8BC6\u522B", this.planKeyword, this.planStatus);
      return 2;
    }
    if (identified && "name" in identified) {
      TEMPLATE_NAME = identified.name;
    } else {
      if (isIncrementalEdit(CONTENT)) {
        process.stderr.write("[doc-format-guard] \u68C0\u6D4B\u5230\u589E\u91CF\u4FEE\u8BA2\u683C\u5F0F\uFF0C\u8DF3\u8FC7\u5B8C\u6574\u7AE0\u8282\u6821\u9A8C\n");
        return 0;
      }
      process.stderr.write(`\u26D4 \u62D2\u7EDD\uFF1A\u65E0\u6CD5\u8BC6\u522B\u6587\u6863\u7C7B\u578B (file_path: ${filePath})\uFF0C\u7F3A\u5C11\u6A21\u677F\u5339\u914D\u89C4\u5219
`);
      process.stdout.write('{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"\u65E0\u6CD5\u8BC6\u522B ADD \u6587\u6863\u7C7B\u578B\uFF0C\u8BF7\u8054\u7CFB\u7BA1\u7406\u5458\u66F4\u65B0 doc-format-guard"}}\n');
      writeHookEvent("doc-format-guard", "deny", filePath, "\u65E0\u6CD5\u8BC6\u522B\u6587\u6863\u7C7B\u578B", this.planKeyword, this.planStatus);
      return 2;
    }
    const schema = this.loadSchema(TEMPLATE_NAME);
    if (!schema) {
      process.stderr.write(`\u26D4 \u963B\u65AD\uFF1A\u6A21\u677F ${TEMPLATE_NAME} \u7F3A\u5C11\u5BF9\u5E94\u7684 .schema.json \u6821\u9A8C\u89C4\u5219
`);
      process.stdout.write('{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"\u7F3A\u5C11 .schema.json \u6821\u9A8C\u89C4\u5219\u6587\u4EF6\uFF0C\u7981\u6B62\u65E0\u89C4\u5219\u653E\u884C"}}\n');
      writeHookEvent("doc-format-guard", "deny", filePath, "\u7F3A\u5C11 .schema.json \u6821\u9A8C\u89C4\u5219", this.planKeyword, this.planStatus);
      return 2;
    }
    const isSearchReplace = ti && Array.isArray(ti.replacements) && ti.replacements.length > 0 ? true : ti && typeof ti.new_string === "string";
    const { applied, missed, anchorHit } = this.runSchemaChecks(schema, TEMPLATE_NAME, CONTENT, Boolean(isSearchReplace));
    this.runAlgoChecks(TEMPLATE_NAME, filePath, CONTENT);
    const termTotal = (schema.forbidden_terms ?? []).length;
    const finalApplied = isSearchReplace ? termTotal : applied;
    const finalMissed = this.issues.length;
    let structScore = 100;
    if (finalApplied > 0 && finalMissed > 0) {
      structScore = Math.max(0, Math.floor((finalApplied - finalMissed) * 100 / finalApplied));
    }
    const BACKFLOW_EXTRA = `"anchor_hit":${anchorHit},"struct_score":${structScore}`;
    if (this.issues.length > 0) {
      process.stderr.write(`\u26D4 ${TEMPLATE_NAME} \u6821\u9A8C\u4E0D\u901A\u8FC7:
${this.issues.join("\n")}
`);
      const brief = this.issues.join(" ").replace(/"/g, "").replace(/\s+/g, " ").slice(0, 180);
      process.stdout.write(`{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"\u6587\u6863\u683C\u5F0F\u6821\u9A8C\u4E0D\u901A\u8FC7: ${brief}"}}
`);
      writeHookEvent("doc-format-guard", "deny", filePath, "\u6587\u6863\u683C\u5F0F\u6821\u9A8C\u4E0D\u901A\u8FC7", this.planKeyword, this.planStatus, BACKFLOW_EXTRA);
      return 2;
    }
    if (new RegExp(`${this.magicDir}/plans/`).test(filePath)) {
      const genIndex = join3(this.projectDir, "scripts", "gen-plan-index.sh");
      if (existsSync3(genIndex)) {
        try {
          spawnSync2("bash", [genIndex], { stdio: "ignore" });
        } catch {
        }
      }
    }
    writeHookEvent("doc-format-guard", "allow", filePath, "\u6821\u9A8C\u901A\u8FC7", this.planKeyword, this.planStatus, BACKFLOW_EXTRA);
    return 0;
  }
};

// templates/adapters/claude/hooks/doc-format-guard.ts
var ClaudeDocFormatGuard = class extends DocFormatGuard {
  constructor(projectDir, magicDir) {
    super(projectDir, magicDir, "claude");
  }
  /** 差异点 ②: claude 版无算法规则段 */
  runAlgoChecks(_templateName, _filePath, _content) {
  }
};
var PROJECT_DIR = process.env.PROJECT_DIR || process.cwd();
var MAGIC_DIR = process.env.MAGIC_DIR || ".qoder";
var guard = new ClaudeDocFormatGuard(PROJECT_DIR, MAGIC_DIR);
var raw = "";
try {
  raw = readFileSync3(0, "utf-8");
} catch {
  raw = "";
}
process.exitCode = guard.run(raw);
