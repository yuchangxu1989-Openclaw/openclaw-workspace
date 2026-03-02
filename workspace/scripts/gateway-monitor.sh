#!/bin/bash
# Gateway内存监控与自动重启
# 每30分钟检查一次

LOG_FILE="/root/.openclaw/workspace/logs/gateway-monitor.log"
mkdir -p /root/.openclaw/workspace/logs

# 配置
MEMORY_THRESHOLD_MB=1200    # 内存阈值1.2GB
RESTART_THRESHOLD_MB=1500   # 强制重启阈值1.5GB

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Gateway监控检查" >> "$LOG_FILE"

# 获取Gateway PID和内存
GATEWAY_PID=$(pgrep -f "openclaw-gateway" | head -1)

if [ -z "$GATEWAY_PID" ]; then
    echo "  Gateway未运行，无需监控" >> "$LOG_FILE"
    exit 0
fi

MEMORY_KB=$(ps -p $GATEWAY_PID -o rss= 2>/dev/null | tr -d ' ')
MEMORY_MB=$((MEMORY_KB / 1024))

echo "  PID: $GATEWAY_PID, 内存: ${MEMORY_MB}MB" >> "$LOG_FILE"

# 检查是否超过强制重启阈值
if [ "$MEMORY_MB" -gt "$RESTART_THRESHOLD_MB" ]; then
    echo "  🚨 内存超过${RESTART_THRESHOLD_MB}MB，执行强制重启..." >> "$LOG_FILE"
    
    # 优雅重启
    kill -TERM $GATEWAY_PID
    sleep 5
    
    # 检查是否已停止
    if ps -p $GATEWAY_PID > /dev/null 2>&1; then
        kill -KILL $GATEWAY_PID 2>/dev/null
    fi
    
    # 启动新实例
    openclaw-gateway &
    
    echo "  ✅ Gateway已重启" >> "$LOG_FILE"
    
    # 发送告警通知
    echo "[ALERT] Gateway内存超限已自动重启: ${MEMORY_MB}MB" > /tmp/gateway-restart-alert
    
# 检查是否超过警告阈值
elif [ "$MEMORY_MB" -gt "$MEMORY_THRESHOLD_MB" ]; then
    echo "  ⚠️ 内存超过${MEMORY_THRESHOLD_MB}MB，建议重启" >> "$LOG_FILE"
    echo "[WARNING] Gateway内存过高: ${MEMORY_MB}MB，建议重启" > /tmp/gateway-warning
else
    echo "  ✅ 内存正常" >> "$LOG_FILE"
fi
