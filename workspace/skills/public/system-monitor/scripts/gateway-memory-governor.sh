#!/bin/bash
# gateway-memory-governor.sh - Gateway内存外部治理脚本
# 部署位置: /root/.openclaw/workspace/scripts/gateway-memory-governor.sh
# 执行频率: 每5分钟通过Cron执行

LOG_FILE="/root/.openclaw/workspace/logs/gateway-memory-governor.log"
ALERT_WEBHOOK=""  # 可选：飞书Webhook地址

# 阈值设置（MB）
WARNING_THRESHOLD=800      # 800MB告警
CRITICAL_THRESHOLD=1000    # 1GB强制重启
MAX_THRESHOLD=1200         # 1.2GB绝对上限

# 获取Gateway PID和内存
get_gateway_info() {
    PID=$(pgrep -f "openclaw-gateway" | head -1)
    if [ -z "$PID" ]; then
        echo "Gateway未运行"
        return 1
    fi
    
    RSS_KB=$(cat /proc/$PID/status 2>/dev/null | grep VmRSS | awk '{print $2}')
    RSS_MB=$((RSS_KB / 1024))
    
    echo "$PID $RSS_MB"
}

# 发送告警
send_alert() {
    local level=$1
    local message=$2
    
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [$level] $message" >> $LOG_FILE
    
    # 如果有配置Webhook，发送飞书通知
    if [ -n "$ALERT_WEBHOOK" ] && [ "$level" == "CRITICAL" ]; then
        curl -s -X POST "$ALERT_WEBHOOK" \
            -H "Content-Type: application/json" \
            -d "{\"msg_type\":\"text\",\"content\":{\"text\":\"🚨 Gateway内存告警\\n$message\"}}" \
            > /dev/null 2>&1
    fi
}

# 优雅重启Gateway
graceful_restart() {
    local reason=$1
    
    send_alert "CRITICAL" "执行优雅重启: $reason"
    
    PID=$(pgrep -f "openclaw-gateway" | head -1)
    if [ -n "$PID" ]; then
        # 发送TERM信号，等待 graceful shutdown
        kill -TERM $PID
        
        # 等待最多10秒
        for i in {1..10}; do
            if ! kill -0 $PID 2>/dev/null; then
                echo "Gateway已停止" >> $LOG_FILE
                break
            fi
            sleep 1
        done
        
        # 强制kill如果还在
        if kill -0 $PID 2>/dev/null; then
            kill -9 $PID
            echo "强制终止Gateway" >> $LOG_FILE
        fi
    fi
    
    # 重启Gateway
    sleep 2
    openclaw-gateway &
    
    # 验证启动
    sleep 3
    NEW_PID=$(pgrep -f "openclaw-gateway" | head -1)
    if [ -n "$NEW_PID" ]; then
        send_alert "INFO" "Gateway重启成功，新PID: $NEW_PID"
    else
        send_alert "CRITICAL" "Gateway重启失败！"
    fi
}

# 主检查逻辑
main() {
    mkdir -p $(dirname $LOG_FILE)
    
    INFO=$(get_gateway_info)
    if [ $? -ne 0 ]; then
        echo "$INFO" >> $LOG_FILE
        exit 1
    fi
    
    PID=$(echo $INFO | cut -d' ' -f1)
    RSS_MB=$(echo $INFO | cut -d' ' -f2)
    
    # 记录当前状态
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Gateway PID: $PID, 内存: ${RSS_MB}MB" >> $LOG_FILE
    
    # 判断阈值
    if [ "$RSS_MB" -gt "$MAX_THRESHOLD" ]; then
        send_alert "CRITICAL" "内存超过绝对上限(${RSS_MB}MB > ${MAX_THRESHOLD}MB)，立即重启！"
        graceful_restart "内存超过${MAX_THRESHOLD}MB"
        
    elif [ "$RSS_MB" -gt "$CRITICAL_THRESHOLD" ]; then
        send_alert "CRITICAL" "内存超过危险线(${RSS_MB}MB > ${CRITICAL_THRESHOLD}MB)"
        graceful_restart "内存超过${CRITICAL_THRESHOLD}MB"
        
    elif [ "$RSS_MB" -gt "$WARNING_THRESHOLD" ]; then
        send_alert "WARNING" "内存超过告警线(${RSS_MB}MB > ${WARNING_THRESHOLD}MB)"
        # 尝试触发GC（如果Node支持）
        kill -USR1 $PID 2>/dev/null || true
        
    else
        echo "  内存正常: ${RSS_MB}MB" >> $LOG_FILE
    fi
}

main
