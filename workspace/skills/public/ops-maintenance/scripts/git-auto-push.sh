#!/bin/bash
# 自动git push - 每5分钟由cron触发
# 检测到本地有未push的commit时自动push
set -euo pipefail
cd /root/.openclaw/workspace

# 先fetch确保remote ref最新
git fetch origin --quiet 2>/dev/null || exit 0

# 检查是否有未push的commit
UNPUSHED=$(git log --oneline origin/main..HEAD 2>/dev/null | wc -l)
if [ "$UNPUSHED" -gt 0 ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Pushing $UNPUSHED unpushed commits..."
  git push origin main 2>&1
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Push complete."
else
  : # nothing to push
fi
