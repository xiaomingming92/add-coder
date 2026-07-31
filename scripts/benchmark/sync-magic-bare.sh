#!/bin/bash
# sync-magic-bare.sh — 对照组 A：裸 bash 硬编码版（无 caijuehub 驱动）
# 由 benchmark-sync.ts 调用，不用于生产
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BENCH_DIR="$SCRIPT_DIR"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
echo "🔄 同步 add-coder magic 目录..."
BACKUP_DIR="$PROJECT_DIR/.backup/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
bake_magic_refs() {
    local target_dir="$1" magic_dir="$2"
    find "$target_dir" -name "*.sh" -type f | while read -r file; do
        if grep -q 'MAGIC_DIR="\$(basename' "$file" 2>/dev/null; then
            sed -i "s@^MAGIC_DIR=\".*@MAGIC_DIR=\"${magic_dir}\"@" "$file"
        fi
    done
}
bake_md_placeholders() {
    local target_dir="$1" magic_dir="$2"
    find "$target_dir" -name "*.md" -type f | while read -r file; do
        if grep -q '{{magicDir}}\|{{projectName}}' "$file" 2>/dev/null; then
            sed -i -e "s|{{magicDir}}|${magic_dir}|g" -e "s|{{projectName}}|add-coder|g" "$file"
        fi
    done
}
sync_dir() {
    local src="$1" dest="$2" name="$3" magic_dir="${4:-}"
    if [ -d "$src" ]; then
        echo "🔄 同步 $name: $src → $dest"
        mkdir -p "$dest"
        if [ -d "$dest" ] && [ "$(ls -A "$dest" 2>/dev/null)" ]; then
            cp -r "$dest" "$BACKUP_DIR/$(basename "$dest")"
        fi
        if command -v rsync &>/dev/null; then
            rsync -av --delete --exclude='.gitkeep' --exclude='.DS_Store' --exclude='debug-dump/' --exclude='*.log' "$src/" "$dest/"
        else
            echo "   ⚠️  rsync 不可用，使用 Node.js cpSync 降级同步"
            node -e "const{rmSync,cpSync}=require('fs');const s=process.argv[1],d=process.argv[2];rmSync(d,{recursive:true,force:true});cpSync(s,d,{recursive:true,filter:x=>{const n=require('path').basename(x);return!['.gitkeep','.DS_Store','debug-dump'].includes(n)&&!n.endsWith('.log')}})" "$src" "$dest"
        fi
        if [ -n "$magic_dir" ]; then
            bake_magic_refs "$dest" "$magic_dir"
            bake_md_placeholders "$dest" "$magic_dir"
        fi
        find "$dest" -name "*.sh" -type f -exec chmod +x {} \; 2>/dev/null || true
        echo "   ✅ $name 同步完成"
    else
        echo "⚠️  源目录不存在: $src"
    fi
}
sync_to_all_magic_dirs() {
    local category="$1" icon="$2" bake="${3:-1}"
    local magic_dirs=(".add" ".qoder" ".claude" ".vscode")
    echo ""; echo "$icon 同步 $category..."
    for md in "${magic_dirs[@]}"; do
        if [ "$bake" = "1" ]; then
            sync_dir "$PROJECT_DIR/templates/core/$category" "$PROJECT_DIR/$md/$category" "$md $category" "$md"
        else
            sync_dir "$PROJECT_DIR/templates/core/$category" "$PROJECT_DIR/$md/$category" "$md $category"
        fi
    done
}
verify_sync() {
    local src="$1" dest="$2" name="$3"
    if [ -d "$src" ] && [ -d "$dest" ]; then
        local dr; dr=$(diff -r -I 'MAGIC_DIR' -x '*.log' -x 'debug-dump' -x '.DS_Store' "$src" "$dest" 2>&1 || true)
        if [ -z "$dr" ]; then echo "   ✅ $name: 源与目标完全一致"
        else echo "   ⚠️  $name: 存在差异"; fi
    elif [ ! -d "$src" ]; then echo "   ⚠️  $name: 源目录不存在 $src"
    else echo "   ⚠️  $name: 目标目录不存在 $dest"; fi
}
echo ""; echo "📁 执行源→目标映射同步..."
sync_dir "$PROJECT_DIR/templates/adapters/claude/hooks" "$PROJECT_DIR/.claude/hooks" "claude hooks" ".claude"
sync_dir "$PROJECT_DIR/templates/adapters/qoder/hooks" "$PROJECT_DIR/.qoder/hooks" "qoder hooks" ".qoder"
sync_dir "$PROJECT_DIR/templates/adapters/vscode/hooks" "$PROJECT_DIR/.vscode/hooks" "vscode hooks" ".vscode"
sync_dir "$PROJECT_DIR/templates/core/hooks" "$PROJECT_DIR/.add/hooks" ".add hooks" ".add"
sync_to_all_magic_dirs "templates" "📚" 0
sync_to_all_magic_dirs "skills" "🎯"
sync_to_all_magic_dirs "rules" "📋"
sync_to_all_magic_dirs "agents" "🤖"
sync_to_all_magic_dirs "scripts" "📜"
sync_to_all_magic_dirs "docs" "📖"
sync_to_all_magic_dirs "vocabulary" "📕"
sync_to_all_magic_dirs "tools" "🔧"
sync_dir "$PROJECT_DIR/templates/core/hooks" "$PROJECT_DIR/templates/adapters/codex/hooks" "codex hooks" ".codex"
sync_dir "$PROJECT_DIR/templates/core/hooks" "$PROJECT_DIR/templates/adapters/trae/hooks" "trae hooks" ".trae"
echo ""; echo "🔍 验证同步结果..."
verify_sync "$PROJECT_DIR/templates/adapters/claude/hooks" "$PROJECT_DIR/.claude/hooks" "claude hooks"
verify_sync "$PROJECT_DIR/templates/adapters/qoder/hooks" "$PROJECT_DIR/.qoder/hooks" "qoder hooks"
verify_sync "$PROJECT_DIR/templates/adapters/vscode/hooks" "$PROJECT_DIR/.vscode/hooks" "vscode hooks"
verify_sync "$PROJECT_DIR/templates/core/hooks" "$PROJECT_DIR/.add/hooks" ".add hooks"
verify_sync "$PROJECT_DIR/templates/core/templates" "$PROJECT_DIR/.add/templates" ".add templates"
echo ""; echo "🎯 同步完成!"
fatal: 路径 'scripts/sync-magic.sh' 在磁盘上，但是不在 'HEAD' 中
