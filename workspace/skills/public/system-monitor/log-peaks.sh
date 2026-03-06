#!/bin/bash
# System Monitor Peak Logger - 每小时记录系统资源峰值

OPENCLAW_HOME="${OPENCLAW_HOME:-/root/.openclaw}"
WORKSPACE="${OPENCLAW_WORKSPACE:-$OPENCLAW_HOME/workspace}"

LOG_DIR="$WORKSPACE/logs/system-monitor-peaks"
mkdir -p "$LOG_DIR"

# 当前时间戳
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
DATE=$(date '+%Y%m%d')
HOUR=$(date '+%H')

# 获取峰值数据（从/proc读取，更可靠）
# CPU使用率 - 使用/proc/stat计算，避免top输出格式差异
read -r _ CPU_USER CPU_NICE CPU_SYSTEM CPU_IDLE CPU_IOWAIT CPU_IRQ CPU_SOFTIRQ CPU_STEAL _ < <(grep '^cpu ' /proc/stat)
CPU_ACTIVE=$((CPU_USER + CPU_NICE + CPU_SYSTEM + CPU_IRQ + CPU_SOFTIRQ + CPU_STEAL))
CPU_TOTAL=$((CPU_ACTIVE + CPU_IDLE + CPU_IOWAIT))
if [ "$CPU_TOTAL" -gt 0 ]; then
    CPU_USAGE=$((CPU_ACTIVE * 100 / CPU_TOTAL))
else
    CPU_USAGE=0
fi

# 内存使用 (MB)
MEM_TOTAL=$(free -m | awk 'NR==2{print $2}')
MEM_USED=$(free -m | awk 'NR==2{print $3}')
MEM_PERCENT=$(free | awk 'NR==2{printf "%.1f", $3*100/$2}')

# 负载
LOAD1=$(uptime | awk -F'load average:' '{print $2}' | awk '{print $1}' | tr -d ',')

# 进程数
PROCS=$(ps aux | wc -l)

# 保存小时峰值日志
HOURLY_LOG="$LOG_DIR/hourly-${DATE}.jsonl"
echo "{\"timestamp\":\"$TIMESTAMP\",\"cpu_percent\":$CPU_USAGE,\"mem_used_mb\":$MEM_USED,\"mem_percent\":$MEM_PERCENT,\"load_1min\":$LOAD1,\"procs\":$PROCS}" >> "$HOURLY_LOG"

# 如果是整点，计算并保存过去一小时的峰值
if [ "$HOUR" != "00" ]; then
  PREV_HOUR=$(printf "%02d" $((10#$HOUR - 1)))
  
  # 从atop获取过去一小时峰值（如果atop可用）
  if command -v atop &> /dev/null; then
    ATOP_LOG="/var/log/atop/atop_${DATE}"
    if [ -f "$ATOP_LOG" ]; then
      # 提取上一小时的最大CPU和内存
      PEAK_CPU=$(atop -r "$ATOP_LOG" -b ${PREV_HOUR}:00 -e ${HOUR}:00 2>/dev/null | grep "CPU" | awk '{print $4}' | tr -d '%' | sort -n | tail -1)
      PEAK_MEM=$(atop -r "$ATOP_LOG" -b ${PREV_HOUR}:00 -e ${HOUR}:00 2>/dev/null | grep "MEM" | awk '{print $5}' | sort -n | tail -1)
      
      if [ -n "$PEAK_CPU" ] && [ -n "$PEAK_MEM" ]; then
        PEAK_LOG="$LOG_DIR/daily-peaks-${DATE}.json"
        echo "{\"hour\":\"$PREV_HOUR\",\"peak_cpu\":$PEAK_CPU,\"peak_mem_mb\":$PEAK_MEM,\"recorded_at\":\"$TIMESTAMP\"}" >> "$PEAK_LOG"
      fi
    fi
  fi
fi

# 限制日志文件大小（保留最近30天）
find "$LOG_DIR" -name "*.jsonl" -mtime +30 -delete 2>/dev/null
find "$LOG_DIR" -name "*.json" -mtime +30 -delete 2>/dev/null
