#!/bin/bash
set -euo pipefail
# weekly-evolution-report.sh
# 每周一 09:00：汇总上周规则/技能增长、技术债变化、系统演化状态
# 输出到 reports/weekly/

WORKSPACE="/root/.openclaw/workspace"
REPORT_DIR="$WORKSPACE/reports/weekly"
mkdir -p "$REPORT_DIR"

WEEK_START=$(date -d "last monday" '+%Y-%m-%d' 2>/dev/null || date -v-7d '+%Y-%m-%d' 2>/dev/null || date '+%Y-%m-%d')
REPORT="$REPORT_DIR/evolution-weekly-$(date +%Y-%m-%d).md"

cd "$WORKSPACE" || exit 1

# Git stats for last 7 days
GIT_COMMITS=$(git log --since="7 days ago" --oneline 2>/dev/null | wc -l | tr -d ' ')
GIT_FILES_CHANGED=$(git diff --name-only HEAD~${GIT_COMMITS:-0} HEAD 2>/dev/null | wc -l | tr -d ' ' || echo 0)
TOP_AUTHORS=$(git log --since="7 days ago" --format='%an' 2>/dev/null | sort | uniq -c | sort -rn | head -3 | tr '\n' '; ')

# 新增文件统计
NEW_SKILLS=$(git log --since="7 days ago" --name-only --pretty="" 2>/dev/null | grep "skills/" | sort -u | wc -l | tr -d ' ')
NEW_SCRIPTS=$(git log --since="7 days ago" --name-only --pretty="" 2>/dev/null | grep "scripts/" | sort -u | wc -l | tr -d ' ')
NEW_REPORTS=$(find "$WORKSPACE/reports" -name "*.md" -mtime -7 2>/dev/null | wc -l | tr -d ' ')

# 当前状态
TOTAL_CRON=$(crontab -l 2>/dev/null | grep -v '^#' | grep -v '^$' | wc -l | tr -d ' ')
TOTAL_SKILLS=$(find "$WORKSPACE/skills" -name "SKILL.md" 2>/dev/null | wc -l | tr -d ' ')
TOTAL_SCRIPTS=$(find "$WORKSPACE/scripts" -name "*.sh" -o -name "*.js" 2>/dev/null | wc -l | tr -d ' ')
MEMORY_LINES=$(wc -l < "$WORKSPACE/MEMORY.md" 2>/dev/null || echo 0)

cat > "$REPORT" << EOF
# 进化周报 $(date '+%Y-W%V') (截至 $(date '+%Y-%m-%d'))

## 📈 本周增量

| 指标 | 本周新增 |
|------|---------|
| Git 提交 | ${GIT_COMMITS} |
| 变更文件 | ${GIT_FILES_CHANGED} |
| 新增技能文件 | ${NEW_SKILLS} |
| 新增脚本 | ${NEW_SCRIPTS} |
| 新增报告 | ${NEW_REPORTS} |

## 🏗️ 系统当前状态

| 维度 | 数量 |
|------|------|
| Cron 任务 | ${TOTAL_CRON} |
| 技能数量 | ${TOTAL_SKILLS} |
| 脚本数量 | ${TOTAL_SCRIPTS} |
| MEMORY.md 行数 | ${MEMORY_LINES} |

## 🔄 Git 活动摘要

**主要贡献者：** ${TOP_AUTHORS:-无}

**最近提交 (Top 10)：**
$(git log --since="7 days ago" --oneline --no-walk 2>/dev/null | head -10 | sed 's/^/- /' || echo "_无提交记录_")

## 📊 研究信号摘要

本周采集信号文件：$(find "$WORKSPACE/reports/research-signals" -name "*.md" -mtime -7 2>/dev/null | wc -l)/7 天

## ⚡ 下周优先事项

- [ ] 审查本周研究信号，提取规则草稿
- [ ] 检查孤儿任务，推进或关闭
- [ ] 验证 Cron 任务运行日志

---
_由 weekly-evolution-report.sh 自动生成 | $(date '+%Y-%m-%d %H:%M')_
EOF

echo "[$(date '+%Y-%m-%d %H:%M')] weekly-evolution-report: $GIT_COMMITS commits this week → $REPORT"
