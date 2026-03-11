#!/bin/bash
# stale-backlog-pruner.sh
# 扫描30天未触碰的backlog条目，标记为归档候选
# 每周三 10:00 运行

WORKSPACE="/root/.openclaw/workspace"
REPORT_DIR="$WORKSPACE/reports/weekly"
REPORT="$REPORT_DIR/stale-backlog-$(date +%Y-%m-%d).md"
THRESHOLD_DAYS=30
NOW=$(date +%s)
mkdir -p "$REPORT_DIR"

echo "# 陈旧 Backlog 扫描报告 $(date '+%Y-%m-%d')" > "$REPORT"
echo "阈值：>= ${THRESHOLD_DAYS} 天未修改" >> "$REPORT"
echo "" >> "$REPORT"

TOTAL=0

# 扫描常见backlog位置
for dir in designs evolver lep-subagent council-inputs tmp-*; do
  TARGET="$WORKSPACE/$dir"
  if [ -d "$TARGET" ]; then
    echo "### $dir" >> "$REPORT"
    COUNT=0
    while IFS= read -r -d '' file; do
      MOD=$(stat -c %Y "$file" 2>/dev/null || echo 0)
      AGE=$(( (NOW - MOD) / 86400 ))
      if [ $AGE -ge $THRESHOLD_DAYS ]; then
        REL="${file#$WORKSPACE/}"
        echo "- \`$REL\` — ${AGE}d 未修改" >> "$REPORT"
        COUNT=$((COUNT + 1))
        TOTAL=$((TOTAL + 1))
      fi
    done < <(find "$TARGET" -maxdepth 4 -name "*.md" -print0 2>/dev/null)
    [ $COUNT -eq 0 ] && echo "_无陈旧条目_" >> "$REPORT"
    echo "" >> "$REPORT"
  fi
done

echo "---" >> "$REPORT"
echo "**总计 ${TOTAL} 个陈旧条目待归档确认**" >> "$REPORT"
echo "" >> "$REPORT"
echo "_由 stale-backlog-pruner.sh 自动生成_" >> "$REPORT"

echo "[$(date '+%Y-%m-%d %H:%M')] stale-backlog-pruner: $TOTAL stale entries → $REPORT"
