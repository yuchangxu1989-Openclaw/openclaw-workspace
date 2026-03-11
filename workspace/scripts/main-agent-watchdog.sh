#!/usr/bin/env bash
# main-agent-watchdog.sh — 主Agent文件操作监控（轮询模式）
#
# 技术说明：
#   inotifywait 未安装，且在OpenClaw架构下，主Agent和子Agent的文件写入
#   都通过同一个sandbox进程执行，无法通过进程树区分写入者身份。
#
#   替代方案：基于"信号文件协议"的违规检测
#   - 子Agent在写入前/后会在task-board中有记录
#   - 如果workspace中出现了文件变更，但没有任何子Agent在running状态，
#     说明是主Agent自己在写文件（违规！）
#
# 用法:
#   bash main-agent-watchdog.sh              # 单次检查
#   bash main-agent-watchdog.sh --watch      # 持续监控（每30秒）
#   bash main-agent-watchdog.sh --interval 10 # 自定义间隔（秒）
#
# 输出:
#   检测到违规时输出告警并记录到日志
#   无违规时静默退出（exit 0）

set -euo pipefail

WORKSPACE="/root/.openclaw/workspace"
BOARD_FILE="${WORKSPACE}/logs/subagent-task-board.json"
LOG_FILE="${WORKSPACE}/logs/main-agent-watchdog.log"
VIOLATION_DIR="${WORKSPACE}/logs/violations"
EVENT_LOG="${WORKSPACE}/logs/dispatch-guard-events.jsonl"
SNAPSHOT_FILE="/tmp/watchdog-file-snapshot.txt"
WATCH_MODE=false
INTERVAL=30

# ── 白名单：这些路径允许主Agent写入 ──
WHITELIST_PATTERNS=(
  "logs/"
  ".dto-signals/"
  "reports/"
  ".interrupt-signal"
  "dispatch-guard-events.jsonl"
)

# ── 参数解析 ──
while [[ $# -gt 0 ]]; do
  case "$1" in
    --watch) WATCH_MODE=true; shift ;;
    --interval) INTERVAL="$2"; shift 2 ;;
    *) shift ;;
  esac
done

mkdir -p "$(dirname "$LOG_FILE")" "$VIOLATION_DIR"

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
  local event_id
  event_id="evt_$(date +%s)_$$"
  local line="{\"id\":\"${event_id}\",\"type\":\"${event_type}\",\"source\":\"main-agent-watchdog\",\"payload\":${payload},\"timestamp\":${ts}}"
  echo "$line" >> "$EVENT_LOG"
}

is_whitelisted() {
  local file="$1"
  for pattern in "${WHITELIST_PATTERNS[@]}"; do
    if [[ "$file" == *"$pattern"* ]]; then
      return 0
    fi
  done
  return 1
}

# ── 获取当前running的子Agent数量 ──
get_running_agents() {
  if [[ ! -f "$BOARD_FILE" ]]; then
    echo "0"
    return
  fi
  python3 -c "
import json, sys
try:
    with open('$BOARD_FILE') as f:
        data = json.load(f)
    running = [t for t in data if t.get('status') == 'running']
    print(len(running))
except:
    print('0')
" 2>/dev/null || echo "0"
}

get_running_agent_ids() {
  if [[ ! -f "$BOARD_FILE" ]]; then
    echo ""
    return
  fi
  python3 -c "
import json
try:
    with open('$BOARD_FILE') as f:
        data = json.load(f)
    running = [t['agentId'] for t in data if t.get('status') == 'running']
    print(','.join(running))
except:
    print('')
" 2>/dev/null || echo ""
}

# ── 生成文件快照 ──
take_snapshot() {
  # 记录workspace下所有文件的mtime（排除.git和node_modules）
  find "$WORKSPACE" \
    -not -path "*/.git/*" \
    -not -path "*/node_modules/*" \
    -not -path "*/logs/*" \
    -type f -printf '%T@ %p\n' 2>/dev/null | sort > "$1"
}

# ── 单次检查 ──
check_once() {
  local prev_snapshot="$SNAPSHOT_FILE"
  local curr_snapshot="/tmp/watchdog-file-snapshot-curr.txt"

  # 如果没有上次快照，生成一个然后退出（首次运行）
  if [[ ! -f "$prev_snapshot" ]]; then
    take_snapshot "$prev_snapshot"
    log "INFO: 首次运行，已生成基线快照"
    return 0
  fi

  # 生成当前快照
  take_snapshot "$curr_snapshot"

  # 比较差异：找出新增或修改的文件
  local changed_files
  changed_files=$(diff "$prev_snapshot" "$curr_snapshot" 2>/dev/null | grep '^>' | awk '{print $3}' || true)

  # 更新快照
  cp "$curr_snapshot" "$prev_snapshot"

  if [[ -z "$changed_files" ]]; then
    return 0  # 无变更
  fi

  # 过滤白名单
  local suspicious_files=()
  while IFS= read -r file; do
    [[ -z "$file" ]] && continue
    if ! is_whitelisted "$file"; then
      suspicious_files+=("$file")
    fi
  done <<< "$changed_files"

  if [[ ${#suspicious_files[@]} -eq 0 ]]; then
    return 0  # 变更都在白名单内
  fi

  # 检查是否有子Agent在running
  local running_count
  running_count=$(get_running_agents)
  local running_ids
  running_ids=$(get_running_agent_ids)

  if [[ "$running_count" -gt 0 ]]; then
    # 有子Agent在跑，变更可能是子Agent产生的，不告警
    log "INFO: 检测到 ${#suspicious_files[@]} 个文件变更，但有 ${running_count} 个子Agent在运行 (${running_ids})，跳过"
    return 0
  fi

  # ⚠️ 没有子Agent在running，但有文件变更 → 疑似主Agent违规写入
  local violation_count=${#suspicious_files[@]}
  local violation_time
  violation_time=$(date '+%Y%m%d_%H%M%S')
  local violation_file="${VIOLATION_DIR}/violation-${violation_time}.txt"

  echo "=== 主Agent文件写入违规 ===" > "$violation_file"
  echo "时间: $(date '+%Y-%m-%d %H:%M:%S')" >> "$violation_file"
  echo "Running子Agent数: ${running_count}" >> "$violation_file"
  echo "可疑文件 (${violation_count}):" >> "$violation_file"
  for f in "${suspicious_files[@]}"; do
    echo "  - $f" >> "$violation_file"
  done

  # 发射事件
  local files_json
  files_json=$(printf '%s\n' "${suspicious_files[@]}" | python3 -c "import sys,json; print(json.dumps([l.strip() for l in sys.stdin if l.strip()]))" 2>/dev/null || echo "[]")
  emit_event "main.agent.file.write.violation" "{\"count\":${violation_count},\"files\":${files_json},\"running_agents\":${running_count}}"

  log "⚠️ VIOLATION: ${violation_count} 个文件在无子Agent运行时被修改"
  echo "⚠️ 主Agent文件写入违规检测！"
  echo "   无子Agent在运行，但 ${violation_count} 个文件被修改："
  for f in "${suspicious_files[@]:0:5}"; do
    echo "   - $(basename "$f")"
  done
  if [[ $violation_count -gt 5 ]]; then
    echo "   ... 及其他 $((violation_count - 5)) 个文件"
  fi
  echo "   详情: $violation_file"

  return 1
}

# ── 主入口 ──
if $WATCH_MODE; then
  log "INFO: 启动持续监控模式，间隔 ${INTERVAL}s"
  echo "🔍 主Agent文件操作监控已启动（间隔 ${INTERVAL}s，Ctrl+C 停止）"
  # 生成初始快照
  take_snapshot "$SNAPSHOT_FILE"
  while true; do
    check_once || true
    sleep "$INTERVAL"
  done
else
  check_once
fi
