#!/usr/bin/env bash
# save-cron.sh — 保存当前crontab到git（每天自动执行一次）
set -euo pipefail

BACKUP="/root/.openclaw/workspace/infrastructure/cron/crontab-backup.txt"
REPO="/root/.openclaw/workspace"

# 导出当前crontab
crontab -l > "$BACKUP" 2>/dev/null || { echo "❌ crontab导出失败"; exit 1; }

LINES=$(wc -l < "$BACKUP")
echo "📋 crontab已导出: ${LINES} 行"

# 检查是否有变更
cd "$REPO"
if git diff --quiet "infrastructure/cron/crontab-backup.txt" 2>/dev/null; then
  echo "ℹ️  crontab无变更，跳过commit"
  exit 0
fi

git add infrastructure/cron/crontab-backup.txt
git commit -m "backup: crontab $(date +%Y-%m-%d_%H:%M)"
git push && echo "✅ crontab备份已push到GitHub" || echo "⚠️ push失败，commit已保存本地"
