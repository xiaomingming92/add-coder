#!/bin/bash
# UserPromptSubmit — 触发词路由 + 模板全文注入（Claude Code 适配）
# 治理卡位 #3: Layer 1 精准触发 → Layer 2 阻断 → Layer 3 状态注入
set -euo pipefail

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
export CURRENT_MAGIC=$(basename "$(dirname "$HOOK_DIR")")

COMMON_LIB="$HOOK_DIR/lib/common.sh"
[ -f "$COMMON_LIB" ] && source "$COMMON_LIB"

export PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"

input=$(parse_input)
prompt=$(echo "$input" | grep -o '"prompt"[[:space:]]*:[[:space:]]*"[^"]*"' 2>/dev/null | sed 's/.*: *"\([^"]*\)".*/\1/' || echo "")
[ -z "$prompt" ] && exit 0

# ─── Layer 1: 精准触发词路由 + 验收幂等保护 ───
matched=$(match_trigger "$prompt")
if [ -n "$matched" ]; then
  if echo "$prompt" | grep -qiE '验收|收敛' 2>/dev/null; then
    add_state=$(detect_active_add 2>/dev/null || true)
    if [ -n "$add_state" ]; then
      _handoff=$(echo "$add_state" | awk -F'::' '{print $4}')
      _add_route=$(echo "$add_state" | awk -F'::' '{print $5}')
      if is_already_accepted "$_add_route" "$_handoff" 2>/dev/null; then
        cat <<EOF
[ADD 验收] ⚠️ 已验收。进入 Review 模式:
  ① 重新检查 checklist [T]/[R] 项
  ② 审查 audit 记录完整性
  ③ 如有差异 → Review 回流至 handoff（增量更新）
  ④ 无差异 → 记录 'Review 已确认，无新发现'
EOF
        exit 0
      fi
    fi
  fi
  echo "$matched"
  exit 0
fi

# ─── 开发关键词检测 ───
if ! echo "$prompt" | grep -qiE '开发|改功能|修.?bug|加需求|新增|重构|实施|验收|继续|生成plan|生成计划'; then
  exit 0
fi

echo "[ADD PromptSubmit] 检测到开发关键词" >&2

# ─── Layer 2: 无活跃 ADD → 阻断 ───
state=$(detect_active_add 2>/dev/null || true)
if [ -z "$state" ]; then
  cat <<'EOF'
[ADD 强制规则] 检测到开发任务。你必须先执行 add-paradigm SKILL 完成 ADD 工作流:
  Step 0: 文档先行 (Plan → Review → Specs)
  Step 3: 代码实现 + 审计植入
  Step 8: 收敛判断
如果 add-paradigm SKILL 尚未激活，请先调用它。
EOF
  exit 2
fi

# ─── Layer 3: 有活跃 ADD → 注入状态 + 模板全文 ───
IFS='::' read -r plan step rounds handoff add_route <<< "$state"
cat <<EOF
[ADD 当前状态]
  Plan: ${plan}
  轮次: ${rounds}
  当前 Step: ${step}
  handoff: ${handoff}
EOF

# 模板全文注入（tpl-injected 去重）
TPL_SCRIPT="$HOOK_DIR/lib/preload-templates.sh"
if [ -f "$TPL_SCRIPT" ]; then
  bash "$TPL_SCRIPT" --full --top 5
fi

exit 0
