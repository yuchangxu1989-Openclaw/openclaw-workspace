#!/bin/bash
# entropy-index-calculator.sh
# 计算系统每日熵值指数（文件变更量、规则密度、日志行数等代理指标）
# 每天 00:05 运行

WORKSPACE="/root/.openclaw/workspace"
REPORT_DIR="$WORKSPACE/reports/trends"
METRIC_FILE="$REPORT_DIR/entropy-index.jsonl"
mkdir -p "$REPORT_DIR"

DATE=$(date '+%Y-%m-%d')
TS=$(date +%s)

# 指标采集
RULE_COUNT=$(find "$WORKSPACE/skills" -name "*.md" -o -name "*.json" 2>/dev/null | wc -l)
LOG_LINES=$(find "$WORKSPACE" -name "*.log" -newer "$WORKSPACE/reports/trends/entropy-index.jsonl" 2>/dev/null \
  -exec wc -l {} + 2>/dev/null | tail -1 | awk '{print $1}' || echo 0)
SCRIPT_COUNT=$(find "$WORKSPACE/scripts" -name "*.sh" -o -name "*.js" 2>/dev/null | wc -l)
REPORT_COUNT=$(find "$WORKSPACE/reports" -name "*.md" 2>/dev/null | wc -l)
MEMORY_SIZE=0  # Legacy MEMORY.md已废弃，MemOS为唯一记忆源
CRON_COUNT=$(crontab -l 2>/dev/null | grep -v '^#' | grep -v '^$' | wc -l)

# 近24h git提交数
GIT_COMMITS=$(git -C "$WORKSPACE" log --since="24 hours ago" --oneline 2>/dev/null | wc -l || echo 0)

# 计算综合有序度分 (越高越有序，反熵增)
ORDER_SCORE=$(echo "scale=2; ($RULE_COUNT * 2 + $SCRIPT_COUNT * 3 + $GIT_COMMITS * 5 - $LOG_LINES / 100) / 10" | bc 2>/dev/null || echo 0)

JSON="{\"date\":\"$DATE\",\"ts\":$TS,\"rule_count\":$RULE_COUNT,\"script_count\":$SCRIPT_COUNT,\"report_count\":$REPORT_COUNT,\"memory_bytes\":$MEMORY_SIZE,\"cron_jobs\":$CRON_COUNT,\"git_commits_24h\":$GIT_COMMITS,\"order_score\":$ORDER_SCORE}"
echo "$JSON" >> "$METRIC_FILE"

echo "[$(date '+%Y-%m-%d %H:%M')] entropy-index: order_score=$ORDER_SCORE rules=$RULE_COUNT scripts=$SCRIPT_COUNT commits_24h=$GIT_COMMITS"
