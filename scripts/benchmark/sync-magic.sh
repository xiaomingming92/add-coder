#!/bin/bash
# sync-magic.sh — add-coder 自动同步脚本
# 根据源→目标映射关系，自动同步 hooks 和 templates 到各 magic 目录
# 使用: bash scripts/sync-magic.sh 或 npm run sync:bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"

# ── 加载 caijuehub 生成配置（优先 source 已生成的，不存在则自动生成）──
CONFIG_FILE="${SYNC_MAGIC_CONFIG:-$SCRIPT_DIR/sync-magic-config.sh}"
if [ ! -f "$CONFIG_FILE" ]; then
    echo "🔧 sync-magic-config.sh 不存在，自动生成..."
    bash "$PROJECT_DIR/src/caijuehub/benchmark/transcribe.sh" "$PROJECT_DIR/src/caijuehub/benchmark/sync-magic-benchmark-bash-rules.toml" "$CONFIG_FILE" 2>/dev/null || {
        echo "⚠️  transcribe.sh 不可用，尝试 transcribe.ts..."
        npx tsx "$PROJECT_DIR/src/caijuehub/transcribe.ts" 2>/dev/null || true
    }
fi
source "$CONFIG_FILE" 2>/dev/null || {
    echo "❌ 无法加载配置: $CONFIG_FILE" >&2
    echo "   请运行: npx tsx src/caijuehub/transcribe.ts" >&2
    exit 1
}

echo "🔄 同步 add-coder magic 目录..."

# 创建备份目录
BACKUP_DIR="$PROJECT_DIR/.backup/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
echo "📦 备份目录: $BACKUP_DIR"

# 烘焙函数：将 hook 脚本中的动态 $MAGIC_DIR 替换为确定性硬编码值
# 修复 grep 中单引号导致 $MAGIC_DIR 不展开的 bug
bake_magic_refs() {
    local target_dir="$1"
    local magic_dir="$2"
    local escaped_magic
    escaped_magic=$(echo "$magic_dir" | sed 's/\./\\\\./g')

    find "$target_dir" -name "*.sh" -type f | while read -r file; do
        # 仅处理包含动态检测模式的脚本
        if grep -q 'MAGIC_DIR="\$(basename' "$file" 2>/dev/null; then
            # 使用 sed 脚本文件避免 shell 转义问题
            sed -i -f - "$file" <<SEDEOF
s@^MAGIC_DIR=".*@MAGIC_DIR="${magic_dir}"@
SEDEOF
        fi
    done
}

# 烘焙 .md 文件中的 {{magicDir}} 和 {{projectName}} 占位符
bake_md_placeholders() {
    local target_dir="$1"
    local magic_dir="$2"

    find "$target_dir" -name "*.md" -type f | while read -r file; do
        if grep -q '{{magicDir}}\|{{projectName}}' "$file" 2>/dev/null; then
            sed -i \
                -e "s|{{magicDir}}|${magic_dir}|g" \
                -e "s|{{projectName}}|add-coder|g" \
                "$file"
        fi
    done
}

# 同步函数
sync_dir() {
    local src="$1"
    local dest="$2"
    local name="$3"
    local magic_dir="${4:-}"  # 可选：具体 magic 目录名，如 ".add"，传入后会烘焙 hooks
    
    if [ -d "$src" ]; then
        echo "🔄 同步 $name: $src → $dest"
        
        # 创建目标目录
        mkdir -p "$dest"
        
        # 备份目标目录（如果存在）
        if [ -d "$dest" ] && [ "$(ls -A "$dest" 2>/dev/null)" ]; then
            local backup_dest="$BACKUP_DIR/$(basename "$dest")"
            echo "   💾 备份 $dest → $backup_dest"
            cp -r "$dest" "$backup_dest"
        fi
        
        # 同步内容（排除 .gitkeep、保留特定文件）
        if command -v rsync &>/dev/null; then
            rsync -av --delete \
                --exclude='.gitkeep' \
                --exclude='.DS_Store' \
                --exclude='*/.DS_Store' \
                --exclude='debug-dump/' \
                --exclude='*.log' \
                "$src/" "$dest/"
        else
            # Windows / 无 rsync 降级：Node.js cpSync（递归覆盖）
            echo "   ⚠️  rsync 不可用，使用 Node.js cpSync 降级同步"
            node -e "
                const fs = require('fs');
                const path = require('path');
                const src = process.argv[1];
                const dest = process.argv[2];
                const exclude = new Set(['.gitkeep','.DS_Store','debug-dump']);
                fs.rmSync(dest, { recursive: true, force: true });
                fs.cpSync(src, dest, {
                    recursive: true,
                    filter: (s) => {
                        const base = path.basename(s);
                        if (exclude.has(base)) return false;
                        if (base.endsWith('.log')) return false;
                        return true;
                    }
                });
            " "$src" "$dest"
        fi
        
        # 确定性替换：将动态 $MAGIC_DIR 替换为具体值，修复 grep 单引号 bug
        if [ -n "$magic_dir" ]; then
            echo "   🔧 烘焙 MAGIC_DIR → $magic_dir"
            bake_magic_refs "$dest" "$magic_dir"
            echo "   📝 烘焙 .md 占位符（{{magicDir}} → $magic_dir, {{projectName}} → add-coder）"
            bake_md_placeholders "$dest" "$magic_dir"
        fi
        
        # 确保 hook 脚本可执行
        find "$dest" -name "*.sh" -type f -exec chmod +x {} \; 2>/dev/null || true
        
        echo "   ✅ $name 同步完成"
    else
        echo "⚠️  源目录不存在: $src"
    fi
}

# 批量同步到所有 4 个 magic 目录
sync_to_all_magic_dirs() {
    local category="$1"    # 如 "skills" / "rules" / "agents" 等
    local icon="$2"        # emoji 图标
    local bake="${3:-1}"   # 是否烘焙占位符（1=是, 0=否，如 templates 不需要烘焙）

    local magic_dirs=("${MAGIC_DIRS[@]}")
    
    echo ""
    echo "$icon 同步 $category..."
    for md in "${MAGIC_DIRS[@]}"; do
        if [ "$bake" = "1" ]; then
            sync_dir "$PROJECT_DIR/templates/core/$category" "$PROJECT_DIR/$md/$category" "$md $category" "$md"
        else
            sync_dir "$PROJECT_DIR/templates/core/$category" "$PROJECT_DIR/$md/$category" "$md $category"
        fi
    done
}

# 执行同步（按计划中的映射关系）
echo ""
echo "📁 执行源→目标映射同步..."

# ── Hook 同步（由 caijuehub HOOK_* 数组驱动）──
for ((_i=0; _i<HOOK_COUNT; _i++)); do
    sync_dir "$PROJECT_DIR/${HOOK_SRCS[$_i]}" "$PROJECT_DIR/${HOOK_DESTS[$_i]}" "${HOOK_NAMES[$_i]}" "${HOOK_MAGICS[$_i]}"
done

# ── Qoder CN: 同步 hook 配置到 ~/.qoder-cn/settings.json ──
sync_qodercn_hooks() {
  local project_dir="$1"
  local qodercn_settings="$HOME/.qoder-cn/settings.json"

  if [ ! -f "$qodercn_settings" ]; then
    echo "⚠️  Qoder CN: ~/.qoder-cn/settings.json 不存在，跳过（非 Qoder CN 环境或未初始化）"
    return 0
  fi

  echo "🏷️  Qoder CN: 检测到现有配置，更新 hooks 段..."
  tsx "$SCRIPT_DIR/patch-qoder-cn-hook-setting.ts" "$project_dir" 2>/dev/null || echo "⚠️  tsx 不可用，跳过 Qoder CN 配置同步"
}
sync_qodercn_hooks "$PROJECT_DIR"

# ── 通用类别同步（由 caijuehub CAT_* 数组驱动）──
for ((_i=0; _i<CAT_COUNT; _i++)); do
    sync_to_all_magic_dirs "${CAT_NAMES[$_i]}" "${CAT_ICONS[$_i]}" "${CAT_BAKES[$_i]}"
done

echo ""
echo "🔍 验证同步结果..."

# 验证函数
verify_sync() {
    local src="$1"
    local dest="$2"
    local name="$3"
    
    if [ -d "$src" ] && [ -d "$dest" ]; then
        local diff_result
        diff_result=$(diff -r -I 'MAGIC_DIR' -x '*.log' -x 'debug-dump' -x '.DS_Store' "$src" "$dest" 2>&1 || true)
        if [ -z "$diff_result" ]; then
            echo "   ✅ $name: 源与目标完全一致"
        else
            echo "   ⚠️  $name: 存在差异"
            echo "$diff_result"
        fi
    elif [ ! -d "$src" ]; then
        echo "   ⚠️  $name: 源目录不存在 $src"
    else
        echo "   ⚠️  $name: 目标目录不存在 $dest"
    fi
}

# ── 验证同步结果（由 caijuehub VERIFY_* 数组驱动）──
for ((_i=0; _i<VERIFY_COUNT; _i++)); do
    verify_sync "$PROJECT_DIR/${VERIFY_SRCS[$_i]}" "$PROJECT_DIR/${VERIFY_DESTS[$_i]}" "${VERIFY_NAMES[$_i]}"
done

echo ""
echo "🎯 同步完成!"
echo "💡 提示: 重启 IDE 以使新的 hook 配置生效"
echo "📝 备份保存在: $BACKUP_DIR"