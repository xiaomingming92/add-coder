# ⚠️ 由 caijuehub/transcribe.ts 自动生成，不要手动编辑！
# 改 sync-magic-bash-rules.toml 后重新运行: add-coder generate

# ── 核心配置 ──
PROJECT_NAME="add-coder"
MAGIC_DIRS=(".add" ".qoder" ".claude" ".vscode")
EXCLUDE_PATTERNS=(".gitkeep" ".DS_Store" "debug-dump")
LOG_EXTENSIONS=(".log")

# ── Hook 同步映射 (6 条) ──
HOOK_COUNT=6
HOOK_SRCS=("templates/adapters/claude/hooks" "templates/adapters/qoder/hooks" "templates/adapters/vscode/hooks" "templates/core/hooks" "templates/core/hooks" "templates/core/hooks")
HOOK_DESTS=(".claude/hooks" ".qoder/hooks" ".vscode/hooks" ".add/hooks" "templates/adapters/codex/hooks" "templates/adapters/trae/hooks")
HOOK_NAMES=("claude hooks" "qoder hooks" "vscode hooks" ".add hooks" "codex hooks" "trae hooks")
HOOK_MAGICS=(".claude" ".qoder" ".vscode" ".add" ".codex" ".trae")

# ── 通用类别同步 (8 条) ──
CAT_COUNT=8
CAT_NAMES=("templates" "skills" "rules" "agents" "scripts" "docs" "vocabulary" "tools")
CAT_ICONS=("📚" "🎯" "📋" "🤖" "📜" "📖" "📕" "🔧")
CAT_BAKES=(0 1 1 1 1 1 1 1)

# ── 验证映射 (5 条) ──
VERIFY_COUNT=5
VERIFY_SRCS=("templates/adapters/claude/hooks" "templates/adapters/qoder/hooks" "templates/adapters/vscode/hooks" "templates/core/hooks" "templates/core/templates")
VERIFY_DESTS=(".claude/hooks" ".qoder/hooks" ".vscode/hooks" ".add/hooks" ".add/templates")
VERIFY_NAMES=("claude hooks" "qoder hooks" "vscode hooks" ".add hooks" ".add templates")
