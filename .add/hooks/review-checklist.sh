#!/bin/bash
# review-checklist.sh — 验收 Review 模式：检查 checklist 质量
# 被 prompt-submit.sh 的"验收"幂等检查后调用
# 
# 输入: handoff_path add_route_path
# 输出: checklist 质量问题清单

handoff="$1"
add_route="$2"
[ -z "$handoff" ] && exit 0

# 从 handoff 关联找到 spec 目录
plan_dir=$(dirname "$handoff")
plan_kw=$(basename "$handoff" | sed 's/-handoff.*//')

# 找 checklist
spec_dir=".qoder/specs/${plan_kw}"
checklist=""
[ -d "$spec_dir" ] && checklist="$spec_dir/checklist.md"
# fallback: 搜索
[ ! -f "$checklist" ] && checklist=$(find .qoder/specs -name "checklist.md" -path "*${plan_kw}*" 2>/dev/null | head -1)

tasks_file=""
[ -d "$spec_dir" ] && tasks_file="$spec_dir/tasks.md"
[ ! -f "$tasks_file" ] && tasks_file=$(find .qoder/specs -name "tasks.md" -path "*${plan_kw}*" 2>/dev/null | head -1)

issues=""

# ══════════════════════════════════════════════════════════════════════
# 0. Step 0 准入: ADD 核心文档存在性（BLOCKING）
# ══════════════════════════════════════════════════════════════════════
_missing_docs=""
if [ ! -f "$handoff" ]; then
  _missing_docs="${_missing_docs} Handoff"
else
  # 章节完整性: 至少要有 spec 文件/你要改的文件/验证标准/完成后记录 四个关键小节
  _h_sections=0
  grep -q "spec 文件" "$handoff" 2>/dev/null && _h_sections=$((_h_sections + 1))
  grep -q "你要改的文件" "$handoff" 2>/dev/null && _h_sections=$((_h_sections + 1))
  grep -q "验证标准" "$handoff" 2>/dev/null && _h_sections=$((_h_sections + 1))
  grep -q "完成后记录 ADD-7 审计" "$handoff" 2>/dev/null && _h_sections=$((_h_sections + 1))
  if [ "$_h_sections" -lt 4 ]; then
    _missing_docs="${_missing_docs} Handoff(缺章节:${_h_sections}/4)"
  fi
fi
if [ ! -f "$add_route" ]; then
  _missing_docs="${_missing_docs} add-route"
else
  # add-route 至少要有 Task 映射表 + 文件清单
  if ! grep -q "Task 映射表" "$add_route" 2>/dev/null && ! grep -q "文件清单" "$add_route" 2>/dev/null; then
    _missing_docs="${_missing_docs} add-route(缺Task映射/文件清单)"
  fi
fi
if [ ! -f "$checklist" ]; then
  _missing_docs="${_missing_docs} checklist"
else
  # checklist 至少要有 [T] 项
  if ! grep -q '\[T\]' "$checklist" 2>/dev/null; then
    _missing_docs="${_missing_docs} checklist(无[T]项)"
  fi
fi
if [ ! -f "$tasks_file" ]; then
  _missing_docs="${_missing_docs} tasks"
else
  # tasks 至少要有 Task 列表 + 验证
  if ! grep -q 'Task\|\- \[ \]' "$tasks_file" 2>/dev/null; then
    _missing_docs="${_missing_docs} tasks(无Task项)"
  fi
fi
if [ -n "$_missing_docs" ]; then
  echo "  ❌ Step 0 未完成:$(echo $_missing_docs | sed 's/ /, /g') 文件缺失。回退 Step 0.5/Step 1 补建后再进入代码实现。"
  exit 1
fi

# 1. checklist [x] 数 vs tasks.md [x] 数 是否一致
if [ -f "$checklist" ] && [ -f "$tasks_file" ]; then
  cl_ck=$(grep -c '\[x\]' "$checklist" 2>/dev/null || true); cl_ck=${cl_ck:-0}
  cl_open=$(grep -c '\[ \]' "$checklist" 2>/dev/null || true); cl_open=${cl_open:-0}
  tk_ck=$(grep -c '\[x\]' "$tasks_file" 2>/dev/null || echo "0")

  if [ "$cl_open" -gt 0 ]; then
    issues="${issues}  ⚠️ checklist 有 ${cl_open} 项未勾选\n"
  fi

  # 2. [T] 项是否都有 [x]（编译期验证项）
  t_items=$(grep -c '\[T\]' "$checklist" 2>/dev/null || true); t_items=${t_items:-0}
  t_checked=$(grep '\[T\]' "$checklist" 2>/dev/null | grep -c '\[x\]' || true); t_checked=${t_checked:-0}
  if [ "$t_items" -gt "$t_checked" ]; then
    issues="${issues}  ⚠️ [T] 编译期验证: ${t_checked}/${t_items} 通过\n"
  fi

  # 3. 证据缺失检测：[x] 但缺 — 证据: 标记
  _no_evidence=0
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    # 有证据: — 证据: 字段 + 具体内容（tsc/vitest/grep/审计ID 等）
    if echo "$line" | grep -qE '—\s*证据:\s*\S' 2>/dev/null; then
      continue
    fi
    # 有验证结果描述也行
    if echo "$line" | grep -qE 'npx|tsc|vitest|grep|✅|cmq[0-9a-z]{10}|18/18|exit.*0' 2>/dev/null; then
      continue
    fi
    _no_evidence=$((_no_evidence + 1))
  done < <(grep '\[x\]' "$checklist" 2>/dev/null)

  if [ "$_no_evidence" -gt 0 ]; then
    issues="${issues}  ❌ ${_no_evidence} 项 [x] 缺少验收证据（需附 — 证据: tsc/vitest/grep/审计ID 等）\n"
  fi

  # 4. 审计链：[x] 项引用 audit ID 的比例
  #    初验: 有证据即可，审计ID是证据产出物
  #    复验: 有审计ID + 证据仍有效 → 不重复落库；证据失效 → 追写新审计
  _with_audit=$(grep '\[x\]' "$checklist" 2>/dev/null | grep -cE 'cmq[a-z0-9]{10,}' || true); _with_audit=${_with_audit:-0}
  _fake_audit=$(grep '\[x\]' "$checklist" 2>/dev/null | grep -cE 'cmq\.\.\.|cmqxxx|审计.*cmq\.\.' || true); _fake_audit=${_fake_audit:-0}
  if [ "$_fake_audit" -gt 0 ]; then
    issues="${issues}  ❌ ${_fake_audit} 项 [x] 使用了占位符审计ID（cmq.../cmqxxx），必须调 record_dev_operation 获取真实 cuid 后替换\n"
  fi
  _with_evidence=$(grep '\[x\]' "$checklist" 2>/dev/null | grep -cE 'tsc|vitest|npx|grep|✅|验证|确认|compgen|审计.*cmq[a-z0-9]{10}' || true); _with_evidence=${_with_evidence:-0}
  if [ "$_with_evidence" -gt 0 ] && [ "$_with_audit" -eq 0 ]; then
    issues="${issues}  📎 初验: ${_with_evidence}/${cl_ck} 项有证据但未写审计 ID（需调 record_dev_operation 落库）\n"
  elif [ "$_with_audit" -gt 0 ] && [ "$_with_audit" -lt "$cl_ck" ]; then
    issues="${issues}  📎 复验: ${_with_audit}/${cl_ck} 项引用审计 ID。${_with_evidence}/${cl_ck} 项有证据。证据一致则不需追写 devlog日志(走mcp)\n"
  fi
fi

# 5. add-route Step 闭环
if [ -f "$add_route" ]; then
  ar_ck=$(grep -c '\[x\]' "$add_route" 2>/dev/null || true); ar_ck=${ar_ck:-0}
  ar_open=$(grep -c '\[ \]' "$add_route" 2>/dev/null || true); ar_open=${ar_open:-0}
  if [ "$ar_open" -gt 0 ]; then
    issues="${issues}  ⚠️ add-route ${ar_open} Step 未闭环\n"
  fi
fi

# 6. handoff 审计表同步：checklist 中的 cuid 是否在 handoff 中有记录
if [ -f "$handoff" ] && [ -f "$checklist" ]; then
  _new_cuids=""
  while IFS= read -r cuid; do
    [ -z "$cuid" ] && continue
    if ! grep -q "$cuid" "$handoff" 2>/dev/null; then
      [ -n "$_new_cuids" ] && _new_cuids="${_new_cuids}, "
      _new_cuids="${_new_cuids}${cuid}"
    fi
  done < <(grep -oE 'cmq[a-z0-9]{10,}' "$checklist" 2>/dev/null | sort -u)
  if [ -n "$_new_cuids" ]; then
    _new_count=$(echo "$_new_cuids" | tr ',' '\n' | wc -l)
    issues="${issues}  ❌ handoff 审计表未同步: ${_new_count} 个 cuid 在 checklist 中存在但 handoff 中缺失（需更新 handoff ADD-7 表 + query_audit_logs 命令）\n"
  fi
fi

if [ -z "$issues" ]; then
  echo "  ✅ Review: checklist 质量检查通过"
else
  echo "  📋 Review 发现问题:"
  echo -e "$issues"
fi
