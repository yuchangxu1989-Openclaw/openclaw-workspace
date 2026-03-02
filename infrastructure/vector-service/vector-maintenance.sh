#!/bin/bash
# 向量维护任务 - 每日凌晨2点执行
# 任务名称：向量维护-每日凌晨2点
# 功能：
#   1. 清理孤儿向量（向量存在但源文件不存在）
#   2. 检查缺失的向量化（源文件存在但向量不存在）并自动补全
#   3. 生成维护报告

WORKSPACE="/root/.openclaw/workspace"
VECTOR_SERVICE="$WORKSPACE/infrastructure/vector-service"
LOG_FILE="$VECTOR_SERVICE/logs/vector-maintenance.log"
REPORT_DIR="$VECTOR_SERVICE/reports"
LOCK_FILE="/tmp/vector-maintenance.lock"

# 创建必要目录
mkdir -p "$(dirname "$LOG_FILE")"
mkdir -p "$REPORT_DIR"

# 获取今天的日期
TODAY=$(date +%Y%m%d)
REPORT_FILE="$REPORT_DIR/maintenance-report-${TODAY}.json"
SUMMARY_FILE="$REPORT_DIR/maintenance-summary-${TODAY}.log"

# 防止重复执行（锁机制）
if [ -f "$LOCK_FILE" ]; then
    PID=$(cat "$LOCK_FILE")
    if ps -p "$PID" > /dev/null 2>&1; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] 维护任务正在运行中 (PID: $PID)，跳过本次执行" >> "$LOG_FILE"
        exit 0
    else
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
echo "[$(date '+%Y-%m-%d %H:%M:%S')] ====== 向量维护任务开始 ======" | tee -a "$LOG_FILE" "$SUMMARY_FILE"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] 报告文件: $REPORT_FILE" >> "$LOG_FILE"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] 工作目录: $VECTOR_SERVICE" >> "$LOG_FILE"

cd "$VECTOR_SERVICE"

# ============================================
# 步骤1: 清理孤儿向量
# ============================================
echo "" >> "$SUMMARY_FILE"
echo "🔍 步骤1: 清理孤儿向量" | tee -a "$LOG_FILE" "$SUMMARY_FILE"
echo "----------------------------------------" >> "$SUMMARY_FILE"

ORPHAN_LOG=$(mktemp)
./vectorize.sh --cleanup-orphans --dry-run false 2>&1 | tee "$ORPHAN_LOG" | tee -a "$LOG_FILE" "$SUMMARY_FILE"
ORPHAN_COUNT=$(grep -oP '(?<=共清理 )[0-9]+' "$ORPHAN_LOG" || echo "0")
rm -f "$ORPHAN_LOG"

# ============================================
# 步骤2: 检查并修复缺失向量
# ============================================
echo "" >> "$SUMMARY_FILE"
echo "🔍 步骤2: 检查并修复缺失向量" | tee -a "$LOG_FILE" "$SUMMARY_FILE"
echo "----------------------------------------" >> "$SUMMARY_FILE"

MISSING_LOG=$(mktemp)
./vectorize.sh --check-missing --auto-fix --report "$REPORT_FILE" 2>&1 | tee "$MISSING_LOG" | tee -a "$LOG_FILE" "$SUMMARY_FILE"
MISSING_COUNT=$(grep -oP '(?<=发现 )[0-9]+(?= 个)' "$MISSING_LOG" || echo "0")
FIXED_COUNT=$(grep -oP '(?<=修复 )[0-9]+(?= 个)' "$MISSING_LOG" || echo "0")
rm -f "$MISSING_LOG"

# ============================================
# 步骤3: 生成统计信息
# ============================================
echo "" >> "$SUMMARY_FILE"
echo "📊 步骤3: 生成统计信息" | tee -a "$LOG_FILE" "$SUMMARY_FILE"
echo "----------------------------------------" >> "$SUMMARY_FILE"

# 统计源文件数量
SKILL_COUNT=$(find "$WORKSPACE/skills" -name "SKILL.md" -type f 2>/dev/null | wc -l)
MEMORY_COUNT=$(find "$WORKSPACE/memory" -name "*.md" -type f 2>/dev/null | wc -l)
KNOWLEDGE_COUNT=$(find "$WORKSPACE/knowledge" -name "*.json" -type f 2>/dev/null | wc -l)
AEO_COUNT=$(find "$WORKSPACE/aeo/evaluation-sets" -name "*.json" -type f 2>/dev/null | wc -l)

# 统计向量数量
SKILL_VECTORS=$(ls "$VECTOR_SERVICE/vectors"/skill-*.json 2>/dev/null | wc -l)
MEMORY_VECTORS=$(ls "$VECTOR_SERVICE/vectors"/memory-*.json 2>/dev/null | wc -l)
KNOWLEDGE_VECTORS=$(ls "$VECTOR_SERVICE/vectors"/knowledge-*.json 2>/dev/null | wc -l)
AEO_VECTORS=$(ls "$VECTOR_SERVICE/vectors"/aeo-*.json 2>/dev/null | wc -l)
TOTAL_VECTORS=$(ls "$VECTOR_SERVICE/vectors"/*.json 2>/dev/null | grep -v "index-meta" | grep -v "index.count" | wc -l)

echo "📁 源文件统计:" | tee -a "$LOG_FILE" "$SUMMARY_FILE"
echo "  - 技能文档 (SKILL.md): $SKILL_COUNT" | tee -a "$LOG_FILE" "$SUMMARY_FILE"
echo "  - 记忆文件 (*.md): $MEMORY_COUNT" | tee -a "$LOG_FILE" "$SUMMARY_FILE"
echo "  - 知识文件 (*.json): $KNOWLEDGE_COUNT" | tee -a "$LOG_FILE" "$SUMMARY_FILE"
echo "  - AEO评测用例 (*.json): $AEO_COUNT" | tee -a "$LOG_FILE" "$SUMMARY_FILE"
echo "  - 总计: $((SKILL_COUNT + MEMORY_COUNT + KNOWLEDGE_COUNT + AEO_COUNT))" | tee -a "$LOG_FILE" "$SUMMARY_FILE"

echo "" | tee -a "$LOG_FILE" "$SUMMARY_FILE"
echo "💾 向量统计:" | tee -a "$LOG_FILE" "$SUMMARY_FILE"
echo "  - 技能向量: $SKILL_VECTORS" | tee -a "$LOG_FILE" "$SUMMARY_FILE"
echo "  - 记忆向量: $MEMORY_VECTORS" | tee -a "$LOG_FILE" "$SUMMARY_FILE"
echo "  - 知识向量: $KNOWLEDGE_VECTORS" | tee -a "$LOG_FILE" "$SUMMARY_FILE"
echo "  - AEO向量: $AEO_VECTORS" | tee -a "$LOG_FILE" "$SUMMARY_FILE"
echo "  - 总计: $TOTAL_VECTORS" | tee -a "$LOG_FILE" "$SUMMARY_FILE"

echo "" | tee -a "$LOG_FILE" "$SUMMARY_FILE"
echo "🔧 维护操作统计:" | tee -a "$LOG_FILE" "$SUMMARY_FILE"
echo "  - 清理孤儿向量: $ORPHAN_COUNT" | tee -a "$LOG_FILE" "$SUMMARY_FILE"
echo "  - 发现缺失向量: $MISSING_COUNT" | tee -a "$LOG_FILE" "$SUMMARY_FILE"
echo "  - 修复缺失向量: $FIXED_COUNT" | tee -a "$LOG_FILE" "$SUMMARY_FILE"

# 计算覆盖率
SOURCE_TOTAL=$((SKILL_COUNT + MEMORY_COUNT + KNOWLEDGE_COUNT + AEO_COUNT))
COVERAGE=0
if [ $SOURCE_TOTAL -gt 0 ]; then
    COVERAGE=$((TOTAL_VECTORS * 100 / SOURCE_TOTAL))
fi
echo "  - 向量化覆盖率: ${COVERAGE}%" | tee -a "$LOG_FILE" "$SUMMARY_FILE"

# ============================================
# 步骤4: 更新维护报告
# ============================================
echo "" >> "$SUMMARY_FILE"
echo "📝 步骤4: 更新维护报告" | tee -a "$LOG_FILE" "$SUMMARY_FILE"
echo "----------------------------------------" >> "$SUMMARY_FILE"

# 生成JSON格式的维护报告
MAINTENANCE_REPORT=$(cat <<EOF
{
  "maintenance_date": "$(date -Iseconds)",
  "task_name": "向量维护-每日凌晨2点",
  "statistics": {
    "source_files": {
      "skills": $SKILL_COUNT,
      "memory": $MEMORY_COUNT,
      "knowledge": $KNOWLEDGE_COUNT,
      "aeo": $AEO_COUNT,
      "total": $SOURCE_TOTAL
    },
    "vectors": {
      "skills": $SKILL_VECTORS,
      "memory": $MEMORY_VECTORS,
      "knowledge": $KNOWLEDGE_VECTORS,
      "aeo": $AEO_VECTORS,
      "total": $TOTAL_VECTORS
    },
    "maintenance": {
      "orphans_cleaned": $ORPHAN_COUNT,
      "missing_found": $MISSING_COUNT,
      "missing_fixed": $FIXED_COUNT,
      "coverage_percent": $COVERAGE
    }
  },
  "status": "success",
  "log_file": "$LOG_FILE",
  "summary_file": "$SUMMARY_FILE"
}
EOF
)

# 保存完整报告
echo "$MAINTENANCE_REPORT" > "$REPORT_DIR/maintenance-report-${TODAY}.json"
echo "✅ 报告已保存: $REPORT_DIR/maintenance-report-${TODAY}.json" | tee -a "$LOG_FILE" "$SUMMARY_FILE"

# ============================================
# 步骤5: 清理旧报告（保留30天）
# ============================================
echo "" >> "$SUMMARY_FILE"
echo "🧹 步骤5: 清理旧报告" | tee -a "$LOG_FILE" "$SUMMARY_FILE"
echo "----------------------------------------" >> "$SUMMARY_FILE"

DELETED_COUNT=0
for old_file in "$REPORT_DIR"/maintenance-report-*.json "$REPORT_DIR"/maintenance-summary-*.log; do
    [ -f "$old_file" ] || continue
    file_date=$(basename "$old_file" | grep -oP '\d{8}' || echo "")
    if [ -n "$file_date" ]; then
        file_epoch=$(date -d "${file_date:0:4}-${file_date:4:2}-${file_date:6:2}" +%s 2>/dev/null || echo "0")
        current_epoch=$(date +%s)
        days_old=$(( (current_epoch - file_epoch) / 86400 ))
        if [ $days_old -gt 30 ]; then
            rm -f "$old_file"
            DELETED_COUNT=$((DELETED_COUNT + 1))
            echo "  删除旧报告: $(basename "$old_file") (${days_old}天前)" >> "$LOG_FILE"
        fi
    fi
done
echo "  已清理 $DELETED_COUNT 个旧报告" | tee -a "$LOG_FILE" "$SUMMARY_FILE"

# ============================================
# 记录结束
# ============================================
echo "" | tee -a "$LOG_FILE" "$SUMMARY_FILE"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] ====== 向量维护任务完成 ======" | tee -a "$LOG_FILE" "$SUMMARY_FILE"
echo "" >> "$LOG_FILE"
echo "" >> "$SUMMARY_FILE"

# 输出摘要到stdout
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 向量维护任务完成摘要"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "任务时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "报告文件: $REPORT_DIR/maintenance-report-${TODAY}.json"
echo "日志文件: $LOG_FILE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "源文件总数: $SOURCE_TOTAL"
echo "向量总数: $TOTAL_VECTORS"
echo "覆盖率: ${COVERAGE}%"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "本次维护操作:"
echo "  - 清理孤儿向量: $ORPHAN_COUNT"
echo "  - 修复缺失向量: $FIXED_COUNT"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

exit 0
