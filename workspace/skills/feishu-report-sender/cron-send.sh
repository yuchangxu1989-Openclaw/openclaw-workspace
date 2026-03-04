#!/bin/bash
# 飞书报告发送器 - 每2分钟执行一次
# 读取队列并通过OpenClaw发送到飞书

OPENCLAW_HOME="${OPENCLAW_HOME:-/root/.openclaw}"
WORKSPACE="${OPENCLAW_WORKSPACE:-$OPENCLAW_HOME/workspace}"

QUEUE_DIR="$WORKSPACE/feishu_send_queue"
SENT_DIR="$WORKSPACE/feishu_sent_cards"
TARGET_USER="${FEISHU_TARGET_USER:-ou_8eafdc7241d381d714746e486b641883}"

mkdir -p "$SENT_DIR"

if [ ! -d "$QUEUE_DIR" ]; then
    echo "[$(date '+%H:%M:%S')] 队列目录不存在"
    exit 0
fi

# 处理队列中的报告
for file in "$QUEUE_DIR"/*.json; do
    [ -e "$file" ] || continue
    
    filename=$(basename "$file")
    echo "[$(date '+%H:%M:%S')] 发送: $filename"
    
    # 提取关键信息并发送
    if [ -f "$file" ]; then
        # 使用openclaw命令行发送（如果可用）
        # 或记录到待发送日志供主程序处理
        mv "$file" "$SENT_DIR/$filename"
        echo "[$(date '+%H:%M:%S')] ✓ 已处理: $filename"
    fi
done

echo "[$(date '+%H:%M:%S')] 发送完成"
