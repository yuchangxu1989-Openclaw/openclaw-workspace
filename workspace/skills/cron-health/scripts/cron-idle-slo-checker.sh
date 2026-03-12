#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# cron-idle-slo-checker.sh — Cron空转SLO告警检测器
# ═══════════════════════════════════════════════════════════════════════════
#
# 功能：检测cron脚本连续空转（有上游输入却无产出），触发分级告警
# 规则：
#   黄色告警：连续空转 ≥ 10次 且上游有输入
#   红色告警：连续空转 ≥ 30次 且上游有输入
#
# 触发：crontab 每小时运行一次
# 输出：告警写入 event-bus/events.jsonl
# 状态：infrastructure/logs/slo/{script-name}.json
#
# 依赖：jq, bash 4+
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

WORKSPACE="${WORKSPACE_ROOT:-/root/.openclaw/workspace}"
SLO_DIR="$WORKSPACE/infrastructure/logs/slo"
EVENTS_JSONL="$WORKSPACE/infrastructure/event-bus/events.jsonl"
NOW_ISO=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
NOW_MS=$(date +%s%3N 2>/dev/null || echo $(($(date +%s) * 1000)))

mkdir -p "$SLO_DIR"
mkdir -p "$(dirname "$EVENTS_JSONL")"

# ─── 工具函数 ─────────────────────────────────────────────────────────────

log() {
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [SLO] $*"
}

# 读取或初始化SLO状态文件
read_slo() {
  local name="$1"
  local file="$SLO_DIR/${name}.json"
  if [[ -f "$file" ]]; then
    cat "$file"
  else
    echo '{"consecutive_idle_count":0,"last_productive_run":"never","upstream_has_input":false,"last_check":"never","alert_level":"none"}'
  fi
}

# 写入SLO状态
write_slo() {
  local name="$1"
  local json="$2"
  echo "$json" > "$SLO_DIR/${name}.json"
}

# 生成事件ID
gen_event_id() {
  local prefix="evt_slo_$(date +%s)"
  local rand=$(head -c 4 /dev/urandom | od -An -tx4 | tr -d ' ')
  echo "${prefix}_${rand}"
}

# 发送告警到事件总线
emit_alert() {
  local script_name="$1"
  local level="$2"       # yellow | red
  local idle_count="$3"
  local last_productive="$4"

  local severity="warning"
  [[ "$level" == "red" ]] && severity="critical"

  local event_id
  event_id=$(gen_event_id)

  local event
  event=$(cat <<EOF
{"id":"${event_id}","type":"slo.cron-idle-alert","source":"cron-idle-slo-checker","payload":{"script":"${script_name}","alert_level":"${level}","severity":"${severity}","consecutive_idle_count":${idle_count},"last_productive_run":"${last_productive}","message":"${script_name} 连续空转 ${idle_count} 次且上游有输入 [${level}级告警]","_metadata":{"trace_id":"trace_slo_${NOW_MS}","emitted_at":${NOW_MS},"event_type":"slo.cron-idle-alert"}},"timestamp":${NOW_MS}}
EOF
  )

  echo "$event" >> "$EVENTS_JSONL"
  log "⚠️  [${level^^}] ${script_name}: 连续空转 ${idle_count} 次，告警已发送"
}

# ─── 检测函数：每个脚本的空转判定逻辑 ───────────────────────────────────

# 1. git-sensor：上游=git commit，产出=processed signal files
check_git_sensor() {
  local name="git-sensor"
  local slo
  slo=$(read_slo "$name")

  # 上游检测：最近1小时内是否有新的git commit
  local recent_commits
  recent_commits=$(cd "$WORKSPACE" && git log --since="1 hour ago" --oneline 2>/dev/null | wc -l)

  local upstream_has_input=false
  [[ "$recent_commits" -gt 0 ]] && upstream_has_input=true

  # 产出检测：git-sensor日志中最近1小时是否有 processed>0 的记录
  local productive=false
  if [[ -f /tmp/git-sensor.log ]]; then
    # 日志格式: {"processed":N,"events":[...]}
    local recent_productive
    recent_productive=$(tail -60 /tmp/git-sensor.log 2>/dev/null | grep -c '"processed":[1-9]' || true)
    [[ "$recent_productive" -gt 0 ]] && productive=true
  fi

  update_slo "$name" "$upstream_has_input" "$productive" "$slo"
}

# 2. intent-extractor：上游=新会话消息(memory文件更新)，产出=意图提取
check_intent_extractor() {
  local name="intent-extractor"
  local slo
  slo=$(read_slo "$name")

  # 上游检测：最近1小时内memory文件是否有更新
  local today
  today=$(date +%Y-%m-%d)
  local upstream_has_input=false
  local memory_file="$WORKSPACE/memory/${today}.md"
  if [[ -f "$memory_file" ]]; then
    local mod_age
    mod_age=$(( $(date +%s) - $(stat -c %Y "$memory_file" 2>/dev/null || echo 0) ))
    [[ "$mod_age" -lt 3600 ]] && upstream_has_input=true
  fi

  # 产出检测：日志中最近是否有非"无新增内容"的行
  local productive=false
  local log_file="$WORKSPACE/infrastructure/logs/intent-extractor.log"
  if [[ -f "$log_file" ]]; then
    # 检查最近60行是否有实际提取（不是"无新增内容，跳过"）
    local real_output
    real_output=$(tail -60 "$log_file" 2>/dev/null | grep -v "无新增内容" | grep -v "开始增量扫描" | grep -c "intent\|提取\|emit\|RULEIFY\|QUERY\|FEEDBACK\|DIRECTIVE\|REFLECT" || true)
    [[ "$real_output" -gt 0 ]] && productive=true
  fi

  update_slo "$name" "$upstream_has_input" "$productive" "$slo"
}

# 3. correction-harvester：上游=用户纠偏消息，产出=badcase记录
check_correction_harvester() {
  local name="correction-harvester"
  local slo
  slo=$(read_slo "$name")

  # 上游检测：与intent-extractor类似，检查memory文件是否有更新
  local today
  today=$(date +%Y-%m-%d)
  local upstream_has_input=false
  local memory_file="$WORKSPACE/memory/${today}.md"
  if [[ -f "$memory_file" ]]; then
    local mod_age
    mod_age=$(( $(date +%s) - $(stat -c %Y "$memory_file" 2>/dev/null || echo 0) ))
    [[ "$mod_age" -lt 3600 ]] && upstream_has_input=true
  fi

  # 产出检测：日志最近是否有实际收割（不是"无新纠偏信号"）
  local productive=false
  local log_file="$WORKSPACE/infrastructure/logs/correction-harvester.log"
  if [[ -f "$log_file" ]]; then
    local real_output
    real_output=$(tail -60 "$log_file" 2>/dev/null | grep -v "无新纠偏信号" | grep -v "纠偏收割器启动" | grep -v "扫描记忆文件" | grep -v "^总计: 0" | grep -c "纠偏\|correction\|badcase\|pending-cases\|写入\|总计: [1-9]" || true)
    [[ "$real_output" -gt 0 ]] && productive=true
  fi

  update_slo "$name" "$upstream_has_input" "$productive" "$slo"
}

# 4. dispatch-cron-runner：上游=pending任务，产出=任务派发
check_dispatch_cron_runner() {
  local name="dispatch-cron-runner"
  local slo
  slo=$(read_slo "$name")

  # 上游检测：pending-dispatches.json 是否有待派发任务
  local upstream_has_input=false
  local pending_file="$WORKSPACE/skills/public/multi-agent-dispatch/state/pending-dispatches.json"
  if [[ -f "$pending_file" ]]; then
    local pending_count
    pending_count=$(jq 'if type == "array" then length elif type == "object" then (.items // [] | length) else 0 end' "$pending_file" 2>/dev/null || echo 0)
    [[ "$pending_count" -gt 0 ]] && upstream_has_input=true
  fi
  # 也检查jsonl日志中是否报告了pending tasks
  local jsonl_log="$WORKSPACE/infrastructure/logs/dispatch-cron-runner.jsonl"
  if [[ -f "$jsonl_log" ]]; then
    local has_queued
    has_queued=$(tail -12 "$jsonl_log" 2>/dev/null | jq -r 'select(.board.queueDepth > 0 or .board.queuedCount > 0) | "yes"' 2>/dev/null | head -1 || true)
    [[ -n "$has_queued" ]] && upstream_has_input=true
  fi

  # 产出检测：spawned>0 或 republished>0 或 reaped>0
  local productive=false
  if [[ -f "$jsonl_log" ]]; then
    local active_lines
    active_lines=$(tail -12 "$jsonl_log" 2>/dev/null | jq -r 'select(.spawned > 0 or .republished > 0 or .reaped > 0 or .reapedFollowups > 0) | "yes"' 2>/dev/null | head -1 || true)
    [[ -n "$active_lines" ]] && productive=true
  fi

  update_slo "$name" "$upstream_has_input" "$productive" "$slo"
}

# 5. day-completion-scanner：上游=running任务(Day closure)，产出=完成检测报告
check_day_completion_scanner() {
  local name="day-completion-scanner"
  local slo
  slo=$(read_slo "$name")

  # 上游检测：是否有running Day（检查reports中的closure文件近期变化）
  local upstream_has_input=false
  local reports_dir="$WORKSPACE/reports"
  if [[ -d "$reports_dir" ]]; then
    # 如果有新的closure-conditions文件或recent task activity
    local recent_closure
    recent_closure=$(find "$reports_dir" -name "day*-closure-conditions.md" -mmin -60 2>/dev/null | wc -l)
    [[ "$recent_closure" -gt 0 ]] && upstream_has_input=true
  fi
  # 也检查task-board有无running任务
  local board_file="$WORKSPACE/skills/public/multi-agent-dispatch/state/task-board.json"
  if [[ -f "$board_file" ]]; then
    local running
    running=$(jq '[.[] | select(.status == "running" or .status == "in_progress")] | length' "$board_file" 2>/dev/null || echo 0)
    [[ "$running" -gt 0 ]] && upstream_has_input=true
  fi

  # 产出检测：日志中有实际扫描结果（不是"无新的Day完成事件"）
  local productive=false
  local log_file="$WORKSPACE/infrastructure/logs/day-scanner.log"
  if [[ -f "$log_file" ]]; then
    local real_output
    real_output=$(tail -24 "$log_file" 2>/dev/null | grep -v "无新的Day完成事件" | grep -v "自动扫描:" | grep -c "扫描\|debt\|完成\|Day [0-9]\|report" || true)
    [[ "$real_output" -gt 0 ]] && productive=true
  fi

  update_slo "$name" "$upstream_has_input" "$productive" "$slo"
}

# 6. alert-auto-rootcause：上游=告警事件，产出=根因分析
check_alert_auto_rootcause() {
  local name="alert-auto-rootcause"
  local slo
  slo=$(read_slo "$name")

  # 上游检测：observability/alerts.jsonl 最近1小时是否有新告警
  local upstream_has_input=false
  local alerts_file="$WORKSPACE/infrastructure/observability/alerts.jsonl"
  if [[ -f "$alerts_file" ]]; then
    local alerts_mod_age
    alerts_mod_age=$(( $(date +%s) - $(stat -c %Y "$alerts_file" 2>/dev/null || echo 0) ))
    [[ "$alerts_mod_age" -lt 3600 ]] && upstream_has_input=true
  fi

  # 产出检测：日志中有实际分析（不是"无未响应告警"）
  local productive=false
  local log_file="$WORKSPACE/infrastructure/logs/alert-auto-rootcause.log"
  if [[ -f "$log_file" ]]; then
    local real_output
    real_output=$(tail -30 "$log_file" 2>/dev/null | grep -v "无未响应告警" | grep -c "根因\|分析\|root.cause\|analysis\|修复\|任务" || true)
    [[ "$real_output" -gt 0 ]] && productive=true
  fi

  update_slo "$name" "$upstream_has_input" "$productive" "$slo"
}

# ─── 通用SLO更新逻辑 ─────────────────────────────────────────────────────

update_slo() {
  local name="$1"
  local upstream_has_input="$2"  # true/false
  local productive="$3"          # true/false
  local prev_slo="$4"            # previous JSON

  local prev_idle_count
  prev_idle_count=$(echo "$prev_slo" | jq -r '.consecutive_idle_count // 0')
  local prev_last_productive
  prev_last_productive=$(echo "$prev_slo" | jq -r '.last_productive_run // "never"')
  local prev_alert_level
  prev_alert_level=$(echo "$prev_slo" | jq -r '.alert_level // "none"')

  local new_idle_count="$prev_idle_count"
  local new_last_productive="$prev_last_productive"
  local new_alert_level="none"

  if [[ "$productive" == "true" ]]; then
    # 有产出 → 重置计数器
    new_idle_count=0
    new_last_productive="$NOW_ISO"
    new_alert_level="none"
    log "✅ ${name}: 有产出，重置空转计数"
  else
    # 无产出 → 增加空转计数
    new_idle_count=$((prev_idle_count + 1))

    if [[ "$upstream_has_input" == "true" ]]; then
      if [[ "$new_idle_count" -ge 30 ]]; then
        new_alert_level="red"
        # 只在首次升级为red或每30次发告警（避免告警疲劳）
        if [[ "$prev_alert_level" != "red" ]] || [[ $((new_idle_count % 30)) -eq 0 ]]; then
          emit_alert "$name" "red" "$new_idle_count" "$new_last_productive"
        fi
      elif [[ "$new_idle_count" -ge 10 ]]; then
        new_alert_level="yellow"
        # 首次yellow或每10次
        if [[ "$prev_alert_level" == "none" ]] || [[ $((new_idle_count % 10)) -eq 0 ]]; then
          emit_alert "$name" "yellow" "$new_idle_count" "$new_last_productive"
        fi
      fi
      log "⏸️  ${name}: 空转 ${new_idle_count} 次 (上游有输入, 级别=${new_alert_level})"
    else
      log "💤 ${name}: 空转 ${new_idle_count} 次 (上游无输入, 不告警)"
    fi
  fi

  # 写入状态
  local new_slo
  new_slo=$(cat <<EOF
{
  "consecutive_idle_count": ${new_idle_count},
  "last_productive_run": "${new_last_productive}",
  "upstream_has_input": ${upstream_has_input},
  "last_check": "${NOW_ISO}",
  "alert_level": "${new_alert_level}"
}
EOF
  )
  write_slo "$name" "$new_slo"
}

# ─── 主流程 ───────────────────────────────────────────────────────────────

main() {
  log "═══ Cron空转SLO检查开始 ═══"

  check_git_sensor
  check_intent_extractor
  check_correction_harvester
  check_dispatch_cron_runner
  check_day_completion_scanner
  check_alert_auto_rootcause

  log "═══ Cron空转SLO检查完成 ═══"

  # 输出摘要
  log "--- 状态摘要 ---"
  for f in "$SLO_DIR"/*.json; do
    [[ -f "$f" ]] || continue
    local script_name
    script_name=$(basename "$f" .json)
    local idle
    idle=$(jq -r '.consecutive_idle_count' "$f")
    local level
    level=$(jq -r '.alert_level' "$f")
    local upstream
    upstream=$(jq -r '.upstream_has_input' "$f")
    log "  ${script_name}: idle=${idle} level=${level} upstream=${upstream}"
  done
}

main "$@"
