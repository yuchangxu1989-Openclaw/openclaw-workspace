#!/bin/bash
# 会话文件自动清理脚本
# 保留最近 50 个会话文件，归档旧文件

SESSION_DIR="/root/.openclaw/agents/main/sessions"
ARCHIVE_DIR="/root/.openclaw/agents/main/sessions/archives"
KEEP_COUNT=50

# 创建归档目录
mkdir -p "$ARCHIVE_DIR"

# 获取当前会话文件数
TOTAL_COUNT=$(ls -1 "$SESSION_DIR"/*.jsonl 2>/dev/null | wc -l)

if [ "$TOTAL_COUNT" -le "$KEEP_COUNT" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 会话文件数量: $TOTAL_COUNT，无需清理 (保留: $KEEP_COUNT)"
    exit 0
fi

# 计算需要归档的数量
ARCHIVE_COUNT=$((TOTAL_COUNT - KEEP_COUNT))
echo "[$(date '+%Y-%m-%d %H:%M:%S')] 会话文件数量: $TOTAL_COUNT，将归档 $ARCHIVE_COUNT 个旧文件"

# 按时间排序，归档最旧的文件
ls -1t "$SESSION_DIR"/*.jsonl 2>/dev/null | tail -n "$ARCHIVE_COUNT" | while read file; do
    filename=$(basename "$file")
    # 压缩归档
    gzip -c "$file" > "$ARCHIVE_DIR/${filename}.gz" 2>/dev/null
    if [ $? -eq 0 ]; then
        rm "$file"
        echo "  已归档: $filename"
    else
        echo "  归档失败: $filename"
    fi
done

# 清理超过 7 天的归档文件
find "$ARCHIVE_DIR" -name "*.gz" -mtime +7 -delete 2>/dev/null

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 清理完成，剩余会话: $(ls -1 $SESSION_DIR/*.jsonl 2>/dev/null | wc -l)"
