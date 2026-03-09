#!/bin/bash
# Git Guardian - 扫描未跟踪的重要文件
# 用法: bash scripts/git-guardian.sh
# 可作为 cron 任务运行

WORKSPACE="/root/.openclaw/workspace"
cd "$WORKSPACE" || { echo "❌ 无法进入 workspace"; exit 1; }

# 确保是 git 仓库
if ! git rev-parse --is-inside-work-tree &>/dev/null; then
    echo "❌ 不是 Git 仓库"
    exit 1
fi

echo "🛡️  Git Guardian 扫描报告"
echo "📅 $(date '+%Y-%m-%d %H:%M:%S')"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 扫描未跟踪的重要文件（排除 node_modules/.git/logs）
UNTRACKED=$(git ls-files --others --exclude-standard | grep -E '\.(js|json|md|sh)$' | grep -vE '(node_modules/|\.git/|logs/)')
MODIFIED=$(git diff --name-only | grep -E '\.(js|json|md|sh)$')
STAGED=$(git diff --cached --name-only)

UNTRACKED_COUNT=0
MODIFIED_COUNT=0

if [ -n "$UNTRACKED" ]; then
    UNTRACKED_COUNT=$(echo "$UNTRACKED" | wc -l)
    echo ""
    echo "📄 未跟踪文件 ($UNTRACKED_COUNT 个)："
    echo "$UNTRACKED" | sed 's/^/   /'
fi

if [ -n "$MODIFIED" ]; then
    MODIFIED_COUNT=$(echo "$MODIFIED" | wc -l)
    echo ""
    echo "✏️  已修改未暂存 ($MODIFIED_COUNT 个)："
    echo "$MODIFIED" | sed 's/^/   /'
fi

TOTAL=$((UNTRACKED_COUNT + MODIFIED_COUNT))

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ "$TOTAL" -eq 0 ]; then
    echo "✅ 一切整洁，没有遗漏文件"
else
    echo "⚠️  共 $TOTAL 个文件需要关注"
    echo ""
    echo "💡 建议操作："
    [ "$UNTRACKED_COUNT" -gt 0 ] && echo "   git add <文件>     # 添加未跟踪文件"
    [ "$MODIFIED_COUNT" -gt 0 ] && echo "   git add -u          # 暂存所有修改"
    echo "   git commit -m '...' # 提交更改"
fi

exit 0
