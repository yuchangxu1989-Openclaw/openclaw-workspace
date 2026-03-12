#!/bin/bash
# 看板条件推送：有running agent时才推送，没有则跳过
cd /root/.openclaw/workspace || exit 1

# 先check-only获取running数
STATS=$(node scripts/push-board-now.js --check-only 2>&1)
RUNNING=$(echo "$STATS" | grep -oP 'running=\K[0-9]+' | head -1)
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

if [ "${RUNNING:-0}" -gt 0 ] 2>/dev/null; then
  # 有agent在跑，执行真正推送
  node scripts/push-board-now.js >> infrastructure/logs/board-cron-guard.log 2>&1
  echo "$TIMESTAMP PUSHED running=$RUNNING" >> infrastructure/logs/board-cron-guard.log
else
  echo "$TIMESTAMP SKIP no-running" >> infrastructure/logs/board-cron-guard.log
fi
