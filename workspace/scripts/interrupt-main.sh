#!/usr/bin/env bash
# interrupt-main.sh — 用户中断主Agent CLI
#
# 原理：
#   OpenClaw没有公开API向正在运行的session注入消息。
#   替代方案：写入信号文件，主Agent在每次调度前轮询检查。
#   配合 dispatch-guard.js 使用——guard会在每次派发前检查中断信号。
#
# 用法:
#   bash interrupt-main.sh "停下来，不要自己做"
#   bash interrupt-main.sh "暂停所有派发，等我指示"
#   bash interrupt-main.sh --clear          # 清除中断信号
#   bash interrupt-main.sh --status         # 查看当前信号状态
#
# 信号文件: /root/.openclaw/workspace/.interrupt-signal
# 格式: JSON { message, timestamp, user, ttl_minutes }

set -euo pipefail

SIGNAL_FILE="/root/.openclaw/workspace/.interrupt-signal"
LOG_FILE="/root/.openclaw/workspace/logs/interrupt-main.log"
EVENT_LOG="/root/.openclaw/workspace/logs/dispatch-guard-events.jsonl"
DEFAULT_TTL=30  # 信号默认30分钟后自动过期

mkdir -p "$(dirname "$LOG_FILE")"

log() {
  local ts
  ts=$(date '+%Y-%m-%d %H:%M:%S')
  echo "[$ts] $1" >> "$LOG_FILE"
}

emit_event() {
  local event_type="$1"
  local payload="$2"
  local ts
  ts=$(date +%s%3N)
  local event_id="evt_int_$(date +%s)_$$"
  echo "{\"id\":\"${event_id}\",\"type\":\"${event_type}\",\"source\":\"interrupt-main\",\"payload\":${payload},\"timestamp\":${ts}}" >> "$EVENT_LOG"
}

# ── 清除信号 ──
clear_signal() {
  if [[ -f "$SIGNAL_FILE" ]]; then
    local old_msg
    old_msg=$(python3 -c "import json; print(json.load(open('$SIGNAL_FILE'))['message'])" 2>/dev/null || echo "unknown")
    rm -f "$SIGNAL_FILE"
    log "CLEAR: 中断信号已清除 (原消息: ${old_msg})"
    emit_event "main.agent.interrupt.cleared" "{\"previous_message\":\"${old_msg}\"}"
    echo "✅ 中断信号已清除"
  else
    echo "ℹ️  当前没有活跃的中断信号"
  fi
}

# ── 查看状态 ──
show_status() {
  if [[ ! -f "$SIGNAL_FILE" ]]; then
    echo "ℹ️  当前没有活跃的中断信号"
    return 0
  fi

  python3 -c "
import json, sys
from datetime import datetime, timedelta

with open('$SIGNAL_FILE') as f:
    sig = json.load(f)

ts = datetime.fromisoformat(sig['timestamp'])
ttl = sig.get('ttl_minutes', $DEFAULT_TTL)
expires = ts + timedelta(minutes=ttl)
now = datetime.now()

if now > expires:
    print('⏰ 中断信号已过期')
    print(f'   消息: {sig[\"message\"]}')
    print(f'   设置时间: {sig[\"timestamp\"]}')
    print(f'   过期时间: {expires.isoformat()}')
    print('   建议: bash interrupt-main.sh --clear')
else:
    remaining = (expires - now).total_seconds() / 60
    print('🔴 中断信号活跃中')
    print(f'   消息: {sig[\"message\"]}')
    print(f'   设置时间: {sig[\"timestamp\"]}')
    print(f'   剩余: {remaining:.0f} 分钟')
" 2>/dev/null || echo "⚠️ 信号文件损坏，建议 --clear"
}

# ── 检查信号是否有效（供其他脚本调用） ──
# 用法: source interrupt-main.sh && check_interrupt
check_interrupt() {
  if [[ ! -f "$SIGNAL_FILE" ]]; then
    return 1  # 无信号
  fi

  python3 -c "
import json, sys
from datetime import datetime, timedelta

with open('$SIGNAL_FILE') as f:
    sig = json.load(f)

ts = datetime.fromisoformat(sig['timestamp'])
ttl = sig.get('ttl_minutes', $DEFAULT_TTL)
expires = ts + timedelta(minutes=ttl)

if datetime.now() > expires:
    sys.exit(1)  # 已过期
else:
    print(sig['message'])
    sys.exit(0)  # 有效
" 2>/dev/null
  return $?
}

# ── 设置中断信号 ──
set_signal() {
  local message="$1"
  local ttl="${2:-$DEFAULT_TTL}"
  local timestamp
  timestamp=$(date '+%Y-%m-%dT%H:%M:%S')

  cat > "$SIGNAL_FILE" << EOF
{
  "message": "${message}",
  "timestamp": "${timestamp}",
  "user": "$(whoami)",
  "ttl_minutes": ${ttl},
  "source": "interrupt-main-cli"
}
EOF

  log "SET: 中断信号已设置 — ${message} (TTL=${ttl}min)"
  emit_event "main.agent.interrupt.set" "{\"message\":\"${message}\",\"ttl_minutes\":${ttl}}"

  echo "🔴 中断信号已设置！"
  echo "   消息: ${message}"
  echo "   有效期: ${ttl} 分钟"
  echo "   文件: ${SIGNAL_FILE}"
  echo ""
  echo "   主Agent在下次调度时会看到此信号并暂停。"
  echo "   清除: bash interrupt-main.sh --clear"
}

# ── 主入口 ──
case "${1:-}" in
  --clear|-c)
    clear_signal
    ;;
  --status|-s)
    show_status
    ;;
  --check)
    # 静默检查，供脚本调用
    check_interrupt
    ;;
  --help|-h)
    echo "用法:"
    echo "  bash interrupt-main.sh \"你的消息\"     # 设置中断信号"
    echo "  bash interrupt-main.sh --clear         # 清除信号"
    echo "  bash interrupt-main.sh --status        # 查看状态"
    echo "  bash interrupt-main.sh --check         # 静默检查（供脚本调用）"
    echo "  bash interrupt-main.sh --ttl 60 \"消息\" # 自定义TTL（分钟）"
    ;;
  --ttl)
    if [[ -z "${3:-}" ]]; then
      echo "❌ 用法: bash interrupt-main.sh --ttl <分钟> \"消息\""
      exit 1
    fi
    set_signal "$3" "$2"
    ;;
  "")
    echo "❌ 请提供中断消息"
    echo "   用法: bash interrupt-main.sh \"停下来\""
    echo "   帮助: bash interrupt-main.sh --help"
    exit 1
    ;;
  *)
    set_signal "$1"
    ;;
esac
