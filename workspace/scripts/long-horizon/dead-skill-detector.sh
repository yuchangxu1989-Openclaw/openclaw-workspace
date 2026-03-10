#!/bin/bash
# dead-skill-detector.sh
# 检测从未被引用/调用的技能文件，输出待归档候选
# 每周六 10:00 运行

WORKSPACE="/root/.openclaw/workspace"
REPORT_DIR="$WORKSPACE/reports/weekly"
REPORT="$REPORT_DIR/dead-skill-report-$(date +%Y-%m-%d).md"
mkdir -p "$REPORT_DIR"

echo "# 死亡技能检测报告 $(date '+%Y-%m-%d')" > "$REPORT"
echo "" >> "$REPORT"
echo "## 扫描范围：skills/ 目录" >> "$REPORT"
echo "" >> "$REPORT"

DEAD_COUNT=0
SKILL_DIR="$WORKSPACE/skills"

if [ ! -d "$SKILL_DIR" ]; then
  echo "_skills/ 目录不存在_" >> "$REPORT"
  exit 0
fi

echo "| 技能文件 | 最后修改 | 天数 | 引用次数 |" >> "$REPORT"
echo "|----------|----------|------|----------|" >> "$REPORT"

find "$SKILL_DIR" -name "SKILL.md" 2>/dev/null | while read skillfile; do
  SKILL_NAME=$(basename $(dirname "$skillfile"))
  MOD_DATE=$(stat -c '%y' "$skillfile" 2>/dev/null | cut -d' ' -f1)
  MOD_TS=$(stat -c %Y "$skillfile" 2>/dev/null || echo 0)
  AGE_DAYS=$(( ($(date +%s) - MOD_TS) / 86400 ))
  
  # 统计引用次数 (在其他文件中被import/use的次数)
  REF_COUNT=$(grep -r "$SKILL_NAME" "$WORKSPACE" \
    --include="*.md" --include="*.json" --include="*.js" \
    --exclude-dir=node_modules --exclude-dir=.git \
    --exclude-dir=infrastructure --exclude-dir=logs \
    --exclude-dir=reports --exclude-dir=archive \
    -l 2>/dev/null | grep -v "$skillfile" | wc -l)
  
  if [ $AGE_DAYS -gt 30 ] && [ $REF_COUNT -lt 2 ]; then
    echo "| $SKILL_NAME | $MOD_DATE | ${AGE_DAYS}d | $REF_COUNT |" >> "$REPORT"
    DEAD_COUNT=$((DEAD_COUNT + 1))
  fi
done

echo "" >> "$REPORT"
echo "**检测完成。** 建议归档候选数量见表格。" >> "$REPORT"
echo "" >> "$REPORT"
echo "_由 dead-skill-detector.sh 自动生成_" >> "$REPORT"

echo "[$(date '+%Y-%m-%d %H:%M')] dead-skill-detector done → $REPORT"
