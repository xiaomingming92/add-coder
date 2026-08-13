#!/bin/bash
# SubagentStop — 通用版（核心模板，Trae 等适配器继承）
# 治理卡位 #11: 子agent边界校验 + 审计聚合 + 阻断
set -euo pipefail

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
COMMON_LIB="$HOOK_DIR/lib/common.sh"
[ -f "$COMMON_LIB" ] && source "$COMMON_LIB"

export PROJECT_DIR="$PWD"

input=$(cat 2>/dev/null || echo "{}")
agent_name=$(echo "$input" | jq -r '.agent_type // .subagent_name // "unknown"' 2>/dev/null || echo "unknown")

# ── ① 边界校验：检查子 agent 交付物是否超出 spec 范围 ──
state=$(detect_active_add 2>/dev/null || true)
if [ -z "$state" ]; then
  echo "[ADD SubagentStop] ⚠️ ${agent_name} 已完成，但无活跃 ADD Plan 无法校验边界" >&2
  exit 0
fi

plan_kw=$(echo "$state" | awk -F'::' '{print $1}')
handoff=$(echo "$state" | awk -F'::' '{print $4}')

echo "[ADD SubagentStop] ${agent_name} 已完成 — 关联 Plan: ${plan_kw}" >&2

# 如果 handoff 中存在允许的文件清单，检查交付物是否越界
if [ -f "$handoff" ]; then
  deliverables=$(echo "$input" | jq -r '.deliverables // ""' 2>/dev/null || echo "")
  if [ -n "$deliverables" ]; then
    violations=""
    for f in $deliverables; do
      if ! grep -q "$f" "$handoff" 2>/dev/null; then
        violations="${violations} $f"
      fi
    done
    if [ -n "$violations" ]; then
      echo "[ADD SubagentStop] ❌ ${agent_name} 交付物超出 spec 边界: ${violations}" >&2
      echo "[ADD SubagentStop] 要求重做——请检查这些文件是否属于本轮 spec 范围" >&2
      exit "${EXIT_BLOCK:-2}"
    fi
  fi
fi

# ── ② 审计聚合 ──
echo "[ADD SubagentStop] ${agent_name} 边界校验通过 — $(date -Iseconds)" >&2
exit 0
