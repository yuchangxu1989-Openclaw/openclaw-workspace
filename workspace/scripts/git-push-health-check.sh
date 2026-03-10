#!/bin/bash
# Git push健康探针 - heartbeat和cron调用
set -euo pipefail
cd /root/.openclaw/workspace

RESULT=$(git push --dry-run 2>&1) && {
  echo "OK"
  exit 0
} || {
  echo "ALERT: git push失败"
  echo "$RESULT"
  exit 1
}
