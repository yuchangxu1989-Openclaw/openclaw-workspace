#!/bin/bash
# log-archive-rotator.sh
# 归档并压缩超过7天的日志文件
# 每天 03:10 运行（补充 backup-rotate.sh，专门处理 logs/ 目录）

WORKSPACE="/root/.openclaw/workspace"
ARCHIVE_DIR="$WORKSPACE/logs/archive"
THRESHOLD_DAYS=7
mkdir -p "$ARCHIVE_DIR"

ARCHIVED=0
DELETED=0

find "$WORKSPACE" \( -path "$ARCHIVE_DIR" -prune \) -o \
  \( -name "*.log" -mtime +$THRESHOLD_DAYS -print \) 2>/dev/null | while read logfile; do
  BASENAME=$(basename "$logfile")
  DATE_TAG=$(stat -c '%y' "$logfile" 2>/dev/null | cut -d' ' -f1)
  DEST="$ARCHIVE_DIR/${DATE_TAG}_${BASENAME}.gz"
  gzip -c "$logfile" > "$DEST" 2>/dev/null && rm -f "$logfile" && ARCHIVED=$((ARCHIVED+1))
done

# 删除超过30天的归档
find "$ARCHIVE_DIR" -name "*.gz" -mtime +30 -delete 2>/dev/null
DELETED=$(find "$ARCHIVE_DIR" -name "*.gz" -mtime +30 2>/dev/null | wc -l)

echo "[$(date '+%Y-%m-%d %H:%M')] log-archive-rotator: archived old logs, cleaned archive >30d"
