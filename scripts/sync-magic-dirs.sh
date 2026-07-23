#!/bin/bash
# sync-magic-dirs.sh — add-coder 自动同步脚本
# 根据源→目标映射关系，自动同步 hooks 和 templates 到各 magic 目录
# 使用: bash scripts/sync-magic-dirs.sh 或 npm run sync

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

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
/^# 动态探测 MAGIC_DIR/,/^MAGIC_DIR=.*basename/c\\
MAGIC_DIR="${magic_dir}"
s@'\$MAGIC_DIR/(plans|specs)/'@'${escaped_magic}/(plans|specs)/'@g
s@'\$MAGIC_DIR/plans/'@'${escaped_magic}/plans/'@g
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
        rsync -av --delete \
            --exclude='.gitkeep' \
            --exclude='.DS_Store' \
            --exclude='*/.DS_Store' \
            --exclude='debug-dump/' \
            --exclude='*.log' \
            "$src/" "$dest/"
        
        # 确定性替换：将动态 $MAGIC_DIR 替换为具体值，修复 grep 单引号 bug
        if [ -n "$magic_dir" ]; then
            echo "   🔧 烘焙 MAGIC_DIR → $magic_dir"
            bake_magic_refs "$dest" "$magic_dir"
            echo "   📝 烘焙 .md 占位符（{{magicDir}} → $magic_dir, {{projectName}} → add-coder）"
            bake_md_placeholders "$dest" "$magic_dir"
        fi
        
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

    local magic_dirs=(".add" ".qoder" ".claude" ".vscode")
    
    echo ""
    echo "$icon 同步 $category..."
    for md in "${magic_dirs[@]}"; do
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

# adapters/claude/hooks → .claude/hooks
sync_dir "$PROJECT_DIR/templates/adapters/claude/hooks" "$PROJECT_DIR/.claude/hooks" "claude hooks" ".claude"

# adapters/qoder/hooks → .qoder/hooks  
sync_dir "$PROJECT_DIR/templates/adapters/qoder/hooks" "$PROJECT_DIR/.qoder/hooks" "qoder hooks" ".qoder"

# adapters/vscode/hooks → .vscode/hooks
sync_dir "$PROJECT_DIR/templates/adapters/vscode/hooks" "$PROJECT_DIR/.vscode/hooks" "vscode hooks" ".vscode"

# core/hooks → .add/hooks (因为 .add 无自有 hooks)
sync_dir "$PROJECT_DIR/templates/core/hooks" "$PROJECT_DIR/.add/hooks" ".add hooks" ".add"

# templates（不烘焙，保留 {{magicDir}} 给 init 渲染）
sync_to_all_magic_dirs "templates" "📚" 0

sync_to_all_magic_dirs "skills" "🎯"
sync_to_all_magic_dirs "rules" "📋"
sync_to_all_magic_dirs "agents" "🤖"
sync_to_all_magic_dirs "scripts" "📜"
sync_to_all_magic_dirs "docs" "📖"
sync_to_all_magic_dirs "vocabulary" "📕"
sync_to_all_magic_dirs "tools" "🔧"

# core/hooks → adapters/codex/hooks/ （从 core 派生）
sync_dir "$PROJECT_DIR/templates/core/hooks" "$PROJECT_DIR/templates/adapters/codex/hooks" "codex hooks" ".codex"

# core/hooks → adapters/trae/hooks/ （从 core 派生）
sync_dir "$PROJECT_DIR/templates/core/hooks" "$PROJECT_DIR/templates/adapters/trae/hooks" "trae hooks" ".trae"

echo ""
echo "🔍 验证同步结果..."

# 验证函数
verify_sync() {
    local src="$1"
    local dest="$2"
    local name="$3"
    
    if [ -d "$src" ] && [ -d "$dest" ]; then
        local diff_result
        diff_result=$(diff -r -x '*.log' -x 'debug-dump' -x '.DS_Store' "$src" "$dest" 2>&1 || true)
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

# 验证主要同步结果
verify_sync "$PROJECT_DIR/templates/adapters/claude/hooks" "$PROJECT_DIR/.claude/hooks" "claude hooks"
verify_sync "$PROJECT_DIR/templates/adapters/qoder/hooks" "$PROJECT_DIR/.qoder/hooks" "qoder hooks"
verify_sync "$PROJECT_DIR/templates/adapters/vscode/hooks" "$PROJECT_DIR/.vscode/hooks" "vscode hooks"
verify_sync "$PROJECT_DIR/templates/core/hooks" "$PROJECT_DIR/.add/hooks" ".add hooks"
verify_sync "$PROJECT_DIR/templates/core/templates" "$PROJECT_DIR/.add/templates" ".add templates"

echo ""
echo "🎯 同步完成!"
echo "💡 提示: 重启 IDE 以使新的 hook 配置生效"
echo "📝 备份保存在: $BACKUP_DIR"