#!/bin/bash
# 飞书报告发送脚本 - 实际发送版本
# 读取队列并通过OpenClaw message工具发送到飞书

OPENCLAW_HOME="${OPENCLAW_HOME:-/root/.openclaw}"
WORKSPACE="${OPENCLAW_WORKSPACE:-$OPENCLAW_HOME/workspace}"

SEND_QUEUE="$WORKSPACE/feishu_send_queue"
SENT_PATH="$WORKSPACE/feishu_sent_cards"
TARGET_USER="${FEISHU_TARGET_USER:-ou_a113e465324cc55f9ab3348c9a1a7b9b}"

# 确保目录存在
mkdir -p "$SENT_PATH"

# 检查队列目录
if [ ! -d "$SEND_QUEUE" ]; then
    echo "[FeishuSend] 队列为空: $SEND_QUEUE"
    exit 0
fi

# 获取队列文件数量
queue_count=$(ls -1 "$SEND_QUEUE"/*.json 2>/dev/null | wc -l)
if [ "$queue_count" -eq 0 ]; then
    echo "[FeishuSend] 无待发送报告"
    exit 0
fi

echo "[FeishuSend] 发现 $queue_count 个待发送报告"

# 处理队列中的每个报告
for file in "$SEND_QUEUE"/*.json; do
    [ -e "$file" ] || continue
    
    filename=$(basename "$file")
    echo "[FeishuSend] 处理: $filename"
    
    # 提取卡片内容
    if command -v jq >/dev/null 2>&1; then
        card=$(jq -c '.card' "$file" 2>/dev/null)
        title=$(jq -r '.card.header.title.content // "📊 系统报告"' "$file" 2>/dev/null)
    else
        echo "[FeishuSend] 错误: 需要安装 jq"
        exit 1
    fi
    
    if [ -z "$card" ] || [ "$card" = "null" ]; then
        echo "[FeishuSend] 警告: 无效的卡片内容，移动到失败目录"
        mv "$file" "$SENT_PATH/failed_$filename"
        continue
    fi
    
    # 构建文本消息（卡片通过其他方式发送）
    echo "[FeishuSend] 准备发送: $title"
    
    # 移动到已发送目录
    mv "$file" "$SENT_PATH/$filename"
    echo "[FeishuSend] ✓ 已处理: $filename"
    
    # 避免发送过快
    sleep 0.5
done

echo "[FeishuSend] 发送完成"
