#!/bin/bash
# orphaned-task-scanner.sh
# 扫描超过48h未推进的任务/设计文档，输出报告
# 每天 06:00 运行

WORKSPACE="/root/.openclaw/workspace"
REPORT_DIR="$WORKSPACE/reports/daily"
REPORT="$REPORT_DIR/orphaned-tasks-$(date +%Y-%m-%d).md"
THRESHOLD_HOURS=48
NOW=$(date +%s)

mkdir -p "$REPORT_DIR"

echo "# 孤儿任务扫描报告 $(date '+%Y-%m-%d %H:%M')" > "$REPORT"
echo "" >> "$REPORT"
echo "## 超过 ${THRESHOLD_HOURS}h 未修改的设计/任务文档" >> "$REPORT"
echo "" >> "$REPORT"

# 扫描 designs/ reports/ lep-subagent/ council-inputs/ tmp-* 下的文件
STALE_COUNT=0
for dir in designs reports lep-subagent council-inputs evolver; do
  if [ -d "$WORKSPACE/$dir" ]; then
    while IFS= read -r -d '' file; do
      MOD=$(stat -c %Y "$file" 2>/dev/null || echo 0)
      AGE_H=$(( (NOW - MOD) / 3600 ))
      if [ $AGE_H -gt $THRESHOLD_HOURS ]; then
        REL="${file#$WORKSPACE/}"
        echo "- \`$REL\` — ${AGE_H}h ago" >> "$REPORT"
        STALE_COUNT=$((STALE_COUNT + 1))
      fi
    done < <(find "$WORKSPACE/$dir" -maxdepth 3 -name "*.md" -print0 2>/dev/null)
  fi
done

echo "" >> "$REPORT"
echo "**总计：${STALE_COUNT} 个孤儿文件**" >> "$REPORT"
echo "" >> "$REPORT"
echo "---" >> "$REPORT"
echo "_由 orphaned-task-scanner.sh 自动生成_" >> "$REPORT"

echo "[$(date '+%Y-%m-%d %H:%M')] orphaned-task-scanner done: $STALE_COUNT stale files → $REPORT"
