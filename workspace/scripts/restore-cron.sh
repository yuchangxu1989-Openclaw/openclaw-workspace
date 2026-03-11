#!/usr/bin/env bash
# restore-cron.sh — 从git备份恢复crontab（容器重启后执行）
set -euo pipefail

BACKUP="/root/.openclaw/workspace/infrastructure/cron/crontab-backup.txt"

if [ ! -f "$BACKUP" ]; then
  echo "❌ 备份文件不存在: $BACKUP"
  echo "   请先执行 git pull 获取最新备份"
  exit 1
fi

crontab "$BACKUP"
echo "✅ cron restored: $(crontab -l | wc -l) entries"
