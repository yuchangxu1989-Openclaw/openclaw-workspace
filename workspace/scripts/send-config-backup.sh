#!/bin/bash
# 每天定时发送openclaw.json到飞书给用户
# cron调用: 0 10,22 * * * bash /root/.openclaw/workspace/scripts/send-config-backup.sh
set -euo pipefail

CONF="/root/.openclaw/openclaw.json"
RECEIVE_ID="ou_a113e465324cc55f9ab3348c9a1a7b9b"

# 同时本地备份一份
BACKUP_DIR="/root/.openclaw/backups"
mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +%Y%m%d%H%M%S)
cp "$CONF" "$BACKUP_DIR/openclaw.json.backup-$TIMESTAMP"

# 通过file-sender发给用户
node /root/.openclaw/workspace/skills/public/file-sender/index.js "$CONF" "$RECEIVE_ID" "open_id" "openclaw.json.backup-$TIMESTAMP"
