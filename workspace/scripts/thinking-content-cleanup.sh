#!/bin/bash
# thinking-content-cleanup.sh - 推理内容定期清理
# 部署位置: /root/.openclaw/workspace/scripts/thinking-content-cleanup.sh

THINKING_DIR="/root/.openclaw/agents/main/thinking"
ARCHIVE_DIR="/data/archive/thinking"
LOG_FILE="/root/.openclaw/workspace/logs/thinking-cleanup.log"

mkdir -p $(dirname $LOG_FILE)

echo "[$(date)] 开始推理内容清理" >> $LOG_FILE

# 1. 清理活跃推理文件，只保留最近10条
if [ -d "$THINKING_DIR" ]; then
  for file in $THINKING_DIR/*.thinking.jsonl; do
    if [ -f "$file" ]; then
      # 保留最后10行
      tail -n 10 "$file" > "${file}.tmp" && mv "${file}.tmp" "$file"
    fi
  done
  echo "  清理完成，保留最近10条推理内容" >> $LOG_FILE
fi

# 2. 归档超过1MB的文件
if [ -d "$THINKING_DIR" ]; then
  find $THINKING_DIR -name "*.thinking.jsonl" -size +1M | while read file; do
    BASENAME=$(basename "$file" .jsonl)
    MONTH=$(date +%Y%m)
    mkdir -p "$ARCHIVE_DIR/$MONTH"
    gzip -c "$file" > "$ARCHIVE_DIR/$MONTH/${BASENAME}.gz"
    # 清空原文件
    echo "" > "$file"
    echo "  归档: $file" >> $LOG_FILE
  done
fi

# 3. 清理7天前的归档
find $ARCHIVE_DIR -name "*.gz" -mtime +7 -delete 2>/dev/null

echo "[$(date)] 清理完成" >> $LOG_FILE
