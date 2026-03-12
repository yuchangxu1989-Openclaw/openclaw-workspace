#!/bin/bash
set -euo pipefail

SOURCE="/root/.openclaw/workspace"
LOG_FILE="/root/.openclaw/workspace/infrastructure/logs/sync-shared-rules.log"
FILES_TO_SYNC=(
  "IRONCLAD.md"
  "CAPABILITY-ANCHOR.md"
  "AGENTS.md"
  "config/mcp-registry.json"
)

mkdir -p "$(dirname \"$LOG_FILE\")"

echo "[$(TZ='Asia/Shanghai' date '+%Y-%m-%d %H:%M:%S %Z')] sync start" >> "$LOG_FILE"

for ws in /root/.openclaw/workspace-*/; do
  [ -d "$ws" ] || continue
  for f in "${FILES_TO_SYNC[@]}"; do
    if [ -f "$SOURCE/$f" ]; then
      mkdir -p "$ws/$(dirname "$f")"
      cp "$SOURCE/$f" "$ws/$f"
      echo "[$(TZ='Asia/Shanghai' date '+%Y-%m-%d %H:%M:%S %Z')] synced $f -> $ws$f" >> "$LOG_FILE"
    else
      echo "[$(TZ='Asia/Shanghai' date '+%Y-%m-%d %H:%M:%S %Z')] missing source file: $SOURCE/$f" >> "$LOG_FILE"
    fi
  done
done

echo "[$(TZ='Asia/Shanghai' date '+%Y-%m-%d %H:%M:%S %Z')] sync done" >> "$LOG_FILE"
