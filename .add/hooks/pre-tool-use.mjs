// templates/core/governance/common.ts
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath as fileURLToPath3 } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

// templates/core/governance/rules.ts
var guard = {
  "detectors": [
    {
      "id": "dangerous-command",
      "regex": "rm\\s+-rf\\s+/|DROP\\s+TABLE|git\\s+push\\s+--force|mkfs\\.|dd\\s+if=",
      "flags": "i",
      "reason": "\u5371\u9669\u547D\u4EE4\u5DF2\u88AB\u963B\u6B62",
      "stderr": "\u26D4 \u5371\u9669\u547D\u4EE4\u5DF2\u88AB\u963B\u6B62: {{cmd}}\n"
    },
    {
      "id": "script-interpreter",
      "regex": "(^|;|\\|\\||&&|\\|)\\s*(python3?|node|ruby|perl|php)(\\s|$)",
      "reason": "\u7981\u6B62\u901A\u8FC7\u811A\u672C\u89E3\u91CA\u5668\u76F4\u63A5\u4FEE\u6539\u6587\u4EF6\u3002\u8BF7\u4F7F\u7528 Write \u6216 SearchReplace \u5DE5\u5177\u64CD\u4F5C\u6587\u4EF6\u3002",
      "stderr": "\u26D4 [ADD PreToolUse \xA7A] \u963B\u65AD: \u7981\u6B62\u901A\u8FC7\u811A\u672C\u89E3\u91CA\u5668\u76F4\u63A5\u4FEE\u6539\u6587\u4EF6\u3002\n\n  python/node/ruby/perl/php \u53EF\u5728\u811A\u672C\u4E2D\u5199\u5165\u4EFB\u610F\u6587\u4EF6\uFF0C\u7ED5\u8FC7:\n    \xB7 Plan \u5173\u8054\u68C0\u67E5\uFF08\u54EA\u4E2A\u6587\u4EF6\u5C5E\u4E8E\u54EA\u4E2A ADD Plan\uFF1F\uFF09\n    \xB7 doc-format-guard\uFF08\u7AE0\u8282/\u5360\u4F4D\u7B26/\u7981\u6B62\u8BCD\u6821\u9A8C\uFF09\n    \xB7 \u5BA1\u8BA1\u8FFD\u8E2A\uFF08agentAudit \u65E0\u6CD5\u611F\u77E5 Bash \u5185\u90E8\u7684\u6587\u4EF6\u53D8\u66F4\uFF09\n\n  \u2192 \u8BF7\u6539\u7528 Write \u6216 SearchReplace \u5DE5\u5177\u64CD\u4F5C\u6587\u4EF6\u3002\n  \u2192 \u5982\u9700\u8FD0\u884C\u6784\u5EFA/\u6D4B\u8BD5\u811A\u672C\uFF0C\u4F7F\u7528 npx/pnpm/npm \u547D\u4EE4\u3002\n"
    },
    {
      "id": "sed-in-place",
      "regex": "(^|[;&|][ \\t]*)sed[ \\t]+([^;&|]*[ \\t])?(-[A-Za-z]*i[^ \\t;&|]*|--in-place(=[^ \\t;&|]*)?)([ \\t;&|]|$)",
      "reason": "\u7981\u6B62\u901A\u8FC7 sed -i \u76F4\u63A5\u7F16\u8F91\u6587\u4EF6\u3002\u8BF7\u4F7F\u7528 SearchReplace \u5DE5\u5177\u3002",
      "stderr": "\u26D4 [ADD PreToolUse \xA7A] \u963B\u65AD: \u7981\u6B62\u901A\u8FC7 sed -i \u539F\u5730\u7F16\u8F91\u6587\u4EF6\u3002\n\n  sed -i \u76F4\u63A5\u5199\u5165\u6587\u4EF6\uFF0C\u7ED5\u8FC7 IDE \u5DE5\u5177\u5C42\u7684\u6240\u6709\u6821\u9A8C\u3002\n  \u2192 \u8BF7\u6539\u7528 SearchReplace \u5DE5\u5177\u3002\n"
    },
    {
      "id": "redirect",
      "regex": "[>]{1,2}\\s+\\S",
      "reason": "\u7981\u6B62\u901A\u8FC7\u91CD\u5B9A\u5411\u5199\u5165\u6587\u4EF6\u3002\u8BF7\u4F7F\u7528 Write \u5DE5\u5177\u3002",
      "stderr": "\u26D4 [ADD PreToolUse \xA7A] \u963B\u65AD: \u7981\u6B62\u901A\u8FC7\u91CD\u5B9A\u5411(>/>>)\u5199\u5165\u6587\u4EF6\u3002\n\n  \u91CD\u5B9A\u5411\u5199\u5165\u7ED5\u8FC7 IDE \u5DE5\u5177\u5C42\uFF0C\u53D8\u66F4\u65E0\u6CD5\u8FFD\u8E2A\u3002\n  \u2192 \u8BF7\u6539\u7528 Write \u5DE5\u5177\u3002\n"
    },
    {
      "id": "tee-dd",
      "regex": "\\btee\\b|\\bdd\\b.*of=",
      "reason": "\u7981\u6B62\u901A\u8FC7 tee/dd \u5199\u5165\u6587\u4EF6\u3002\u8BF7\u4F7F\u7528 Write \u6216 SearchReplace \u5DE5\u5177\u3002",
      "stderr": "\u26D4 [ADD PreToolUse \xA7A] \u963B\u65AD: \u7981\u6B62\u901A\u8FC7 tee/dd \u5199\u5165\u6587\u4EF6\u3002\n\n  \u2192 \u8BF7\u6539\u7528 Write \u6216 SearchReplace \u5DE5\u5177\u3002\n"
    },
    {
      "id": "cp-mv-touch",
      "regex": "(^|;|\\|\\||&&|\\|)\\s*(cp|mv|touch)\\b",
      "reason": "\u7981\u6B62\u901A\u8FC7 cp/mv/touch \u64CD\u4F5C\u6587\u4EF6\u3002\u8BF7\u4F7F\u7528 Write \u6216 SearchReplace \u5DE5\u5177\u3002",
      "stderr": "\u26D4 [ADD PreToolUse \xA7A] \u963B\u65AD: \u7981\u6B62\u901A\u8FC7 cp/mv/touch \u64CD\u4F5C\u6587\u4EF6\u3002\n\n  \u2192 \u8BF7\u6539\u7528 Write \u6216 SearchReplace \u5DE5\u5177\u3002\n"
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
      "reason": "\u5371\u9669\u547D\u4EE4\u5DF2\u88AB\u963B\u6B62",
      "stderr": "\u26D4 \u5371\u9669\u547D\u4EE4\u5DF2\u88AB\u963B\u6B62: {{cmd}}\n"
    },
    {
      "adapter": "trae",
      "id": "script-interpreter",
      "regex": "(^|;|\\|\\||&&|\\|)\\s*(python3?|node|ruby|perl|php)(\\s|$)",
      "reason": "\u7981\u6B62\u901A\u8FC7\u811A\u672C\u89E3\u91CA\u5668\u76F4\u63A5\u4FEE\u6539\u6587\u4EF6\u3002\u8BF7\u4F7F\u7528 Write \u6216 SearchReplace \u5DE5\u5177\u64CD\u4F5C\u6587\u4EF6\u3002",
      "stderr": "\u26D4 [ADD PreToolUse \xA7A] \u963B\u65AD: \u7981\u6B62\u901A\u8FC7\u811A\u672C\u89E3\u91CA\u5668\u76F4\u63A5\u4FEE\u6539\u6587\u4EF6\u3002\n\n  python/node/ruby/perl/php \u53EF\u5728\u811A\u672C\u4E2D\u5199\u5165\u4EFB\u610F\u6587\u4EF6\uFF0C\u7ED5\u8FC7:\n    \xB7 Plan \u5173\u8054\u68C0\u67E5\uFF08\u54EA\u4E2A\u6587\u4EF6\u5C5E\u4E8E\u54EA\u4E2A ADD Plan\uFF1F\uFF09\n    \xB7 doc-format-guard\uFF08\u7AE0\u8282/\u5360\u4F4D\u7B26/\u7981\u6B62\u8BCD\u6821\u9A8C\uFF09\n    \xB7 \u5BA1\u8BA1\u8FFD\u8E2A\uFF08agentAudit \u65E0\u6CD5\u611F\u77E5 Bash \u5185\u90E8\u7684\u6587\u4EF6\u53D8\u66F4\uFF09\n\n  \u2192 \u8BF7\u6539\u7528 Write \u6216 SearchReplace \u5DE5\u5177\u64CD\u4F5C\u6587\u4EF6\u3002\n  \u2192 \u5982\u9700\u8FD0\u884C\u6784\u5EFA/\u6D4B\u8BD5\u811A\u672C\uFF0C\u4F7F\u7528 npx/pnpm/npm \u547D\u4EE4\u3002\n"
    },
    {
      "adapter": "trae",
      "id": "sed-in-place",
      "regex": "(^|[;&|]\\s*)sed\\s+([^;&|]*\\s)?(-[a-zA-Z]*i[^;&|]*|--in-place(=[^;&|]*)?)([\\s;&|]|$)",
      "reason": "\u7981\u6B62\u901A\u8FC7 sed -i \u76F4\u63A5\u7F16\u8F91\u6587\u4EF6\u3002\u8BF7\u4F7F\u7528 SearchReplace \u5DE5\u5177\u3002",
      "stderr": "\u26D4 [ADD PreToolUse \xA7A] \u963B\u65AD: \u7981\u6B62\u901A\u8FC7 sed -i \u539F\u5730\u7F16\u8F91\u6587\u4EF6\u3002\n\n  sed -i \u76F4\u63A5\u5199\u5165\u6587\u4EF6\uFF0C\u7ED5\u8FC7 IDE \u5DE5\u5177\u5C42\u7684\u6240\u6709\u6821\u9A8C\u3002\n  \u2192 \u8BF7\u6539\u7528 SearchReplace \u5DE5\u5177\u3002\n"
    },
    {
      "adapter": "trae",
      "id": "redirect",
      "regex": "[>]{1,2}\\s+\\S",
      "reason": "\u7981\u6B62\u901A\u8FC7\u91CD\u5B9A\u5411\u5199\u5165\u6587\u4EF6\u3002\u8BF7\u4F7F\u7528 Write \u5DE5\u5177\u3002",
      "stderr": "\u26D4 [ADD PreToolUse \xA7A] \u963B\u65AD: \u7981\u6B62\u901A\u8FC7\u91CD\u5B9A\u5411(>/>>)\u5199\u5165\u6587\u4EF6\u3002\n\n  \u91CD\u5B9A\u5411\u5199\u5165\u7ED5\u8FC7 IDE \u5DE5\u5177\u5C42\uFF0C\u53D8\u66F4\u65E0\u6CD5\u8FFD\u8E2A\u3002\n  \u2192 \u8BF7\u6539\u7528 Write \u5DE5\u5177\u3002\n"
    },
    {
      "adapter": "trae",
      "id": "tee-dd",
      "regex": "\\btee\\b|\\bdd\\b.*of=",
      "reason": "\u7981\u6B62\u901A\u8FC7 tee/dd \u5199\u5165\u6587\u4EF6\u3002\u8BF7\u4F7F\u7528 Write \u6216 SearchReplace \u5DE5\u5177\u3002",
      "stderr": "\u26D4 [ADD PreToolUse \xA7A] \u963B\u65AD: \u7981\u6B62\u901A\u8FC7 tee/dd \u5199\u5165\u6587\u4EF6\u3002\n\n  \u2192 \u8BF7\u6539\u7528 Write \u6216 SearchReplace \u5DE5\u5177\u3002\n"
    },
    {
      "adapter": "trae",
      "id": "cp-mv-touch",
      "regex": "(^|;|\\|\\||&&|\\|)\\s*(cp|mv|touch)\\b",
      "reason": "\u7981\u6B62\u901A\u8FC7 cp/mv/touch \u64CD\u4F5C\u6587\u4EF6\u3002\u8BF7\u4F7F\u7528 Write \u6216 SearchReplace \u5DE5\u5177\u3002",
      "stderr": "\u26D4 [ADD PreToolUse \xA7A] \u963B\u65AD: \u7981\u6B62\u901A\u8FC7 cp/mv/touch \u64CD\u4F5C\u6587\u4EF6\u3002\n\n  \u2192 \u8BF7\u6539\u7528 Write \u6216 SearchReplace \u5DE5\u5177\u3002\n"
    },
    {
      "adapter": "claude",
      "id": "dangerous-command",
      "regex": "rm\\s+-rf\\s+/|DROP\\s+TABLE|git\\s+push\\s+--force|mkfs\\.|dd\\s+if=",
      "flags": "i",
      "reason": "\u5371\u9669\u547D\u4EE4\u5DF2\u88AB\u963B\u6B62",
      "stderr": "\u26D4 \u5371\u9669\u547D\u4EE4\u5DF2\u88AB\u963B\u6B62: {{cmd}}\n"
    },
    {
      "adapter": "claude",
      "id": "terminal-write",
      "regex": "(cat|echo|tee|sed\\s+-i|awk|printf|cp|mv|dd|touch)\\s*.*([>]{1,2}|[|]\\s*tee|<<)",
      "flags": "",
      "reason": "\u7981\u6B62\u901A\u8FC7\u7EC8\u7AEF\u76F4\u63A5\u5199\u6587\u4EF6",
      "stderr": "\u26D4 \u7981\u6B62\u901A\u8FC7\u7EC8\u7AEF\u547D\u4EE4\u76F4\u63A5\u5199\u6587\u4EF6: {{cmd}}\u3002\u8BF7\u4F7F\u7528 Write/Edit/SearchReplace \u5DE5\u5177\u3002\n"
    },
    {
      "adapter": "claude",
      "id": "cp-mv-touch",
      "regex": "(^|;|\\|\\||&&|\\|)\\s*(cp|mv|touch)\\b",
      "flags": "",
      "reason": "\u7981\u6B62\u901A\u8FC7 cp/mv/touch \u64CD\u4F5C\u6587\u4EF6",
      "stderr": "\u26D4 \u7981\u6B62\u901A\u8FC7 cp/mv/touch \u64CD\u4F5C\u6587\u4EF6: {{cmd}}\u3002\u8BF7\u4F7F\u7528 Write \u6216 SearchReplace \u5DE5\u5177\u3002\n"
    },
    {
      "adapter": "claude",
      "id": "script-interpreter",
      "regex": "(^|;|\\|\\||&&|\\|)\\s*(python3?|node|ruby|perl|php)(\\s|$)",
      "flags": "",
      "reason": "\u7981\u6B62\u901A\u8FC7\u811A\u672C\u89E3\u91CA\u5668\u76F4\u63A5\u4FEE\u6539\u6587\u4EF6",
      "stderr": "\u26D4 \u7981\u6B62\u901A\u8FC7\u811A\u672C\u89E3\u91CA\u5668\u76F4\u63A5\u5199\u6587\u4EF6: {{cmd}}\u3002\u8BF7\u4F7F\u7528 Write \u6216 SearchReplace \u5DE5\u5177\u3002\n"
    },
    {
      "adapter": "qoder",
      "id": "dangerous-command",
      "regex": "rm\\s+-rf\\s+/|DROP\\s+TABLE|git\\s+push\\s+--force|mkfs\\.|dd\\s+if=",
      "flags": "i",
      "reason": "\u5371\u9669\u547D\u4EE4\u5DF2\u88AB\u963B\u6B62",
      "stderr": "\u26D4 \u5371\u9669\u547D\u4EE4\u5DF2\u88AB\u963B\u6B62: {{cmd}}\n"
    },
    {
      "adapter": "qoder",
      "id": "terminal-write",
      "regex": "(cat|echo|tee|sed\\s+-i|awk|printf|cp|mv|dd|touch)\\s*.*([>]{1,2}|[|]\\s*tee|<<)",
      "flags": "",
      "reason": "\u7981\u6B62\u901A\u8FC7\u7EC8\u7AEF\u76F4\u63A5\u5199\u6587\u4EF6",
      "stderr": "\u26D4 \u7981\u6B62\u901A\u8FC7\u7EC8\u7AEF\u547D\u4EE4\u76F4\u63A5\u5199\u6587\u4EF6: {{cmd}}\u3002\u8BF7\u4F7F\u7528 Write/Edit/SearchReplace \u5DE5\u5177\u3002\n"
    },
    {
      "adapter": "qoder",
      "id": "cp-mv-touch",
      "regex": "(^|;|\\|\\||&&|\\|)\\s*(cp|mv|touch)\\b",
      "flags": "",
      "reason": "\u7981\u6B62\u901A\u8FC7 cp/mv/touch \u64CD\u4F5C\u6587\u4EF6",
      "stderr": "\u26D4 \u7981\u6B62\u901A\u8FC7 cp/mv/touch \u64CD\u4F5C\u6587\u4EF6: {{cmd}}\u3002\u8BF7\u4F7F\u7528 Write \u6216 SearchReplace \u5DE5\u5177\u3002\n"
    },
    {
      "adapter": "qoder",
      "id": "script-interpreter",
      "regex": "(^|;|\\|\\||&&|\\|)\\s*(python3?|node|ruby|perl|php)(\\s|$)",
      "flags": "",
      "reason": "\u7981\u6B62\u901A\u8FC7\u811A\u672C\u89E3\u91CA\u5668\u76F4\u63A5\u4FEE\u6539\u6587\u4EF6",
      "stderr": "\u26D4 \u7981\u6B62\u901A\u8FC7\u811A\u672C\u89E3\u91CA\u5668\u76F4\u63A5\u5199\u6587\u4EF6: {{cmd}}\u3002\u8BF7\u4F7F\u7528 Write \u6216 SearchReplace \u5DE5\u5177\u3002\n"
    },
    {
      "adapter": "codex",
      "id": "dangerous-command",
      "regex": "rm\\s+-rf\\s+/|DROP\\s+TABLE|git\\s+push\\s+--force|mkfs\\.|dd\\s+if=",
      "flags": "i",
      "reason": "\u5371\u9669\u547D\u4EE4\u5DF2\u88AB\u963B\u6B62\uFF1B\u8BF7\u4F7F\u7528 apply_patch\u3002"
    },
    {
      "adapter": "codex",
      "id": "script-interpreter",
      "regex": "(^|;|\\|\\||&&|\\|)\\s*(python3?|node|ruby|perl|php)(\\s|$)",
      "reason": "\u7981\u6B62\u901A\u8FC7\u811A\u672C\u89E3\u91CA\u5668\u76F4\u63A5\u4FEE\u6539\u6587\u4EF6\uFF1B\u8BF7\u4F7F\u7528 apply_patch\u3002"
    },
    {
      "adapter": "codex",
      "id": "sed-in-place",
      "regex": "(^|[;&|]\\s*)sed\\s+([^;&|]*\\s)?(-[a-zA-Z]*i[^;&|]*|--in-place(=[^;&|]*)?)([\\s;&|]|$)",
      "reason": "\u7981\u6B62\u901A\u8FC7 sed -i \u76F4\u63A5\u7F16\u8F91\u6587\u4EF6\uFF1B\u8BF7\u4F7F\u7528 apply_patch\u3002"
    },
    {
      "adapter": "codex",
      "id": "redirect",
      "regex": "[>]{1,2}\\s+\\S",
      "reason": "\u7981\u6B62\u901A\u8FC7\u91CD\u5B9A\u5411\u5199\u5165\u6587\u4EF6\uFF1B\u8BF7\u4F7F\u7528 apply_patch\u3002"
    },
    {
      "adapter": "codex",
      "id": "tee-dd",
      "regex": "\\btee\\b|\\bdd\\b.*of=",
      "reason": "\u7981\u6B62\u901A\u8FC7 tee/dd \u5199\u5165\u6587\u4EF6\uFF1B\u8BF7\u4F7F\u7528 apply_patch\u3002"
    },
    {
      "adapter": "codex",
      "id": "cp-mv-touch",
      "regex": "(^|;|\\|\\||&&|\\|)\\s*(cp|mv|touch)\\b",
      "reason": "\u7981\u6B62\u901A\u8FC7 cp/mv/touch \u6539\u53D8\u6587\u4EF6\uFF1B\u8BF7\u4F7F\u7528 apply_patch\u3002"
    },
    {
      "adapter": "vscode",
      "id": "dangerous-command",
      "regex": "rm\\s+-rf\\s+/|DROP\\s+TABLE|git\\s+push\\s+--force|mkfs\\.|dd\\s+if=",
      "flags": "i",
      "reason": "\u5371\u9669\u547D\u4EE4\u5DF2\u88AB\u963B\u6B62",
      "stderr": "\u26D4 \u5371\u9669\u547D\u4EE4\u5DF2\u88AB\u963B\u6B62: {{cmd}}\n"
    },
    {
      "adapter": "vscode",
      "id": "terminal-write",
      "regex": "(cat|echo|tee|sed\\s+-i|awk|printf|cp|mv|dd|touch)\\s*.*([>]{1,2}|[|]\\s*tee|<<)",
      "flags": "",
      "reason": "\u7981\u6B62\u901A\u8FC7\u7EC8\u7AEF\u76F4\u63A5\u5199\u6587\u4EF6",
      "stderr": "\u26D4 \u7981\u6B62\u901A\u8FC7\u7EC8\u7AEF\u547D\u4EE4\u76F4\u63A5\u5199\u6587\u4EF6: {{cmd}}\u3002\u8BF7\u4F7F\u7528 Write/Edit/SearchReplace \u5DE5\u5177\u3002\n"
    },
    {
      "adapter": "vscode",
      "id": "cp-mv-touch",
      "regex": "(^|;|\\|\\||&&|\\|)\\s*(cp|mv|touch)\\b",
      "flags": "",
      "reason": "\u7981\u6B62\u901A\u8FC7 cp/mv/touch \u64CD\u4F5C\u6587\u4EF6",
      "stderr": "\u26D4 \u7981\u6B62\u901A\u8FC7 cp/mv/touch \u64CD\u4F5C\u6587\u4EF6: {{cmd}}\u3002\u8BF7\u4F7F\u7528 Write \u6216 SearchReplace \u5DE5\u5177\u3002\n"
    },
    {
      "adapter": "vscode",
      "id": "script-interpreter",
      "regex": "(^|;|\\|\\||&&|\\|)\\s*(python3?|node|ruby|perl|php)(\\s|$)",
      "flags": "",
      "reason": "\u7981\u6B62\u901A\u8FC7\u811A\u672C\u89E3\u91CA\u5668\u76F4\u63A5\u4FEE\u6539\u6587\u4EF6",
      "stderr": "\u26D4 \u7981\u6B62\u901A\u8FC7\u811A\u672C\u89E3\u91CA\u5668\u76F4\u63A5\u5199\u6587\u4EF6: {{cmd}}\u3002\u8BF7\u4F7F\u7528 Write \u6216 SearchReplace \u5DE5\u5177\u3002\n"
    }
  ],
  "sensitive_files": {
    "regex": "(^|\\/)\\.env$|(^|\\/)\\.env\\.production$|(^|\\/)\\.env\\.local$|credentials|secrets",
    "deny_reason": "\u654F\u611F\u6587\u4EF6\u53D7\u4FDD\u62A4"
  },
  "template_hints": [
    {
      "pattern": "plan-v\\d",
      "message": "\u{1F4A1} [ADD PreToolUse] \u5199\u5165 Plan \u2192 \u6A21\u677F: standard-plan-template.md\uFF08\u6807\u51C6\uFF09\u6216 simple-plan-template.md\uFF08\u22643\u6587\u4EF6\uFF09"
    },
    {
      "pattern": "add-route",
      "message": "\u{1F4A1} [ADD PreToolUse] \u5199\u5165 ADD Route \u2192 \u6A21\u677F: add-route-template.md"
    },
    {
      "pattern": "handoff",
      "message": "\u{1F4A1} [ADD PreToolUse] \u5199\u5165 Handoff \u2192 \u6A21\u677F: handoff-single-round-template.md\uFF08\u5355\u8F6E\uFF09\u6216 handoff-multi-round-template.md\uFF08\u591A\u8F6E\uFF09"
    }
  ],
  "thresholds": {
    "large_file_bytes": 2e3
  },
  "hitl_exemptions": {
    "suffixes": [
      "-handoff",
      "-runtime"
    ]
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
function markDevAction() {
  try {
    writeFileSync(DEV_FLAG, "");
  } catch {
  }
}

// templates/core/governance/pre-tool-guard.ts
import { existsSync as existsSync3, mkdirSync as mkdirSync2, appendFileSync as appendFileSync2, statSync as statSync2 } from "node:fs";
import { join as join3, basename as basename2 } from "node:path";

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

// templates/core/governance/pre-tool-guard.ts
function askJson(reason) {
  return `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"${reason}"}}`;
}
function allowJson(reason) {
  return `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"${reason}"}}`;
}
function denyJson(reason) {
  return `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"${reason}"}}`;
}
var PreToolUseGuard = class {
  projectDir;
  magicDir;
  planKeyword;
  planStatus;
  adapterName;
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
  // ─────────────────────────── 扩展点 ───────────────────────────
  /** 检测链加载（真源: [guard.detectors] 基线 / [guard.adapter_detectors] 独立链） */
  detectorChain() {
    if (this.adapterName === "core") {
      return guard.detectors ?? [];
    }
    const all = guard.adapter_detectors ?? [];
    return all.filter((d) => d.adapter === this.adapterName);
  }
  /** §A 阻断输出（core 协议: stderr + askJson + 阻断日志 + 事件 + 2） */
  onBlock(blocked, command2) {
    process.stderr.write(blocked.stderr);
    process.stdout.write(askJson(blocked.reason) + "\n");
    this.logBlock("\u68C0\u6D4B\u5668\u94FE", command2);
    writeHookEvent("pre-tool-use", "deny", command2, blocked.reason, this.planKeyword, this.planStatus);
    return 2;
  }
  /** §A 放行后处理（core: 无操作；claude: bash 原文 mark_dev_action） */
  onSectionAPass(_command) {
  }
  /** §B 无 Plan 放行（core 协议: 提示 + allowJson + 事件 + 0） */
  onNoPlanAllow(toolName2, filePath) {
    process.stderr.write("[ADD \u63D0\u793A] \u6B63\u5728\u5199\u5165 Plan/Spec/Review \u6587\u6863\u4F46\u65E0\u6D3B\u8DC3 ADD Plan\u2014\u2014\u9996\u6B21\u521B\u5EFA\u573A\u666F\u653E\u884C\uFF0C\u5EFA\u8BAE\u5148\u6267\u884C add-paradigm \u751F\u6210 Plan+add-route\n");
    process.stdout.write(allowJson("\u65E0\u6D3B\u8DC3 ADD Plan \u4F46\u4E3A Plan/Spec/Review \u5199\u5165\uFF08\u9996\u6B21\u521B\u5EFA\u573A\u666F\uFF09\uFF0C\u63D0\u793A\u800C\u975E\u62E6\u622A") + "\n");
    writeHookEvent("pre-tool-use", "info", `${toolName2} ${filePath}`, "\u65E0\u6D3B\u8DC3 ADD Plan \u4E0B\u5199\u5165 Plan/Spec/Review\uFF08\u9996\u6B21\u521B\u5EFA\u653E\u884C\uFF09", this.planKeyword, this.planStatus);
    return 0;
  }
  /** §B 敏感文件阻断（core 协议: stderr + denyJson + 2） */
  onSensitiveDeny(filePath) {
    const sensReason = guard.sensitive_files.deny_reason;
    process.stderr.write(`\u26D4 \u654F\u611F\u6587\u4EF6\u53D7\u4FDD\u62A4\uFF0C\u7981\u6B62\u5199\u5165: ${filePath}
`);
    process.stdout.write(denyJson(sensReason) + "\n");
    return 2;
  }
  /** 大文件适配提示文本（core: payload 限制；qoder: Qoder 40500 错误码） */
  largeFileText(fsize) {
    return `\u26A0\uFE0F [ADD PreToolUse] \u6587\u4EF6\u5DF2\u6709 ${fsize} \u5B57\u8282\uFF0CWrite \u5168\u91CF\u8986\u76D6\u53EF\u80FD\u89E6\u53D1\u5DE5\u5177 payload \u9650\u5236\u3002\u5EFA\u8BAE\u7528 SearchReplace \u5206\u5757\u8FFD\u52A0\u3002
`;
  }
  /** HITL 未 tongyi 输出（core 协议: stderr 3 行 + JSON deny + 事件 + exit 0；qoder: exit 2 + event ask） */
  onHitlDeny(toolName2, filePath, tongyiMarker) {
    process.stderr.write(`\u26D4 [ADD PreToolUse \xA7C] HITL \u672A tongyi: ${filePath}
`);
    process.stderr.write(`   \u539F\u56E0: \u54E8\u5175\u6587\u4EF6 ${tongyiMarker} \u4E0D\u5B58\u5728
`);
    process.stderr.write('   \u64CD\u4F5C: \u8BF7\u5148\u8C03\u7528 create_hitl \u521B\u5EFA\u5BA1\u6279\uFF0C\u518D update_hitl({ status: "TONGYI" })\n');
    const reason = `HITL \u672A tongyi: \u54E8\u5175 ${tongyiMarker} \u4E0D\u5B58\u5728\u3002\u8BF7\u5148 create_hitl \u2192 \u4EBA\u5DE5 tongyi \u2192 update_hitl \u540E\u518D\u5199\u5165`;
    process.stdout.write(
      `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"${reason}","additionalContext":"${reason}"}}
`
    );
    writeHookEvent("pre-tool-use", "deny", `${toolName2} ${filePath}`, `HITL \u672A tongyi: ${tongyiMarker}`, this.planKeyword, this.planStatus);
    return 0;
  }
  /** 附加 matcher（core: 无；claude: ③ Read 模板提示） */
  onOtherTool(_input, _toolName) {
    return 0;
  }
  // ─────────────────────────── 流程固化 ───────────────────────────
  /** 阻断日志（对齐 bash _log_block：追加到 debug-dump/stdin.log） */
  logBlock(rule, cmd) {
    try {
      const dir = join3(this.projectDir, this.magicDir, "debug-dump");
      mkdirSync2(dir, { recursive: true });
      appendFileSync2(
        join3(dir, "stdin.log"),
        `=== ${localIsoSeconds()} [BLOCKED by \xA7A: ${rule}] ===
command: ${cmd.slice(0, 300)}
=== DONE ===
`
      );
    } catch {
    }
  }
  /** §A 检测器链判定：返回阻断结果，放行返回 null */
  checkBashCommand(command2) {
    for (const d of this.detectorChain()) {
      if (new RegExp(d.regex, d.flags ?? "").test(command2)) {
        return { reason: d.reason, stderr: d.stderr };
      }
    }
    return null;
  }
  /** §A 入口：Bash 工具写入保护（模板方法） */
  runSectionA(input2) {
    const command2 = jsonGet(input2, "command");
    if (command2 === "") return 0;
    const blocked = this.checkBashCommand(command2);
    if (blocked) {
      return this.onBlock(blocked, command2);
    }
    this.onSectionAPass(command2);
    return 0;
  }
  /** §B 入口：Write/Edit 文件写入前置守卫（模板方法） */
  runSectionB(input2, toolName2) {
    if (toolName2 !== "Write" && toolName2 !== "Edit" && toolName2 !== "SearchReplace") return 0;
    const filePath = jsonGet(input2, "file_path");
    if (filePath === "") return 0;
    if (new RegExp(`${this.magicDir}/(plans|specs|reviews)/`).test(filePath)) {
      const state = detectActiveAdd();
      if (state === null) {
        if (this.noPlanHint()) {
          process.stderr.write(`[ADD PreToolUse] \u6B63\u5728\u4FEE\u6539 ADD \u6587\u6863\u4F46\u672A\u68C0\u6D4B\u5230\u6D3B\u8DC3 Plan: ${filePath}
`);
        } else {
          return this.onNoPlanAllow(toolName2, filePath);
        }
      }
    }
    const guardCode = this.guardFilePath(filePath, toolName2);
    if (guardCode !== 0) return guardCode;
    markDevAction();
    return 0;
  }
  /**
   * guard 核心（敏感文件 → HITL → 模板提示；codex apply_patch 路径逐文件复用）:
   *   敏感 → onSensitiveDeny；HITL → onHitlDeny；模板提示/大文件 → stderr
   *   返回阻断码（非 0 = 阻断，调用方必须透传 exit）——
   *   2026-08-14 Task 9.4 修复: 原返回 void 丢弃 onSensitiveDeny/onHitlDeny 的 exit 2（敏感文件拦截形同虚设）
   */
  guardFilePath(filePath, toolName2) {
    const sensRegex = this.sensitiveFileRegex();
    if (new RegExp(sensRegex).test(filePath)) {
      return this.onSensitiveDeny(filePath);
    }
    if (new RegExp(`${this.magicDir}/(plans)/`).test(filePath)) {
      const fname = basename2(filePath);
      for (const hint of guard.template_hints ?? []) {
        if (new RegExp(hint.pattern).test(fname)) {
          process.stderr.write(hint.message + "\n");
        }
      }
      if (toolName2 === "Write" && existsSync3(filePath)) {
        const fsize = statSync2(filePath).size;
        const limit = guard.thresholds.large_file_bytes;
        if (fsize > limit) {
          process.stderr.write(this.largeFileText(fsize));
        }
      }
    }
    let doHitl = false;
    if (new RegExp(`${this.magicDir}/(plans)/`).test(filePath)) {
      doHitl = !filePath.includes("-handoff");
    } else if (new RegExp(`${this.magicDir}/(reviews)/`).test(filePath)) {
      doHitl = !this.hitlExemptReviews().test(filePath);
    }
    if (doHitl) {
      if (!new RegExp(`${this.magicDir}/(plans|reviews)/`).test(filePath)) {
        doHitl = false;
      } else {
        const relative = filePath.replace(/.*\/\.(qoder|claude|add|vscode|trae|codex)\/(plans|reviews)\//, "");
        const planName = basename2(relative, ".md").replace(/\.hitl$/, "").replace(/-plan-v\d*$/, "").replace(/-add-route-v\d*$/, "").replace(/-review-v\d*$/, "").replace(/-review-implementation$/, "").replace(/-review-runtime$/, "");
        if (planName !== "") {
          const markers = this.hitlMarkers(planName);
          if (!markers.some((m) => existsSync3(join3(this.projectDir, this.magicDir, "hitl", m)))) {
            const tongyiMarker = markers[0];
            return this.onHitlDeny(toolName2, filePath, tongyiMarker);
          }
        }
      }
    }
    return 0;
  }
  // ─────────────────────────── 扩展点（续）───────────────────────────
  /** 敏感文件正则（core: TOML 真源；codex 子类: 锚定版 `(^|\/)(...)$|credentials|secrets`） */
  sensitiveFileRegex() {
    return guard.sensitive_files.regex;
  }
  /** Reviews HITL 豁免（仅 -runtime；review-implementation-* 也走 HITL——2026-08-14 Task 9.4.4③ 上提，回流: I2） */
  hitlExemptReviews() {
    return /-runtime/;
  }
  /** HITL 哨兵（[full, base] 双哨兵——2026-08-14 Task 9.4.4② 上提，回流: I2；
   *  与 MCP update_hitl 双命名哨兵（原始 planName + 剥后缀推导名）对齐） */
  hitlMarkers(planName) {
    const base = planName.replace(/-plan-v\d*$/, "").replace(/-add-route-v\d*$/, "").replace(/-review-v\d*$/, "").replace(/-review-implementation$/, "").replace(/-review-runtime$/, "");
    return [`.tongyi-${planName}`, `.tongyi-${base}`];
  }
  /** 无 Plan 分支语义（core: onNoPlanAllow return；codex 子类: 仅 stderr 提示后继续） */
  noPlanHint() {
    return false;
  }
  /** §C 入口：其他工具 matcher（模板方法，默认委托扩展点） */
  runSectionC(input2, toolName2) {
    return this.onOtherTool(input2, toolName2);
  }
};

// templates/core/hooks/pre-tool-use.ts
var input = readHookInput();
var PROJECT_DIR = process.env.PROJECT_DIR || process.cwd();
var MAGIC_DIR = process.env.MAGIC_DIR;
if (!MAGIC_DIR) {
  MAGIC_DIR = tryResolveMagicDir() || ".qoder";
}
var guard2 = new PreToolUseGuard(PROJECT_DIR, MAGIC_DIR);
var toolName = jsonGet(input, "tool_name");
var command = jsonGet(input, "command");
var exitCode = 0;
if (command !== "") {
  exitCode = guard2.runSectionA(input);
  if (exitCode !== 0) process.exit(exitCode);
} else {
  exitCode = guard2.runSectionB(input, toolName);
  if (exitCode !== 0) process.exit(exitCode);
}
process.exit(0);
