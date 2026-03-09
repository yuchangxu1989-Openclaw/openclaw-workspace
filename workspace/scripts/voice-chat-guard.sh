#!/bin/bash
# voice-chat-guard.sh - 语音聊天服务进程守护
# 每分钟由 cron 调用，检查 server.js 和 cloudflared 是否存活

LOG="/tmp/voice-chat-guard.log"
APP_DIR="/root/.openclaw/workspace/apps/voice-chat"
PORT=8080

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG"
}

# 1. 检查 server.js
if ! curl -sf -o /dev/null --max-time 5 "http://localhost:$PORT"; then
  log "server.js 无响应，正在重启..."
  # 杀掉残留进程
  pkill -f "node.*server\.js" 2>/dev/null
  sleep 1
  cd "$APP_DIR"
  nohup node server.js > /tmp/voice-chat-server.log 2>&1 &
  log "server.js 已重启 (PID: $!)"
  sleep 3
else
  : # server.js 正常
fi

# 2. 检查 cloudflared tunnel
if ! pgrep -f "cloudflared tunnel" > /dev/null 2>&1; then
  log "cloudflared tunnel 未运行，正在重启..."
  nohup cloudflared tunnel --url "http://localhost:$PORT" > /tmp/cloudflared-new.log 2>&1 &
  log "cloudflared tunnel 已重启 (PID: $!)"
fi
