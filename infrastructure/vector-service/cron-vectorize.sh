#!/bin/bash
# 统一向量化定时任务 - 每6小时执行
# 此脚本由crontab调用，一次性完成所有向量化任务

WORKSPACE="/root/.openclaw/workspace"
VECTOR_SERVICE="$WORKSPACE/infrastructure/vector-service"
LOG_FILE="$VECTOR_SERVICE/logs/cron-vectorization.log"
LOCK_FILE="/tmp/vectorization.lock"

# 确保日志目录存在
mkdir -p "$(dirname "$LOG_FILE")"

# 防止重复执行（锁机制）
if [ -f "$LOCK_FILE" ]; then
    PID=$(cat "$LOCK_FILE")
    if ps -p "$PID" > /dev/null 2>&1; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] 向量化任务正在运行中 (PID: $PID)，跳过本次执行" >> "$LOG_FILE"
        exit 0
    else
        # 锁文件残留，删除
        rm -f "$LOCK_FILE"
    fi
fi

# 创建锁文件
echo $$ > "$LOCK_FILE"

# 清理函数
cleanup() {
    rm -f "$LOCK_FILE"
}
trap cleanup EXIT

# 记录开始
echo "[$(date '+%Y-%m-%d %H:%M:%S')] ====== 定时向量化任务开始 ======" >> "$LOG_FILE"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] 工作目录: $WORKSPACE" >> "$LOG_FILE"

# 统计源文件数量
echo "[$(date '+%Y-%m-%d %H:%M:%S')] 扫描源文件..." >> "$LOG_FILE"
SKILL_COUNT=$(find "$WORKSPACE/skills" -name "SKILL.md" -type f 2>/dev/null | wc -l)
MEMORY_COUNT=$(find "$WORKSPACE/memory" -name "*.md" -type f 2>/dev/null | wc -l)
KNOWLEDGE_COUNT=$(find "$WORKSPACE/knowledge" -name "*.json" -type f 2>/dev/null | wc -l)
AEO_COUNT=$(find "$WORKSPACE/aeo/evaluation-sets" -name "*.json" -type f 2>/dev/null | wc -l)

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 源文件统计:" >> "$LOG_FILE"
echo "  - 技能文档 (SKILL.md): $SKILL_COUNT" >> "$LOG_FILE"
echo "  - 记忆文件 (*.md): $MEMORY_COUNT" >> "$LOG_FILE"
echo "  - 知识文件 (*.json): $KNOWLEDGE_COUNT" >> "$LOG_FILE"
echo "  - AEO评测用例 (*.json): $AEO_COUNT" >> "$LOG_FILE"

# 执行向量化
echo "[$(date '+%Y-%m-%d %H:%M:%S')] 开始执行向量化..." >> "$LOG_FILE"
cd "$VECTOR_SERVICE"

# 调用主向量化脚本
./vectorize.sh >> "$LOG_FILE" 2>&1
EXIT_CODE=$?

# 检查结果
if [ $EXIT_CODE -eq 0 ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✅ 向量化任务成功完成" >> "$LOG_FILE"
else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ⚠️ 向量化任务部分失败 (exit code: $EXIT_CODE)" >> "$LOG_FILE"
fi

# 更新向量统计
VECTOR_COUNT=$(ls "$VECTOR_SERVICE/vectors"/*.json 2>/dev/null | wc -l)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] 当前向量总数: $VECTOR_COUNT" >> "$LOG_FILE"

# 记录结束
echo "[$(date '+%Y-%m-%d %H:%M:%S')] ====== 定时向量化任务结束 ======" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"

exit $EXIT_CODE
