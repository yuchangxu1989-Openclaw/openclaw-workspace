#!/bin/bash
# Gateway 内存监控增强脚本 v2.0
# 功能: 监控内存使用，分级告警

set -e

# 阈值配置 (MB)
WARN_THRESHOLD=1200    # 警告阈值 1.2GB
CRITICAL_THRESHOLD=1500 # 重启阈值 1.5GB
MAX_THRESHOLD=1800     # 紧急阈值 1.8GB

# 获取 Gateway PID 和内存使用
PID=$(pgrep -f "openclaw-gateway" | head -1)
if [ -z "$PID" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ❌ Gateway 未运行"
    exit 1
fi

# 获取内存使用 (RSS in KB)
MEM_KB=$(cat /proc/$PID/status 2>/dev/null | grep VmRSS | awk '{print $2}' || echo "0")
MEM_MB=$((MEM_KB / 1024))

# 获取内存百分比
TOTAL_MEM=$(free -m | awk '/^Mem:/{print $2}')
MEM_PERCENT=$((MEM_MB * 100 / TOTAL_MEM))

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Gateway 内存监控"
echo "  PID: $PID"
echo "  内存使用: ${MEM_MB}MB (${MEM_PERCENT}%)"
echo "  总内存: ${TOTAL_MEM}MB"
echo ""

# 分级处理
if [ $MEM_MB -ge $MAX_THRESHOLD ]; then
    echo "🚨 紧急: 内存使用超过 ${MAX_THRESHOLD}MB!"
    echo "   执行紧急重启..."
    kill -9 $PID 2>/dev/null || true
    sleep 2
    # 尝试自动重启 (如果配置了systemd)
    systemctl restart openclaw 2>/dev/null || echo "请手动重启 Gateway"
    exit 2
    
elif [ $MEM_MB -ge $CRITICAL_THRESHOLD ]; then
    echo "⚠️  严重: 内存使用超过 ${CRITICAL_THRESHOLD}MB"
    echo "   正在优雅重启 Gateway..."
    kill -TERM $PID 2>/dev/null || true
    sleep 5
    # 检查是否已停止
    if pgrep -f "openclaw-gateway" > /dev/null; then
        echo "   强制终止..."
        kill -9 $PID 2>/dev/null || true
    fi
    echo "   ✅ 已发送重启信号"
    exit 1
    
elif [ $MEM_MB -ge $WARN_THRESHOLD ]; then
    echo "⚡ 警告: 内存使用超过 ${WARN_THRESHOLD}MB"
    echo "   建议: 考虑重启 Gateway 或检查会话文件"
    echo "   当前会话文件数: $(ls /root/.openclaw/agents/main/sessions/*.jsonl 2>/dev/null | wc -l)"
    echo "   当前会话总大小: $(du -sh /root/.openclaw/agents/main/sessions/ 2>/dev/null | cut -f1)"
    
    # 自动清理旧会话 (超过3天)
    OLD_COUNT=$(find /root/.openclaw/agents/main/sessions -name "*.jsonl" -mtime +3 -type f ! -name "7eea85ef*.jsonl" 2>/dev/null | wc -l)
    if [ $OLD_COUNT -gt 0 ]; then
        echo "   发现 $OLD_COUNT 个超过3天的旧会话，自动清理..."
        find /root/.openclaw/agents/main/sessions -name "*.jsonl" -mtime +3 -type f ! -name "7eea85ef*.jsonl" -delete 2>/dev/null || true
        echo "   ✅ 清理完成"
    fi
    exit 0
    
else
    echo "✅ 内存使用正常 (${MEM_MB}MB)"
    exit 0
fi
