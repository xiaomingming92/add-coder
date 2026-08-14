#!/bin/bash
# post-tool-use.sh — PostToolUse：格式化 + 文档守卫 + 审计提醒 + DPS 自动化
# 治理卡位 #5: 格式化 + ADD文档守卫 + 审计落库 + 结果增强 + 哨兵自动化
set -euo pipefail

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
COMMON_LIB="$HOOK_DIR/lib/common.sh"
[ -f "$COMMON_LIB" ] && source "$COMMON_LIB"

input=$(parse_input)
tool_name=$(json_get "$input" "tool_name")
[ -z "$tool_name" ] && tool_name=$(echo "$input" | grep -o '"tool_name"[[:space:]]*:[[:space:]]*"[^"]*"' 2>/dev/null | sed 's/.*: *"\([^"]*\)".*/\1/' || echo "")

# ═══════════════ §1: HITL DPS 自动化 — check_dps ≥ 80 → 自动建哨兵 ═══════════════
# 检测 MCP check_dps 调用结果，DPS ≥ 80 自动 touch .tongyi-{plan} 哨兵
if echo "$input" | grep -q '"check_dps"'; then
  tool_output=$(echo "$input" | grep -o '"output"[[:space:]]*:[[:space:]]*"[^"]*"\|"content"[[:space:]]*:[[:space:]]*"[^"]*"' 2>/dev/null || echo "")
  dps_score=$(echo "$tool_output" | grep -oP 'DPS\s*=\s*\K\d+' 2>/dev/null || echo "")
  plan_keyword=$(echo "$input" | grep -oP '"planKeyword"\s*:\s*"\K[^"]+' 2>/dev/null || echo "")

  if [ -n "$dps_score" ] && [ -n "$plan_keyword" ]; then
    if [ "$dps_score" -ge 80 ] 2>/dev/null; then
      sentinel="${PROJECT_DIR:-$PWD}/${MAGIC_DIR:-.qoder}/hitl/.tongyi-${plan_keyword}"
      if [ ! -f "$sentinel" ]; then
        touch "$sentinel" 2>/dev/null && echo "[ADD PostToolUse] ✅ DPS=${dps_score} ≥80, HITL 自动通过 → ${sentinel}" >&2 || true
        echo "[ADD PostToolUse] DPS=${dps_score} ≥80, 已自动建哨兵 ${sentinel}" >&2
      else
        echo "[ADD PostToolUse] DPS=${dps_score} ≥80, 哨兵已存在 → ${sentinel}" >&2
      fi
    else
      echo "[ADD PostToolUse] ⚠️ DPS=${dps_score} <80, 需 Review 后手动建哨兵 .tongyi-${plan_keyword}" >&2
      echo "[ADD PostToolUse] 修复文档后重新 check_dps，通过即自动放行。" >&2
    fi
  fi
fi

# ═══════════════ §2: Edit/Write matcher: 格式化 + 文档守卫 + 自动 plan_track ═══════════════
if [ "$tool_name" = "Edit" ] || [ "$tool_name" = "Write" ]; then
  file_path=$(echo "$input" | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' 2>/dev/null | sed 's/.*: *"\([^"]*\)".*/\1/' || echo "")
  [ -z "$file_path" ] && exit 0

  # §2a: ADD 文档结构守卫
  if echo "$file_path" | grep -qE '\.(qoder|claude|add)/(plans|specs|reviews)/'; then
    echo "[ADD PostToolUse] ADD 文档已写入: ${file_path}。请确保章节完整、双向链接齐全。" >&2
  fi

  # §2b: plan_track 自动触发 — specs/ 或 add-route 写入后自动落库
  if echo "$file_path" | grep -qE '/(specs|plans)/.*add-route'; then
    plan_name=$(basename "$file_path" | sed 's/-add-route.*//' | sed 's/-plan-v[0-9]*$//')
    # 从路径提取完整 planName（含 -plan-vN 后缀）
    if echo "$file_path" | grep -qE 'add-route'; then
      # add-route 写入：从文件名反推 planName
      plan_prefix=$(basename "$file_path" | sed 's/-add-route-v[0-9]*\.md$//')
      plan_dir=$(dirname "$file_path")
      if [ -d "$plan_dir" ]; then
        plan_file=$(ls "$plan_dir"/*-plan-v*.md 2>/dev/null | head -1 || echo "")
        if [ -n "$plan_file" ]; then
          plan_name=$(basename "$plan_file" .md)
        fi
      fi
    fi
    if [ -n "$plan_name" ]; then
      echo "[ADD PostToolUse] 📊 自动同步 PlanRecord: plan_track({ planName: \"${plan_name}\" }) — 请执行" >&2
    fi
  fi

  # §2c: devlog 自动提醒 — add-route Step 8 全 [x] 时提醒
  if echo "$file_path" | grep -qE 'add-route.*\.md$'; then
    if [ -f "$file_path" ]; then
      step8_content=$(sed -n '/## Step 8/,/^## /p' "$file_path" 2>/dev/null || echo "")
      unchecked=$(echo "$step8_content" | grep -c '^\- \[ \]' 2>/dev/null || echo "0")
      checked=$(echo "$step8_content" | grep -c '^\- \[x\]' 2>/dev/null || echo "0")
      if [ "$unchecked" = "0" ] && [ "$checked" -gt 0 ]; then
        echo "[ADD PostToolUse] ⚠️ Step 8 全部收敛完成！请写 devlog日志(走mcp) → 更新 handoff" >&2
      fi
    fi
  fi

  # §2d: schema.json 自动 regen — 模板 .md 修改后更新对应 schema
  if echo "$file_path" | grep -qE 'templates/.*\.md$'; then
    schema_file="${file_path%.md}.schema.json"
    if [ -f "$schema_file" ]; then
      # 扫描模板实际 ## 标题，更新 schema sections
      headings=$(grep -oP '^## \K.+' "$file_path" 2>/dev/null | head -20 || echo "")
      if [ -n "$headings" ]; then
        echo "[ADD PostToolUse] 🔄 模板已修改，请检查 ${schema_file} 是否需更新（§ sections）" >&2
        echo "[ADD PostToolUse] 模板标题: $(echo "$headings" | tr '\n' ' ')" >&2
      fi
    fi
  fi

  # §2e: 审计提醒
  echo "[ADD PostToolUse] 文件已写入: ${file_path}。请执行 record_dev_operation 落库审计（ADD-7）。" >&2
  exit 0
fi

# ═══════════════ §3: Bash matcher: 结果增强 ═══════════════
if [ "$tool_name" = "Bash" ]; then
  echo "[ADD PostToolUse] 命令执行完成。如有 lint/tsc 错误请修复。" >&2
  exit 0
fi

exit 0
#!/bin/bash
# post-tool-use.sh — Claude Code PostToolUse：格式化 + 文档守卫 + 审计提醒
# 治理卡位 #5: 格式化 + ADD文档守卫 + 审计落库 + 结果增强
set -euo pipefail

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
COMMON_LIB="$HOOK_DIR/lib/common.sh"
[ -f "$COMMON_LIB" ] && source "$COMMON_LIB"

input=$(parse_input)
tool_name=$(json_get "$input" "tool_name")
[ -z "$tool_name" ] && tool_name=$(echo "$input" | grep -o '"tool_name"[[:space:]]*:[[:space:]]*"[^"]*"' 2>/dev/null | sed 's/.*: *"\([^"]*\)".*/\1/' || echo "")

# ── Edit/Write matcher: 格式化 + ADD文档守卫 ──
if [ "$tool_name" = "Edit" ] || [ "$tool_name" = "Write" ]; then
  file_path=$(echo "$input" | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' 2>/dev/null | sed 's/.*: *"\([^"]*\)".*/\1/' || echo "")
  [ -z "$file_path" ] && exit 0

  # ADD 文档结构守卫：写入 plans/specs/reviews 后提示
  if echo "$file_path" | grep -qE '\.(qoder|claude|add)/(plans|specs|reviews)/'; then
    echo "[ADD PostToolUse] ADD 文档已写入: ${file_path}。请确保章节完整、双向链接齐全、增量修订格式正确。" >&2
  fi

  # 审计提醒（所有文件写入）
  echo "[ADD PostToolUse] 文件已写入: ${file_path}。请执行 record_dev_operation 落库审计（ADD-7）。" >&2
  exit 0
fi

# ── Bash matcher: 结果增强 ──
if [ "$tool_name" = "Bash" ]; then
  echo "[ADD PostToolUse] 命令执行完成。如有 lint/tsc 错误请修复。" >&2
  exit 0
fi

exit 0
