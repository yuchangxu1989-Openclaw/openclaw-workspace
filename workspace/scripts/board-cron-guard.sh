#!/bin/bash
# 看板条件推送：有running agent时才推送，没有则跳过
cd /root/.openclaw/workspace

# 先用subagents list检查有没有running的
RUNNING_COUNT=$(node -e "
const fs = require('fs');
const path = require('path');
// 读sessions目录统计active subagents
const sessDir = path.join(process.env.HOME || '/root', '.openclaw/sessions');
try {
  const files = fs.readdirSync(sessDir).filter(f => f.includes('subagent'));
  let running = 0;
  for (const f of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(sessDir, f), 'utf8'));
      if (data.status === 'running' || data.state === 'running') running++;
    } catch(e) {}
  }
  console.log(running);
} catch(e) {
  console.log(0);
}
" 2>/dev/null)

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
if [ "$RUNNING_COUNT" -gt 0 ] 2>/dev/null; then
  node scripts/push-board-now.js >> infrastructure/logs/board-cron-guard.log 2>&1
  echo "$TIMESTAMP PUSHED running=$RUNNING_COUNT" >> infrastructure/logs/board-cron-guard.log
else
  echo "$TIMESTAMP SKIP no-running" >> infrastructure/logs/board-cron-guard.log
fi
