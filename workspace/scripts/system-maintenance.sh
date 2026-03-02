#!/bin/bash
# OpenClaw 系统维护脚本 - 防止消息阻塞复发
# 每天执行一次

LOG_FILE="/root/.openclaw/workspace/logs/system-maintenance.log"
mkdir -p /root/.openclaw/workspace/logs

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 系统维护任务开始" >> "$LOG_FILE"

# 1. 会话文件清理 (保留最近50个)
echo "  → 清理会话文件..." >> "$LOG_FILE"
cd /root/.openclaw/agents/main/sessions/ 2>/dev/null
if [ $? -eq 0 ]; then
    TOTAL=$(ls -t *.jsonl 2>/dev/null | wc -l)
    if [ "$TOTAL" -gt 50 ]; then
        DELETE_COUNT=$((TOTAL - 50))
        ls -t *.jsonl | tail -n +51 | xargs -r rm -f
        echo "    删除了 $DELETE_COUNT 个旧会话文件" >> "$LOG_FILE"
    else
        echo "    会话文件数正常 ($TOTAL)，无需清理" >> "$LOG_FILE"
    fi
else
    echo "    会话目录不存在，跳过" >> "$LOG_FILE"
fi

# 2. 检查Gateway内存使用
echo "  → 检查Gateway内存..." >> "$LOG_FILE"
GATEWAY_PID=$(pgrep -f "openclaw-gateway" | head -1)
if [ -n "$GATEWAY_PID" ]; then
    MEMORY_KB=$(ps -p $GATEWAY_PID -o rss= 2>/dev/null | tr -d ' ')
    MEMORY_MB=$((MEMORY_KB / 1024))
    echo "    Gateway内存使用: ${MEMORY_MB}MB" >> "$LOG_FILE"
    
    # 如果内存超过1GB，告警
    if [ "$MEMORY_MB" -gt 1024 ]; then
        echo "    ⚠️ 警告: Gateway内存超过1GB (${MEMORY_MB}MB)" >> "$LOG_FILE"
        # 发送告警 (这里可以集成飞书通知)
        echo "[ALERT] Gateway内存过高: ${MEMORY_MB}MB" > /tmp/gateway-memory-alert
    fi
else
    echo "    Gateway未运行" >> "$LOG_FILE"
fi

# 3. 压缩大文件 (>1MB的日志)
echo "  → 压缩大日志文件..." >> "$LOG_FILE"
find /root/.openclaw/agents/main/sessions/ -name "*.jsonl" -size +1M -mtime +1 -exec gzip {} \; 2>/dev/null
echo "    大文件压缩完成" >> "$LOG_FILE"

# 4. 清理临时文件
echo "  → 清理临时文件..." >> "$LOG_FILE"
find /tmp -name "openclaw_*" -mtime +3 -delete 2>/dev/null
find /root/.openclaw/workspace -name "*.tmp" -mtime +1 -delete 2>/dev/null
echo "    临时文件清理完成" >> "$LOG_FILE"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 系统维护任务完成" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"
