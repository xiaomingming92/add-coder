// templates/core/governance/common.ts
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
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

// templates/core/governance/post-tool-router.ts
import { existsSync as existsSync3, readFileSync as readFileSync2, readdirSync, writeFileSync as writeFileSync2 } from "node:fs";
import { join as join2, basename, dirname } from "node:path";

// templates/core/governance/notify.ts
import { existsSync as existsSync2, mkdirSync, renameSync, statSync, appendFileSync } from "node:fs";
import { join } from "node:path";
function writeHookEvent(hook, decision, cmd, reason, plan = "unknown", status = "none", extra = "", magicDirOverride) {
  const defaults = protocol.adapter_defaults;
  const fallback = defaults?.magic_dir_fallback ?? ".qoder";
  const dir = join(magicDirOverride ?? (process.env.MAGIC_DIR || fallback), "reports");
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
  }
  const file = join(dir, "hook-events.jsonl");
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

// templates/core/governance/audit-bridge.ts
var AuditBridge = class {
  projectDir;
  magicDir;
  constructor(projectDir, magicDir) {
    this.projectDir = projectDir;
    this.magicDir = magicDir;
  }
  /**
   * 文件写入审计事件（decision="write"）。
   * @param filePath 被写入文件路径（绝对/相对均可，MCP 消费端以 cmd 为 targetId）
   */
  emit(filePath) {
    if (!filePath || filePath === "") return;
    const planKeyword = this.extractPlanKeyword(filePath);
    writeHookEvent("post-tool-use", "write", filePath, "\u6587\u4EF6\u5199\u5165\u5BA1\u8BA1\uFF08ADD-7 \u81EA\u52A8\u5316\uFF09", planKeyword, "none", "", this.magicDir);
  }
  /**
   * 从写入路径提取 planKeyword（plans/specs/reviews 目录下命名规范文件）:
   *   xxx-plan-v1.md / xxx-add-route-v1.md / xxx-review-v1.md → xxx-{suffix}-vN
   * 其余路径 → "unknown"（与拦截事件缺省语义一致）。
   */
  extractPlanKeyword(filePath) {
    void this.projectDir;
    const m = filePath.match(/([^/]+-(?:plan|add-route|review)-v\d+)\.md$/);
    return m ? m[1] : "unknown";
  }
};

// templates/core/governance/post-tool-router.ts
function extractOutputText(raw) {
  const m1 = raw.match(/"output"\s*:\s*"([^"]*)"/);
  const m2 = raw.match(/"content"\s*:\s*"([^"]*)"/);
  return [m1?.[1] ?? "", m2?.[1] ?? ""].filter(Boolean).join(" ");
}
var PostToolRouter = class {
  projectDir;
  magicDir;
  /** 输出聚合（qoder feedback JSON 模式收集；core 直出 stderr） */
  lines = [];
  /** Task 8.1 审计桥接: 文件写入事件面扩展（jsonl 主路径 → MCP 常驻消费落库） */
  auditBridge;
  constructor(projectDir, magicDir) {
    this.projectDir = projectDir;
    this.magicDir = magicDir;
    this.auditBridge = new AuditBridge(projectDir, magicDir);
  }
  // ─────────────────────────── 扩展点 ───────────────────────────
  /** §1 DPS 自动化跳过（core: false；claude: true——claude 版未实现哨兵自动建） */
  shouldSkipDps() {
    return false;
  }
  /** §2a 文档守卫文本（core: 章节完整） */
  docGuardText(filePath) {
    return `[ADD PostToolUse] ADD \u6587\u6863\u5DF2\u5199\u5165: ${filePath}\u3002\u8BF7\u786E\u4FDD\u7AE0\u8282\u5B8C\u6574\u3001\u53CC\u5411\u94FE\u63A5\u9F50\u5168\u3002
`;
  }
  /** §2 后置段（core: plan_track 自动触发 + devlog 提醒 + schema regen） */
  postDocSections(filePath) {
    if (/\/(specs|plans)\/.*add-route/.test(filePath)) {
      let planName = basename(filePath).replace(/-add-route.*/, "").replace(/-plan-v\d*$/, "");
      if (filePath.includes("add-route")) {
        const planDir = dirname(filePath);
        if (existsSync3(planDir)) {
          try {
            const planFile = readdirSync(planDir).find((f) => f.includes("-plan-v") && f.endsWith(".md"));
            if (planFile) planName = planFile.replace(/\.md$/, "");
          } catch {
          }
        }
      }
      if (planName !== "") {
        this.emitLine(`[ADD PostToolUse] \u{1F4CA} \u81EA\u52A8\u540C\u6B65 PlanRecord: plan_track({ planName: "${planName}" }) \u2014 \u8BF7\u6267\u884C
`);
      }
    }
    if (/add-route.*\.md$/.test(filePath)) {
      if (existsSync3(filePath)) {
        const content = readFileSync2(filePath, "utf-8");
        const step8 = content.match(/## Step 8[\s\S]*?(?=^## |\Z)/m)?.[0] ?? "";
        const unchecked = (step8.match(/^\- \[ \]/gm) || []).length;
        const checked = (step8.match(/^\- \[x\]/gm) || []).length;
        if (unchecked === 0 && checked > 0) {
          this.emitLine("[ADD PostToolUse] \u26A0\uFE0F Step 8 \u5168\u90E8\u6536\u655B\u5B8C\u6210\uFF01\u8BF7\u5199 devlog\u65E5\u5FD7(\u8D70mcp) \u2192 \u66F4\u65B0 handoff\n");
        }
      }
    }
    if (/templates\/.*\.md$/.test(filePath)) {
      const schemaFile = filePath.replace(/\.md$/, ".schema.json");
      if (existsSync3(schemaFile)) {
        const headings = (readFileSync2(filePath, "utf-8").match(/^## (.+)$/gm) ?? []).slice(0, 20);
        if (headings.length > 0) {
          this.emitLine(`[ADD PostToolUse] \u{1F504} \u6A21\u677F\u5DF2\u4FEE\u6539\uFF0C\u8BF7\u68C0\u67E5 ${schemaFile} \u662F\u5426\u9700\u66F4\u65B0\uFF08\xA7 sections\uFF09
`);
          this.emitLine(`[ADD PostToolUse] \u6A21\u677F\u6807\u9898: ${headings.join(" ")}
`);
        }
      }
    }
  }
  /** 输出通道（core: stderr 直出；qoder: 收集后 feedback JSON flush） */
  collectJson() {
    return false;
  }
  /** 输出一行（core: stderr 直出；qoder: 收集聚合） */
  emitLine(text) {
    if (this.collectJson()) {
      this.lines.push(text.endsWith("\n") ? text.trimEnd() : text);
    } else {
      process.stderr.write(text);
    }
  }
  /** 刷新收集的输出（qoder: hookSpecificOutput.feedback JSON——Qoder 文档实证 PostToolUse 专属字段） */
  flushLines() {
    if (this.collectJson() && this.lines.length > 0) {
      process.stdout.write(
        JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse", feedback: this.lines.join("\n") } }) + "\n"
      );
    }
  }
  /** 主路由：返回 exit code（0） */
  run(input2, toolName2) {
    if (!this.shouldSkipDps() && input2.includes('"check_dps"')) {
      const toolOutput = extractOutputText(input2);
      const dpsScore = toolOutput.match(/DPS\s*=\s*(\d+)/)?.[1] ?? "";
      const planKeyword = input2.match(/"planKeyword"\s*:\s*"([^"]+)"/)?.[1] ?? "";
      if (dpsScore !== "" && planKeyword !== "") {
        const score = Number(dpsScore);
        if (!Number.isNaN(score) && score >= 80) {
          const sentinel = join2(this.projectDir, this.magicDir, "hitl", `.tongyi-${planKeyword}`);
          if (!existsSync3(sentinel)) {
            try {
              writeFileSync2(sentinel, "");
              this.emitLine(`[ADD PostToolUse] \u2705 DPS=${dpsScore} \u226580, HITL \u81EA\u52A8\u901A\u8FC7 \u2192 ${sentinel}
`);
            } catch {
            }
            this.emitLine(`[ADD PostToolUse] DPS=${dpsScore} \u226580, \u5DF2\u81EA\u52A8\u5EFA\u54E8\u5175 ${sentinel}
`);
          } else {
            this.emitLine(`[ADD PostToolUse] DPS=${dpsScore} \u226580, \u54E8\u5175\u5DF2\u5B58\u5728 \u2192 ${sentinel}
`);
          }
        } else {
          this.emitLine(`[ADD PostToolUse] \u26A0\uFE0F DPS=${dpsScore} <80, \u9700 Review \u540E\u624B\u52A8\u5EFA\u54E8\u5175 .tongyi-${planKeyword}
`);
          this.emitLine("[ADD PostToolUse] \u4FEE\u590D\u6587\u6863\u540E\u91CD\u65B0 check_dps\uFF0C\u901A\u8FC7\u5373\u81EA\u52A8\u653E\u884C\u3002\n");
        }
      }
    }
    if (this.isFileTool(toolName2)) {
      const filePath = this.extractFilePath(input2);
      if (filePath === "") return 0;
      if (/\.(qoder|claude|add)\/(plans|specs|reviews)\//.test(filePath)) {
        this.emitLine(this.docGuardText(filePath));
      }
      this.postDocSections(filePath);
      this.emitLine(this.emitAuditReminder(filePath));
      this.emitWriteEvent(filePath);
    } else if (toolName2 === "Bash") {
      this.emitLine(this.emitBashDone());
    } else {
      this.applyPatchMatcher(input2);
    }
    this.flushLines();
    return 0;
  }
  // ─────────────────────────── 扩展点（续）───────────────────────────
  /** 文件写工具判定（core: Edit/Write；codex 子类: +SearchReplace + apply_patch 走附加 matcher） */
  isFileTool(toolName2) {
    return toolName2 === "Edit" || toolName2 === "Write";
  }
  /** filePath 提取（core: file_path 字段；codex 子类: file_path ?? path） */
  extractFilePath(input2) {
    return jsonGet(input2, "file_path");
  }
  /** §2e 审计提醒（core: 含 ADD-7；codex 子类: 简化文本） */
  emitAuditReminder(filePath) {
    return `[ADD PostToolUse] \u6587\u4EF6\u5DF2\u5199\u5165: ${filePath}\u3002\u8BF7\u6267\u884C record_dev_operation \u843D\u5E93\u5BA1\u8BA1\uFF08ADD-7\uFF09\u3002
`;
  }
  /** §2f 审计桥接触发（Task 8.1，扩展点: 默认 AuditBridge.emit；
   *  如有端需关闭/改造事件面在此 override——本轮 5 端全接入，无关闭端） */
  emitWriteEvent(filePath) {
    this.auditBridge.emit(filePath);
  }
  /** §3 Bash 增强（core: lint/tsc；codex 子类: lint/typecheck/test） */
  emitBashDone() {
    return "[ADD PostToolUse] \u547D\u4EE4\u6267\u884C\u5B8C\u6210\u3002\u5982\u6709 lint/tsc \u9519\u8BEF\u8BF7\u4FEE\u590D\u3002\n";
  }
  /** 附加 matcher（core: 无；codex 子类: apply_patch 解析 `*** Add|Update|Delete File:` 逐文件 report） */
  applyPatchMatcher(_input) {
  }
};

// templates/core/hooks/post-tool-use.ts
var input = readHookInput();
var toolName = jsonGet(input, "tool_name");
if (toolName === "") {
  const fallback = input.match(/"tool_name"\s*:\s*"([^"]*)"/)?.[1] ?? "";
  if (fallback === "") {
    process.exit(0);
  }
  toolName = fallback;
}
var PROJECT_DIR = process.env.PROJECT_DIR || process.cwd();
var MAGIC_DIR = process.env.MAGIC_DIR || ".qoder";
process.exit(new PostToolRouter(PROJECT_DIR, MAGIC_DIR).run(input, toolName));
