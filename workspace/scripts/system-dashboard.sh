#!/usr/bin/env bash
# ============================================================
# 🖥️  全局系统监控仪表盘
# 一键展示 OpenClaw 系统健康状态
# ============================================================
set -euo pipefail

WS="/root/.openclaw/workspace"
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; DIM='\033[2m'; RESET='\033[0m'

divider() { echo -e "${DIM}$(printf '─%.0s' {1..60})${RESET}"; }
header()  { echo -e "\n${BOLD}${CYAN}$1${RESET}"; divider; }

echo -e "${BOLD}╔══════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║        🖥️  OpenClaw 全局监控仪表盘                  ║${RESET}"
echo -e "${BOLD}║        $(date '+%Y-%m-%d %H:%M:%S %Z')               ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════╝${RESET}"

# ── 1. Agent 状态 ──
header "📋 1. Agent 子任务状态"
BOARD="$WS/logs/subagent-task-board.json"
if [[ -f "$BOARD" ]]; then
  for s in running done timeout failed; do
    count=$(jq -r "[.[] | select(.status==\"$s\")] | length" "$BOARD" 2>/dev/null || echo 0)
    case $s in
      running) color=$CYAN ;;
      done)    color=$GREEN ;;
      timeout) color=$YELLOW ;;
      failed)  color=$RED ;;
    esac
    printf "  %-10s ${color}%s${RESET}\n" "$s" "$count"
  done
  total=$(jq 'length' "$BOARD" 2>/dev/null || echo 0)
  echo -e "  ${DIM}总计: $total${RESET}"
else
  echo -e "  ${DIM}(未找到 task-board)${RESET}"
fi

# ── 2. ISC 规则统计 ──
header "📜 2. ISC 规则统计"
RULES_DIR="$WS/skills/isc-core/rules"
if [[ -d "$RULES_DIR" ]]; then
  total=$(find "$RULES_DIR" -name '*.json' | wc -l)
  echo -e "  规则总数: ${BOLD}$total${RESET}"
  echo -e "  ${DIM}按优先级分布:${RESET}"
  for p in critical high medium low; do
    cnt=$(grep -rl "\"priority\"[[:space:]]*:[[:space:]]*\"$p\"" "$RULES_DIR"/*.json 2>/dev/null | wc -l || echo 0)
    case $p in
      critical) color=$RED ;;
      high)     color=$YELLOW ;;
      medium)   color=$CYAN ;;
      low)      color=$GREEN ;;
    esac
    printf "    %-10s ${color}%s${RESET}\n" "$p" "$cnt"
  done
else
  echo -e "  ${DIM}(未找到 ISC 规则目录)${RESET}"
fi

# ── 3. 事件总线健康 ──
header "🚌 3. 事件总线健康"
EVT_DIR="$WS/logs/events"
if [[ -d "$EVT_DIR" ]]; then
  one_hour_ago=$(date -d '1 hour ago' '+%s' 2>/dev/null || date -v-1H '+%s' 2>/dev/null || echo 0)
  recent=0; errors=0
  while IFS= read -r f; do
    mtime=$(stat -c '%Y' "$f" 2>/dev/null || stat -f '%m' "$f" 2>/dev/null || echo 0)
    if (( mtime >= one_hour_ago )); then
      ((recent++))
      if grep -q '"error"\|"failed"' "$f" 2>/dev/null; then ((errors++)); fi
    fi
  done < <(find "$EVT_DIR" -name '*.json' -type f 2>/dev/null)
  if (( recent > 0 )); then
    pct=$((errors * 100 / recent))
    color=$GREEN; (( pct > 10 )) && color=$YELLOW; (( pct > 30 )) && color=$RED
    echo -e "  最近1h事件: ${BOLD}$recent${RESET}  错误: ${color}$errors ($pct%)${RESET}"
  else
    echo -e "  最近1h事件: ${DIM}0${RESET}"
  fi
else
  echo -e "  ${DIM}(未找到事件日志目录)${RESET}"
fi

# ── 4. 磁盘空间 ──
header "💾 4. 磁盘空间"
ws_size=$(du -sh "$WS" 2>/dev/null | cut -f1 || echo "N/A")
log_size=$(du -sh "$WS/logs" 2>/dev/null | cut -f1 || echo "N/A")
printf "  Workspace: ${BOLD}%-10s${RESET}  Logs: ${BOLD}%s${RESET}\n" "$ws_size" "$log_size"
df -h / 2>/dev/null | awk 'NR==2{printf "  系统盘:    已用 %s / %s (%s)\n", $3, $2, $5}'

# ── 5. Gateway 状态 ──
header "🌐 5. Gateway 状态"
gw=$(openclaw gateway status 2>&1 || true)
if echo "$gw" | grep -qi "running\|active\|online"; then
  echo -e "  ${GREEN}● 运行中${RESET}"
else
  echo -e "  ${RED}● 异常${RESET}"
fi
echo -e "  ${DIM}${gw:0:120}${RESET}"

# ── 6. Cron 任务 ──
header "⏰ 6. Cron 任务"
cron_out=$(openclaw cron list 2>&1 || true)
if [[ -z "$cron_out" || "$cron_out" == *"No cron"* || "$cron_out" == *"no cron"* ]]; then
  echo -e "  ${DIM}无定时任务${RESET}"
else
  cron_count=$(echo "$cron_out" | grep -c '[a-zA-Z]' || echo 0)
  echo -e "  任务数: ${BOLD}$cron_count${RESET}"
  echo "$cron_out" | head -10 | sed 's/^/  /'
fi

# ── 7. PDCA 最近检查 ──
header "🔄 7. PDCA 最近检查"
PDCA_DIR="$WS/logs/pdca"
if [[ -d "$PDCA_DIR" ]]; then
  latest=$(ls -t "$PDCA_DIR"/*.json 2>/dev/null | head -1)
  if [[ -n "$latest" ]]; then
    score=$(jq -r '.score // .check_score // "N/A"' "$latest" 2>/dev/null || echo "N/A")
    ts=$(jq -r '.timestamp // .date // empty' "$latest" 2>/dev/null || echo "")
    echo -e "  最近分数: ${BOLD}$score${RESET}  时间: ${ts:-$(stat -c '%y' "$latest" 2>/dev/null | cut -d. -f1)}"
  else
    echo -e "  ${DIM}(无检查记录)${RESET}"
  fi
else
  echo -e "  ${DIM}(未找到 PDCA 目录)${RESET}"
fi

# ── 8. Git 状态 ──
header "📦 8. Git 状态"
cd "$WS"
if git rev-parse --is-inside-work-tree &>/dev/null; then
  uncommitted=$(git status --porcelain 2>/dev/null | wc -l)
  last_commit=$(git log -1 --format='%ci | %s' 2>/dev/null || echo "N/A")
  color=$GREEN; (( uncommitted > 10 )) && color=$YELLOW; (( uncommitted > 30 )) && color=$RED
  echo -e "  未提交文件: ${color}${uncommitted}${RESET}"
  echo -e "  最近提交:   ${DIM}${last_commit}${RESET}"
else
  echo -e "  ${DIM}(非 Git 仓库)${RESET}"
fi

echo ""
divider
echo -e "${DIM}仪表盘生成完毕 ✅${RESET}"
