#!/bin/bash
# rollback-to-old-dispatch.sh
# ──────────────────────────────
# Emergency rollback: revert to old DispatchLayer.
# Run this if the new DispatchEngine causes issues during greyscale.
#
# What it does:
#   1. Sets DISPATCH_ENGINE=old in the environment
#   2. Removes the reap cron job
#   3. Resets the new engine state (to prevent stale data on re-enable)
#   4. Restarts the gateway
#
# Usage: bash rollback-to-old-dispatch.sh

set -e

echo "🔄 Rolling back to old DispatchLayer..."

# 1. Remove reap cron
echo "  → Removing dispatch-reap cron..."
(crontab -l 2>/dev/null | grep -v "dispatch-reap-cron" | grep -v "dispatch-engine reap") | crontab - 2>/dev/null || true

# 2. Set env var (persisted in .env if exists)
ENV_FILE="/root/.openclaw/.env"
if [ -f "$ENV_FILE" ]; then
  grep -v '^DISPATCH_ENGINE=' "$ENV_FILE" > "$ENV_FILE.tmp" || true
  echo "DISPATCH_ENGINE=old" >> "$ENV_FILE.tmp"
  mv "$ENV_FILE.tmp" "$ENV_FILE"
  echo "  → Set DISPATCH_ENGINE=old in $ENV_FILE"
else
  echo "  → No .env file found. Set DISPATCH_ENGINE=old in your environment manually."
  export DISPATCH_ENGINE=old
fi

# 3. Reset new engine state
STATE_DIR="/root/.openclaw/workspace/skills/public/multi-agent-dispatch/state"
if [ -d "$STATE_DIR" ]; then
  ARCHIVE="/root/.openclaw/workspace/infrastructure/dispatcher/dispatched-archive/rollback-$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$ARCHIVE"
  cp "$STATE_DIR"/*.json "$ARCHIVE/" 2>/dev/null || true
  rm -f "$STATE_DIR/engine-state.json" "$STATE_DIR/live-board.json" "$STATE_DIR/pending-dispatches.json"
  echo "  → New engine state archived to $ARCHIVE and reset"
fi

# 4. Restart gateway
echo "  → Restarting gateway..."
openclaw gateway restart 2>/dev/null || echo "  ⚠ Gateway restart failed. Restart manually: openclaw gateway restart"

echo ""
echo "✅ Rollback complete. Old DispatchLayer is now active."
echo "   To re-enable: export DISPATCH_ENGINE=new && add reap cron back"
