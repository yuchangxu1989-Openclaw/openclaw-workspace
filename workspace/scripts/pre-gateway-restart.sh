#!/bin/bash
# 每次gateway restart前自动备份openclaw.json
set -euo pipefail
CONF="/root/.openclaw/openclaw.json"
BACKUP_DIR="/root/.openclaw/backups"
mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +%Y%m%d%H%M%S)
cp "$CONF" "$BACKUP_DIR/openclaw.json.backup-$TIMESTAMP"
echo "✅ openclaw.json已备份: $BACKUP_DIR/openclaw.json.backup-$TIMESTAMP"
# 保留最近10份，清理更早的
ls -t "$BACKUP_DIR"/openclaw.json.backup-* 2>/dev/null | tail -n +11 | xargs rm -f 2>/dev/null || true
