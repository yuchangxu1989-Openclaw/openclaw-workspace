#!/bin/bash
# session-cleanup-governor.sh - 会话文件治理脚本
# 部署位置: /root/.openclaw/workspace/scripts/session-cleanup-governor.sh
# 执行频率: 每2小时通过Cron执行

SESSION_DIR="/root/.openclaw/agents/main/sessions"
LOG_FILE="/root/.openclaw/workspace/logs/session-cleanup.log"
RETAIN_COUNT=30          # 保留最近30个会话
MAX_SIZE_MB=5            # 单会话文件超过5MB告警
MAX_AGE_HOURS=24         # 超过24小时的子Agent会话清理

# 创建日志目录
mkdir -p $(dirname $LOG_FILE)

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 开始会话文件治理" >> $LOG_FILE

# 1. 清理旧会话（保留最近N个）
BEFORE_COUNT=$(ls -1 $SESSION_DIR/*.jsonl 2>/dev/null | wc -l)
ls -t $SESSION_DIR/*.jsonl 2>/dev/null | tail -n +$((RETAIN_COUNT + 1)) | while read file; do
    # 检查是否是活跃的飞书主会话（保留）
    if [[ "$file" == *"7eea85ef-e9cd-4351-8f4f-d97d4a94ebc5"* ]]; then
        echo "  跳过主会话: $file" >> $LOG_FILE
        continue
    fi
    
    # 归档到压缩存储
    mkdir -p /data/archive/sessions/$(date +%Y%m)
    gzip -c "$file" > "/data/archive/sessions/$(date +%Y%m)/$(basename $file).gz" 2>/dev/null
    rm -f "$file"
    echo "  归档并删除: $file" >> $LOG_FILE
done

AFTER_COUNT=$(ls -1 $SESSION_DIR/*.jsonl 2>/dev/null | wc -l)
DELETED=$((BEFORE_COUNT - AFTER_COUNT))
echo "  会话清理: $BEFORE_COUNT -> $AFTER_COUNT (删除$DELETED个)" >> $LOG_FILE

# 2. 检查大会话文件（>5MB告警）
find $SESSION_DIR -name "*.jsonl" -size +${MAX_SIZE_MB}M 2>/dev/null | while read file; do
    SIZE=$(du -m "$file" | cut -f1)
    echo "  [告警] 大会话文件: $file (${SIZE}MB)" >> $LOG_FILE
    # TODO: 发送飞书告警通知
    
    # 尝试分片处理（保留最近1000条）
    if [[ "$SIZE" -gt 10 ]]; then
        echo "    执行分片..." >> $LOG_FILE
        tail -n 1000 "$file" > "${file}.tmp" && mv "${file}.tmp" "$file"
    fi
done

# 3. 清理子Agent僵尸会话（>30分钟无更新）
find $SESSION_DIR -name "*.jsonl" -mmin +30 2>/dev/null | while read file; do
    # 检查是否是子Agent会话（包含subagent标识）
    if [[ "$file" == *"subagent"* ]]; then
        rm -f "$file"
        echo "  清理僵尸子Agent会话: $file" >> $LOG_FILE
    fi
done

# 4. 统计报告
echo "[$(date '+%Y-%m-%d %H:%M:%S')] 治理完成" >> $LOG_FILE
echo "  当前会话数: $(ls -1 $SESSION_DIR/*.jsonl 2>/dev/null | wc -l)" >> $LOG_FILE
echo "  归档存储: $(du -sh /data/archive/sessions 2>/dev/null | cut -f1)" >> $LOG_FILE
echo "" >> $LOG_FILE
