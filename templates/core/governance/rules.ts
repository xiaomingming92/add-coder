// ═══════════════════════════════════════════════════════════════
// rules.ts — Hook 规则常量（_generated，勿手改本文件）
// 真源: src/caijuehub/hook-*.toml ×5（guard/doc/context/event/protocol）
// 生成器: scripts/hook-rules-gen.ts（hook-bake 烘焙前自动调用）
// 消费方式: hook 源码 import "./rules.js"（bundle 内联，产物零依赖）
// ═══════════════════════════════════════════════════════════════

// ── GENERATED BEGIN（真源: src/caijuehub/hook-*.toml）──
export const guard = {
  "detectors": [
    {
      "id": "dangerous-command",
      "regex": "rm\\s+-rf\\s+/|DROP\\s+TABLE|git\\s+push\\s+--force|mkfs\\.|dd\\s+if=",
      "flags": "i",
      "reason": "危险命令已被阻止",
      "stderr": "⛔ 危险命令已被阻止: {{cmd}}\n"
    },
    {
      "id": "script-interpreter",
      "regex": "(^|;|\\|\\||&&|\\|)\\s*(python3?|node|ruby|perl|php)(\\s|$)",
      "reason": "禁止通过脚本解释器直接修改文件。请使用 Write 或 SearchReplace 工具操作文件。",
      "stderr": "⛔ [ADD PreToolUse §A] 阻断: 禁止通过脚本解释器直接修改文件。\n\n  python/node/ruby/perl/php 可在脚本中写入任意文件，绕过:\n    · Plan 关联检查（哪个文件属于哪个 ADD Plan？）\n    · doc-format-guard（章节/占位符/禁止词校验）\n    · 审计追踪（agentAudit 无法感知 Bash 内部的文件变更）\n\n  → 请改用 Write 或 SearchReplace 工具操作文件。\n  → 如需运行构建/测试脚本，使用 npx/pnpm/npm 命令。\n"
    },
    {
      "id": "sed-in-place",
      "regex": "(^|[;&|][ \\t]*)sed[ \\t]+([^;&|]*[ \\t])?(-[A-Za-z]*i[^ \\t;&|]*|--in-place(=[^ \\t;&|]*)?)([ \\t;&|]|$)",
      "reason": "禁止通过 sed -i 直接编辑文件。请使用 SearchReplace 工具。",
      "stderr": "⛔ [ADD PreToolUse §A] 阻断: 禁止通过 sed -i 原地编辑文件。\n\n  sed -i 直接写入文件，绕过 IDE 工具层的所有校验。\n  → 请改用 SearchReplace 工具。\n"
    },
    {
      "id": "redirect",
      "regex": "[>]{1,2}\\s+\\S",
      "reason": "禁止通过重定向写入文件。请使用 Write 工具。",
      "stderr": "⛔ [ADD PreToolUse §A] 阻断: 禁止通过重定向(>/>>)写入文件。\n\n  重定向写入绕过 IDE 工具层，变更无法追踪。\n  → 请改用 Write 工具。\n"
    },
    {
      "id": "tee-dd",
      "regex": "\\btee\\b|\\bdd\\b.*of=",
      "reason": "禁止通过 tee/dd 写入文件。请使用 Write 或 SearchReplace 工具。",
      "stderr": "⛔ [ADD PreToolUse §A] 阻断: 禁止通过 tee/dd 写入文件。\n\n  → 请改用 Write 或 SearchReplace 工具。\n"
    },
    {
      "id": "cp-mv-touch",
      "regex": "(^|;|\\|\\||&&|\\|)\\s*(cp|mv|touch)\\b",
      "reason": "禁止通过 cp/mv/touch 操作文件。请使用 Write 或 SearchReplace 工具。",
      "stderr": "⛔ [ADD PreToolUse §A] 阻断: 禁止通过 cp/mv/touch 操作文件。\n\n  → 请改用 Write 或 SearchReplace 工具。\n"
    }
  ],
  "adapters": {
    "trae": [
      "script-interpreter",
      "sed-in-place",
      "redirect",
      "tee-dd",
      "cp-mv-touch"
    ]
  },
  "adapter_detectors": [
    {
      "adapter": "trae",
      "id": "dangerous-command",
      "regex": "rm\\s+-rf\\s+/|DROP\\s+TABLE|git\\s+push\\s+--force|mkfs\\.|dd\\s+if=",
      "flags": "i",
      "reason": "危险命令已被阻止",
      "stderr": "⛔ 危险命令已被阻止: {{cmd}}\n"
    },
    {
      "adapter": "trae",
      "id": "script-interpreter",
      "regex": "(^|;|\\|\\||&&|\\|)\\s*(python3?|node|ruby|perl|php)(\\s|$)",
      "reason": "禁止通过脚本解释器直接修改文件。请使用 Write 或 SearchReplace 工具操作文件。",
      "stderr": "⛔ [ADD PreToolUse §A] 阻断: 禁止通过脚本解释器直接修改文件。\n\n  python/node/ruby/perl/php 可在脚本中写入任意文件，绕过:\n    · Plan 关联检查（哪个文件属于哪个 ADD Plan？）\n    · doc-format-guard（章节/占位符/禁止词校验）\n    · 审计追踪（agentAudit 无法感知 Bash 内部的文件变更）\n\n  → 请改用 Write 或 SearchReplace 工具操作文件。\n  → 如需运行构建/测试脚本，使用 npx/pnpm/npm 命令。\n"
    },
    {
      "adapter": "trae",
      "id": "sed-in-place",
      "regex": "(^|[;&|]\\s*)sed\\s+([^;&|]*\\s)?(-[a-zA-Z]*i[^;&|]*|--in-place(=[^;&|]*)?)([\\s;&|]|$)",
      "reason": "禁止通过 sed -i 直接编辑文件。请使用 SearchReplace 工具。",
      "stderr": "⛔ [ADD PreToolUse §A] 阻断: 禁止通过 sed -i 原地编辑文件。\n\n  sed -i 直接写入文件，绕过 IDE 工具层的所有校验。\n  → 请改用 SearchReplace 工具。\n"
    },
    {
      "adapter": "trae",
      "id": "redirect",
      "regex": "[>]{1,2}\\s+\\S",
      "reason": "禁止通过重定向写入文件。请使用 Write 工具。",
      "stderr": "⛔ [ADD PreToolUse §A] 阻断: 禁止通过重定向(>/>>)写入文件。\n\n  重定向写入绕过 IDE 工具层，变更无法追踪。\n  → 请改用 Write 工具。\n"
    },
    {
      "adapter": "trae",
      "id": "tee-dd",
      "regex": "\\btee\\b|\\bdd\\b.*of=",
      "reason": "禁止通过 tee/dd 写入文件。请使用 Write 或 SearchReplace 工具。",
      "stderr": "⛔ [ADD PreToolUse §A] 阻断: 禁止通过 tee/dd 写入文件。\n\n  → 请改用 Write 或 SearchReplace 工具。\n"
    },
    {
      "adapter": "trae",
      "id": "cp-mv-touch",
      "regex": "(^|;|\\|\\||&&|\\|)\\s*(cp|mv|touch)\\b",
      "reason": "禁止通过 cp/mv/touch 操作文件。请使用 Write 或 SearchReplace 工具。",
      "stderr": "⛔ [ADD PreToolUse §A] 阻断: 禁止通过 cp/mv/touch 操作文件。\n\n  → 请改用 Write 或 SearchReplace 工具。\n"
    },
    {
      "adapter": "claude",
      "id": "dangerous-command",
      "regex": "rm\\s+-rf\\s+/|DROP\\s+TABLE|git\\s+push\\s+--force|mkfs\\.|dd\\s+if=",
      "flags": "i",
      "reason": "危险命令已被阻止",
      "stderr": "⛔ 危险命令已被阻止: {{cmd}}\n"
    },
    {
      "adapter": "claude",
      "id": "terminal-write",
      "regex": "(cat|echo|tee|sed\\s+-i|awk|printf|cp|mv|dd|touch)\\s*.*([>]{1,2}|[|]\\s*tee|<<)",
      "flags": "",
      "reason": "禁止通过终端直接写文件",
      "stderr": "⛔ 禁止通过终端命令直接写文件: {{cmd}}。请使用 Write/Edit/SearchReplace 工具。\n"
    },
    {
      "adapter": "claude",
      "id": "cp-mv-touch",
      "regex": "(^|;|\\|\\||&&|\\|)\\s*(cp|mv|touch)\\b",
      "flags": "",
      "reason": "禁止通过 cp/mv/touch 操作文件",
      "stderr": "⛔ 禁止通过 cp/mv/touch 操作文件: {{cmd}}。请使用 Write 或 SearchReplace 工具。\n"
    },
    {
      "adapter": "claude",
      "id": "script-interpreter",
      "regex": "(^|;|\\|\\||&&|\\|)\\s*(python3?|node|ruby|perl|php)(\\s|$)",
      "flags": "",
      "reason": "禁止通过脚本解释器直接修改文件",
      "stderr": "⛔ 禁止通过脚本解释器直接写文件: {{cmd}}。请使用 Write 或 SearchReplace 工具。\n"
    },
    {
      "adapter": "qoder",
      "id": "dangerous-command",
      "regex": "rm\\s+-rf\\s+/|DROP\\s+TABLE|git\\s+push\\s+--force|mkfs\\.|dd\\s+if=",
      "flags": "i",
      "reason": "危险命令已被阻止",
      "stderr": "⛔ 危险命令已被阻止: {{cmd}}\n"
    },
    {
      "adapter": "qoder",
      "id": "terminal-write",
      "regex": "(cat|echo|tee|sed\\s+-i|awk|printf|cp|mv|dd|touch)\\s*.*([>]{1,2}|[|]\\s*tee|<<)",
      "flags": "",
      "reason": "禁止通过终端直接写文件",
      "stderr": "⛔ 禁止通过终端命令直接写文件: {{cmd}}。请使用 Write/Edit/SearchReplace 工具。\n"
    },
    {
      "adapter": "qoder",
      "id": "cp-mv-touch",
      "regex": "(^|;|\\|\\||&&|\\|)\\s*(cp|mv|touch)\\b",
      "flags": "",
      "reason": "禁止通过 cp/mv/touch 操作文件",
      "stderr": "⛔ 禁止通过 cp/mv/touch 操作文件: {{cmd}}。请使用 Write 或 SearchReplace 工具。\n"
    },
    {
      "adapter": "qoder",
      "id": "script-interpreter",
      "regex": "(^|;|\\|\\||&&|\\|)\\s*(python3?|node|ruby|perl|php)(\\s|$)",
      "flags": "",
      "reason": "禁止通过脚本解释器直接修改文件",
      "stderr": "⛔ 禁止通过脚本解释器直接写文件: {{cmd}}。请使用 Write 或 SearchReplace 工具。\n"
    },
    {
      "adapter": "codex",
      "id": "dangerous-command",
      "regex": "rm\\s+-rf\\s+/|DROP\\s+TABLE|git\\s+push\\s+--force|mkfs\\.|dd\\s+if=",
      "flags": "i",
      "reason": "危险命令已被阻止；请使用 apply_patch。"
    },
    {
      "adapter": "codex",
      "id": "script-interpreter",
      "regex": "(^|;|\\|\\||&&|\\|)\\s*(python3?|node|ruby|perl|php)(\\s|$)",
      "reason": "禁止通过脚本解释器直接修改文件；请使用 apply_patch。"
    },
    {
      "adapter": "codex",
      "id": "sed-in-place",
      "regex": "(^|[;&|]\\s*)sed\\s+([^;&|]*\\s)?(-[a-zA-Z]*i[^;&|]*|--in-place(=[^;&|]*)?)([\\s;&|]|$)",
      "reason": "禁止通过 sed -i 直接编辑文件；请使用 apply_patch。"
    },
    {
      "adapter": "codex",
      "id": "redirect",
      "regex": "[>]{1,2}\\s+\\S",
      "reason": "禁止通过重定向写入文件；请使用 apply_patch。"
    },
    {
      "adapter": "codex",
      "id": "tee-dd",
      "regex": "\\btee\\b|\\bdd\\b.*of=",
      "reason": "禁止通过 tee/dd 写入文件；请使用 apply_patch。"
    },
    {
      "adapter": "codex",
      "id": "cp-mv-touch",
      "regex": "(^|;|\\|\\||&&|\\|)\\s*(cp|mv|touch)\\b",
      "reason": "禁止通过 cp/mv/touch 改变文件；请使用 apply_patch。"
    },
    {
      "adapter": "vscode",
      "id": "dangerous-command",
      "regex": "rm\\s+-rf\\s+/|DROP\\s+TABLE|git\\s+push\\s+--force|mkfs\\.|dd\\s+if=",
      "flags": "i",
      "reason": "危险命令已被阻止",
      "stderr": "⛔ 危险命令已被阻止: {{cmd}}\n"
    },
    {
      "adapter": "vscode",
      "id": "terminal-write",
      "regex": "(cat|echo|tee|sed\\s+-i|awk|printf|cp|mv|dd|touch)\\s*.*([>]{1,2}|[|]\\s*tee|<<)",
      "flags": "",
      "reason": "禁止通过终端直接写文件",
      "stderr": "⛔ 禁止通过终端命令直接写文件: {{cmd}}。请使用 Write/Edit/SearchReplace 工具。\n"
    },
    {
      "adapter": "vscode",
      "id": "cp-mv-touch",
      "regex": "(^|;|\\|\\||&&|\\|)\\s*(cp|mv|touch)\\b",
      "flags": "",
      "reason": "禁止通过 cp/mv/touch 操作文件",
      "stderr": "⛔ 禁止通过 cp/mv/touch 操作文件: {{cmd}}。请使用 Write 或 SearchReplace 工具。\n"
    },
    {
      "adapter": "vscode",
      "id": "script-interpreter",
      "regex": "(^|;|\\|\\||&&|\\|)\\s*(python3?|node|ruby|perl|php)(\\s|$)",
      "flags": "",
      "reason": "禁止通过脚本解释器直接修改文件",
      "stderr": "⛔ 禁止通过脚本解释器直接写文件: {{cmd}}。请使用 Write 或 SearchReplace 工具。\n"
    }
  ],
  "sensitive_files": {
    "regex": "(^|\\/)\\.env$|(^|\\/)\\.env\\.production$|(^|\\/)\\.env\\.local$|credentials|secrets",
    "deny_reason": "敏感文件受保护"
  },
  "template_hints": [
    {
      "pattern": "plan-v\\d",
      "message": "💡 [ADD PreToolUse] 写入 Plan → 模板: standard-plan-template.md（标准）或 simple-plan-template.md（≤3文件）"
    },
    {
      "pattern": "add-route",
      "message": "💡 [ADD PreToolUse] 写入 ADD Route → 模板: add-route-template.md"
    },
    {
      "pattern": "handoff",
      "message": "💡 [ADD PreToolUse] 写入 Handoff → 模板: handoff-single-round-template.md（单轮）或 handoff-multi-round-template.md（多轮）"
    }
  ],
  "thresholds": {
    "large_file_bytes": 2000
  },
  "hitl_exemptions": {
    "suffixes": [
      "-handoff",
      "-runtime"
    ]
  }
} as const;

export const doc = {
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
      "marker": "## PLAN 元信息",
      "template": "standard-plan-template.md"
    },
    {
      "marker": "## 一、Plan 概述",
      "template": "simple-plan-template.md"
    },
    {
      "marker": "## 四、Handoff",
      "template": "simple-plan-template.md"
    },
    {
      "marker": "## Review 元信息",
      "template": "review-template.md",
      "sub_markers": [
        {
          "marker": "运行时验证",
          "template": "review-runtime-template.md"
        },
        {
          "marker": "跨仓库格式契约",
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
      "marker": "审计链（证据→devlog→checklist）",
      "template": "checklist-template.md"
    }
  ],
  "adapter_content_rules": [
    {
      "adapter": "claude",
      "marker": "## 四、Handoff",
      "template": "simple-standard-plan-template.md"
    },
    {
      "adapter": "claude",
      "marker": "## PLAN 元信息",
      "template": "standard-plan-template.md"
    },
    {
      "adapter": "claude",
      "marker": "## 一、Plan 概述",
      "template": "simple-plan-template.md"
    },
    {
      "adapter": "claude",
      "marker": "## Review 元信息",
      "template": "review-template.md",
      "sub_markers": [
        {
          "marker": "运行时验证",
          "template": "review-runtime-template.md"
        },
        {
          "marker": "跨仓库格式契约",
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
      "marker": "审计链（证据→devlog→checklist）",
      "template": "checklist-template.md"
    }
  ],
  "handoff": {
    "marker_multi": "## 全局元信息",
    "marker_single": "## 1. 交接前状态"
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
    "regex": "~~.+~~|→|\\[\\d{4}-\\d{2}-\\d{2}\\s+修订"
  },
  "anti_cheat": {
    "max_file_count": 3,
    "fuzzy_file_regex": "等\\s*\\d*\\s*个文件|等\\s*若干",
    "fuzzy_decision_regex": "等\\s*若干\\s*(决策|方案|设计)",
    "forbidden_heading": "## 三、架构设计"
  }
} as const;

export const context = {
  "quadrants": [
    {
      "id": "no_add_no_dev",
      "consumed": false,
      "text": "[ADD Stop] 无活跃 Plan，无代码改动。正常结束。"
    },
    {
      "id": "no_add_has_dev",
      "consumed": true,
      "text": "[ADD Stop] ⚠️ 检测到代码修改但无活跃 ADD Plan。\n\nPlan 不是\"文档开销\"——它是代码治理的基础设施。跳过 Plan 的后果:\n  · 没有 add-route → 每次改动无法追溯到具体 Task\n  · 没有 tasks.md → 后续 AI Session 不知道改了哪些文件\n  · 没有 handoff → 交接时上下文全丢，只能靠 git log 猜\n\n你必须立即补救，二选一:\n\n方案 A — 补 ADD 流程（招安）:\n  Step 0: 读 .qoder/templates/plan-template.md → 生成 Plan → .qoder/plans/{today}/{keyword}-plan-v1.md\n          生成 add-route → check_dps ≥ {{dpsPass}}\n  Step 1: 扩展 AgentAuditPhase（如需要）\n  Step 2: 确认 agentAudit() 通道\n  Step 3: 将已写代码关联到 tasks.md\n  完成后可正常停止。\n\n方案 B — 补不上则回滚:\n  如果改动太复杂无法追溯生成 Plan，则:\n  ① git diff 确认改动范围\n  ② 仅对已确认属于本轮的文件生成反向 apply_patch\n  ③ 无法安全确认改动所有权时停止，并请求用户决定\n\n无论选 A 还是 B，完成后告诉用户下次执行 session-init 恢复上下文。\n"
    },
    {
      "id": "has_add_no_dev",
      "consumed": false,
      "text": "[ADD Stop] ADD 流程进行中 ({{info}})，本次无代码改动。下次继续时执行 session-init 恢复上下文。"
    },
    {
      "id": "has_add_dev_step02",
      "consumed": false,
      "text": "[ADD Stop] ADD Step 0-2: 文档先行/审计准备阶段。无需验收闭环。下一步: 进入 Step 3 代码实现。"
    },
    {
      "id": "has_add_dev_step3",
      "consumed": false,
      "text": "[ADD Stop] ADD Step 3: 代码实现进行中 ({{info}})。完成后进入 Step 3.5 实现审查。"
    },
    {
      "id": "has_add_dev_unclosed",
      "consumed": true,
      "text": "[ADD Stop] ⚠️ 代码已完成但验收未闭环:\n{{info}}\n\n请依次执行（不要等下次会话）:\n  ① Write devlog → handoff 同目录 devlog-{plan}-v{n}.md\n     格式: # Devlog: {plan}\\n 日期 / Plan / 轮次 / 本轮改了什么 / 验收结果 / 遗留项 / 架构回看\n  ② Edit handoff → 更新 §验证标准 全部 [x] + 补充审计 ID\n     ★ 同步: checklist 有新 cuid → handoff ADD-7 表必须对应新增行\n     ★ Step 0 准入: handoff + add-route + Specs 三元组缺一不可，缺则回退 Step 0.5\n  ③ Read docs/ → 回看架构文档确认一致性\n  ④ Edit add-route → 勾选对应 Step [x]\n\n以上全部完成后 Agent 才能停止。\n\n下次恢复: 读 handoff → 查同目录 devlog-*.md → query_audit_logs\n"
    },
    {
      "id": "has_add_dev_closed",
      "consumed": false,
      "text": "[ADD Stop] ✅ 验收闭环: add-route全部[x], devlog已记录, handoff已更新。验收幂等——重复触发不覆盖已有结论。"
    }
  ],
  "adapter_quadrants": [
    {
      "adapter": "qoder",
      "id": "has_add_dev_unclosed",
      "text": "[ADD Stop] ⚠️ 代码已完成但验收未闭环:\n{{info}}\n\n请依次执行（不要等下次会话）:\n  ① Write devlog → handoff 同目录 devlog-{plan}-v{n}.md\n     格式: # Devlog: {plan}\\n 日期 / Plan / 轮次 / 本轮改了什么 / 验收结果 / 遗留项 / 架构回看\n  ② Edit handoff → 更新 §验证标准 全部 [x] + 补充审计 ID\n     ★ 同步: checklist 有新 cuid → handoff ADD-7 表必须对应新增行\n     ★ Step 0 准入: handoff + add-route + Specs 三元组缺一不可，缺则回退 Step 0.5\n  ③ Read docs/ → 回看架构文档确认一致性\n  ④ Edit add-route → 勾选对应 Step [x]\n\n以上全部完成后 Agent 才能停止。\n\n下次恢复: 读 handoff → 查同目录 devlog-*.md → query_audit_logs\n"
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
      "simple-plan-template.md": "需求方案（简单版）：六节结构，元信息+背景+方案+架构+实施+验收",
      "spec-template.md": "功能规格：Why/What Changes/Impact/WHEN-THEN Requirements",
      "tasks-template.md": "任务拆分：Phase→Task→SubTask层级",
      "checklist-template.md": "验收清单：[T]编译期+[R]运行时+ADD规则合规",
      "review-template.md": "方案审查（ADD-9）：问题复现+方案对比+决策结论+影响评估",
      "standard-plan-template.md": "需求方案（标准版）：PLAN元信息+背景+方案+架构+实施Task+验收+关联文档",
      "add-route-template-heavyweight.md": "ADD执行路线图（重型）：每Step验证并更新状态+spec_sync交叉校验",
      "add-route-template.md": "ADD执行路线图（轻量）：标准Step产出检查",
      "handoff-single-round-template.md": "单轮交接：9章节（含恢复上下文审计查询）",
      "handoff-multi-round-template.md": "多轮交接：全局拓扑+每轮13子章节+收敛规则+启动模板"
    }
  },
  "pretool": {
    "text": "[ADD PreToolUse] 当前 Plan: {{plan}}，轮次: {{round}}。\n本次写入应属于 ADD Step 3 代码实现阶段。\n完成后执行 record_dev_operation 记录审计。"
  }
} as const;

export const event = {
  "file": {
    "path": "{magicDir}/reports/hook-events.jsonl",
    "rotate_bytes": 262144,
    "total_bytes": 524288,
    "note": "MCP Server 宕机不丢事件，重启后从文件恢复消费"
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
} as const;

export const protocol = {
  "exit_codes": {
    "pass": 0,
    "block": 2,
    "note": "冒烟校验: 产物退出码 ∈ {0,2}（其余为非预期，需修复）"
  },
  "output": {
    "stdout_json_only": true,
    "stderr_human_text": true,
    "field_separator": "::",
    "magic_dir_resolution": "注入优先 → 物理位置推导 → failClosed（禁止猜测 adapter 名）"
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
    "note": "core 入口协议 = qoder 同构参考实现；adapter 仅保留本表声明的私有差异"
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
} as const;
// ── GENERATED END ──
