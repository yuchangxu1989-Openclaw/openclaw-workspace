#!/bin/bash
# 技能使用审计脚本 - 区分任务与技能
# 技能 = 能力资产, 任务 = 调度执行

set -e

echo "=========================================="
echo "技能使用审计报告 - $(date '+%Y-%m-%d %H:%M:%S')"
echo "=========================================="
echo ""
echo "📌 概念区分:"
echo "   技能 = 能力资产 (代码/文档/配置)"
echo "   任务 = 调度执行 (cron定时调用)"
echo ""

cd /root/.openclaw/workspace/skills

echo "📊 扫描所有技能资产..."
echo ""

# 统计
TOTAL=0
HEALTHY=0
WARNING=0
IDLE=0

echo "技能资产状态:"
echo "------------------------------------------"
echo "技能名                       | 任务数 | 最近更新 | 状态"
echo "------------------------------------------"

for skill in */; do
    skill=${skill%/}
    TOTAL=$((TOTAL + 1))
    
    # 检查关联任务数（cron中引用该技能）
    task_count=$(grep -r "$skill" /root/.openclaw/cron/ 2>/dev/null | wc -l)
    task_count=${task_count:-0}
    
    # 检查技能最近更新时间
    if [ -d "$skill" ]; then
        update_count=$(find "$skill" -type f -mtime -7 2>/dev/null | wc -l)
        update_count=${update_count:-0}
    else
        update_count=0
    fi
    
    # 判断技能健康状态
    # 健康 = 有任务调用 或 近期有更新
    # 警告 = 无任务调用且无更新
    status="健康"
    if [ "$task_count" -eq 0 ] && [ "$update_count" -eq 0 ]; then
        status="⚠️ 闲置"
        WARNING=$((WARNING + 1))
    elif [ "$task_count" -gt 0 ]; then
        status="✅ 活跃"
        HEALTHY=$((HEALTHY + 1))
    else
        status="⏸️ 维护中"
        IDLE=$((IDLE + 1))
    fi
    
    printf "%-30s | %-6s | %-8s | %s\n" \
        "$skill" "$task_count" "$update_count" "$status"
done

echo "------------------------------------------"
echo ""
echo "📈 技能资产统计:"
echo "  总计技能: $TOTAL"
echo "  活跃技能: $HEALTHY (有任务调用)"
echo "  维护中:   $IDLE (近期更新但无任务)"
echo "  闲置技能: $WARNING (无任务无更新)"
echo ""
echo "💡 说明:"
echo "  - 技能是能力资产，任务是调度执行"
echo "  - 健康技能 = 被任务调用 或 近期维护"
echo "  - 闲置技能 = 建议评估是否需要保留"
echo ""
echo "=========================================="
