#!/bin/bash
###
 # @Author       : xiaomingming wujixmm@gmail.com
 # @Date         : 2026-07-31 09:30:31
 # @LastEditors  : xiaomingming wujixmm@gmail.com
 # @LastEditTime : 2026-07-31 09:30:31
 # @FilePath     : /farm-agent/home/xmm/ai/add-coder/scripts/transcribe.sh
 # @Description  : 
### 
# transcribe.sh — 原生 bash TOML → shell config 转录器（同语言通道）
# 读取 sync-magic-bash-rules.toml，生成 sync-magic-config.sh
# 用法: bash scripts/transcribe.sh [rules_file] [output_file]
# 与 transcribe.ts (跨语言通道) 产出格式完全一致，供 benchmark 对照
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RULES_FILE="${1:-$SCRIPT_DIR/../src/caijuehub/benchmark/sync-magic-benchmark-bash-rules.toml}"
OUTPUT_FILE="${2:-$SCRIPT_DIR/sync-magic-config.sh}"

if [ ! -f "$RULES_FILE" ]; then
    echo "错误: 规则文件不存在: $RULES_FILE" >&2
    exit 1
fi

# ── 辅助：提取 section 中单个 key 的值（去引号）──
toml_get() {
    local section="$1" key="$2"
    sed -n "/^\[$section\]/,/^\[/s/^$key *= *\"\\(.*\\)\"/\\1/p" "$RULES_FILE" | head -1
}

# ── 辅助：提取 section 中所有非空 key=value 行（原始行，不去引号）──
toml_section() {
    local section="$1"
    sed -n "/^\[$section\]/,/^\[/p" "$RULES_FILE" \
        | grep '=' \
        | grep -v '^\[' \
        | grep -v '^#' \
        | sed '/^$/d'
}

# ── 辅助：去首尾引号和空格 ──
unquote() { echo "$1" | sed 's/^[[:space:]]*"//; s/"[[:space:]]*$//'; }

# ── 辅助：空格分隔字符串 → 带引号 bash 数组元素 ──
as_array() {
    local val="$1"
    local result=""
    for word in $val; do
        result="$result\"$word\" "
    done
    echo "${result% }"
}

# ═══════════════════════════════════════════
# 生成 shell 配置
# ═══════════════════════════════════════════
{
    echo "# ⚠️ 由 scripts/transcribe.sh 自动生成，不要手动编辑！"
    echo "# 改 sync-magic-bash-rules.toml 后重新运行: bash scripts/transcribe.sh"
    echo ""

    # ── core ──
    echo "# ── 核心配置 ──"
    _pn=$(toml_get "core" "project_name")
    _md=$(toml_get "core" "magic_dirs")
    _ep=$(toml_get "core" "exclude_patterns")
    _le=$(toml_get "core" "log_extensions")

    echo "PROJECT_NAME=\"${_pn:-add-coder}\""
    echo "MAGIC_DIRS=($(as_array "${_md:-.add .qoder .claude .vscode}"))"
    echo "EXCLUDE_PATTERNS=($(as_array "${_ep:-.gitkeep .DS_Store debug-dump}"))"
    echo "LOG_EXTENSIONS=($(as_array "${_le:-.log}"))"
    echo ""

    # ── hooks ──
    _hook_srcs=(); _hook_dests=(); _hook_names=(); _hook_magics=()
    while IFS='=' read -r _key _raw; do
        _key="${_key%%[[:space:]]*}"
        _val=$(unquote "$_raw")
        IFS='|' read -r _src _dest _name _magic <<< "$_val"
        _hook_srcs+=("$_src")
        _hook_dests+=("$_dest")
        _hook_names+=("$_name")
        _hook_magics+=("$_magic")
    done < <(toml_section "hooks")

    _hook_src_str=""; _hook_dest_str=""; _hook_name_str=""; _hook_magic_str=""
    for _s in "${_hook_srcs[@]}"; do _hook_src_str="$_hook_src_str\"$_s\" "; done
    for _d in "${_hook_dests[@]}"; do _hook_dest_str="$_hook_dest_str\"$_d\" "; done
    for _n in "${_hook_names[@]}"; do _hook_name_str="$_hook_name_str\"$_n\" "; done
    for _m in "${_hook_magics[@]}"; do _hook_magic_str="$_hook_magic_str\"$_m\" "; done

    echo "# ── Hook 同步映射 (${#_hook_srcs[@]} 条) ──"
    echo "HOOK_COUNT=${#_hook_srcs[@]}"
    echo "HOOK_SRCS=(${_hook_src_str% })"
    echo "HOOK_DESTS=(${_hook_dest_str% })"
    echo "HOOK_NAMES=(${_hook_name_str% })"
    echo "HOOK_MAGICS=(${_hook_magic_str% })"
    echo ""

    # ── categories ──
    _cat_names=(); _cat_icons=(); _cat_bakes=()
    while IFS='=' read -r _key _raw; do
        _key="${_key%%[[:space:]]*}"
        _val=$(unquote "$_raw")
        IFS='|' read -r _icon _bake <<< "$_val"
        _cat_names+=("$_key")
        _cat_icons+=("$_icon")
        _b=${_bake:-1}
        [[ "$_b" == "0" || "$_b" == "false" ]] && _b=0 || _b=1
        _cat_bakes+=("$_b")
    done < <(toml_section "categories")

    _cat_name_str=""; _cat_icon_str=""; _cat_bake_str=""
    for _n in "${_cat_names[@]}"; do _cat_name_str="$_cat_name_str\"$_n\" "; done
    for _i in "${_cat_icons[@]}"; do _cat_icon_str="$_cat_icon_str\"$_i\" "; done
    for _b in "${_cat_bakes[@]}"; do _cat_bake_str="$_cat_bake_str$_b "; done

    echo "# ── 通用类别同步 (${#_cat_names[@]} 条) ──"
    echo "CAT_COUNT=${#_cat_names[@]}"
    echo "CAT_NAMES=(${_cat_name_str% })"
    echo "CAT_ICONS=(${_cat_icon_str% })"
    echo "CAT_BAKES=(${_cat_bake_str% })"
    echo ""

    # ── verify ──
    _v_srcs=(); _v_dests=(); _v_names=()
    while IFS='=' read -r _key _raw; do
        _val=$(unquote "$_raw")
        IFS='|' read -r _src _dest _name <<< "$_val"
        _v_srcs+=("$_src")
        _v_dests+=("$_dest")
        _v_names+=("$_name")
    done < <(toml_section "verify")

    _v_src_str=""; _v_dest_str=""; _v_name_str=""
    for _s in "${_v_srcs[@]}"; do _v_src_str="$_v_src_str\"$_s\" "; done
    for _d in "${_v_dests[@]}"; do _v_dest_str="$_v_dest_str\"$_d\" "; done
    for _n in "${_v_names[@]}"; do _v_name_str="$_v_name_str\"$_n\" "; done

    echo "# ── 验证映射 (${#_v_srcs[@]} 条) ──"
    echo "VERIFY_COUNT=${#_v_srcs[@]}"
    echo "VERIFY_SRCS=(${_v_src_str% })"
    echo "VERIFY_DESTS=(${_v_dest_str% })"
    echo "VERIFY_NAMES=(${_v_name_str% })"

} > "$OUTPUT_FILE"

echo "✅ 生成 $OUTPUT_FILE"
