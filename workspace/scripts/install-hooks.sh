#!/bin/bash
# 安装ISC pre-commit hook
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WS="$(dirname "$SCRIPT_DIR")"
# Git repo may be at workspace parent
GIT_DIR="$(git -C "$WS" rev-parse --git-dir 2>/dev/null || echo "$WS/.git")"
HOOK="$GIT_DIR/hooks/pre-commit"

if [ ! -d "$GIT_DIR" ]; then
  echo "❌ 未找到 .git 目录: $GIT_DIR"
  exit 1
fi

mkdir -p "$GIT_DIR/hooks"

cat > "$HOOK" << 'EOF'
#!/bin/bash
node "$(git rev-parse --show-toplevel)/workspace/scripts/isc-pre-commit-check.js"
EOF

chmod +x "$HOOK"
echo "✅ ISC pre-commit hook 已安装: $HOOK"
