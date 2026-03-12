#!/bin/bash
set -euo pipefail
# weekly-evolution-report.sh
# 每周：汇总上周代码与自演进指标，输出结构化周报

WORKSPACE="/root/.openclaw/workspace"
cd "$WORKSPACE" || exit 1

export TZ="Asia/Shanghai"

YEAR_WEEK="$(date '+%Y-W%V')"
WEEK_START="$(date -d 'last monday' '+%Y-%m-%d' 2>/dev/null || date -v-7d '+%Y-%m-%d' 2>/dev/null || date '+%Y-%m-%d')"
WEEK_END="$(date '+%Y-%m-%d')"

REPORT_DIR="$WORKSPACE/reports/evolution"
mkdir -p "$REPORT_DIR"
REPORT="$REPORT_DIR/weekly-${YEAR_WEEK}.md"

# -----------------------------
# 本周代码变更统计
# -----------------------------
GIT_COMMITS="$(git log --since='7 days ago' --oneline 2>/dev/null | wc -l | tr -d ' ')"
GIT_ADDED="$(git log --since='7 days ago' --numstat --pretty=tformat: 2>/dev/null | awk '{a+=$1} END {print a+0}')"
GIT_DELETED="$(git log --since='7 days ago' --numstat --pretty=tformat: 2>/dev/null | awk '{d+=$2} END {print d+0}')"
GIT_FILES_MODIFIED="$(git log --since='7 days ago' --name-only --pretty=tformat: 2>/dev/null | sed '/^$/d' | sort -u | wc -l | tr -d ' ')"

# 本周修复问题数（commit message 匹配 fix）
FIX_COUNT="$(git log --since='7 days ago' --pretty='%s' 2>/dev/null | grep -Eic '(^|[^a-zA-Z])(fix|bugfix|hotfix|修复)([^a-zA-Z]|$)' || true)"
FIX_COUNT="${FIX_COUNT:-0}"

# -----------------------------
# self-evolving 指标变化
# -----------------------------
count_skills() {
  find "$WORKSPACE/skills" -name 'SKILL.md' 2>/dev/null | wc -l | tr -d ' '
}

count_rules() {
  find "$WORKSPACE" \( -path '*/rules/*' -o -path '*/.cursor/rules/*' -o -path '*/.windsurf/rules/*' \) -type f 2>/dev/null | wc -l | tr -d ' '
}

count_eval_coverage() {
  local total passed
  total="$(find "$WORKSPACE/reports/evals" -name '*.md' 2>/dev/null | wc -l | tr -d ' ')"
  if [[ "$total" == "0" ]]; then
    echo "0"
    return
  fi
  passed="$(grep -RihE 'pass|通过|成功' "$WORKSPACE/reports/evals" --include='*.md' 2>/dev/null | wc -l | tr -d ' ')"
  awk -v p="$passed" -v t="$total" 'BEGIN { if (t==0) print 0; else printf "%.1f", (p/t)*100 }'
}

SKILLS_NOW="$(count_skills)"
RULES_NOW="$(count_rules)"
EVAL_COVERAGE_NOW="$(count_eval_coverage)"

SKILLS_7D_DELTA="$(git log --since='7 days ago' --name-status --pretty=tformat: 2>/dev/null | awk '$1=="A" && $2 ~ /skills\/.*SKILL\.md$/ {c++} END {print c+0}')"
RULES_7D_DELTA="$(git log --since='7 days ago' --name-status --pretty=tformat: 2>/dev/null | awk '$1=="A" && $2 ~ /rules\// {c++} END {print c+0}')"

# -----------------------------
# 上周行动闭环（检查上周建议执行）
# -----------------------------
PREV_REPORT="$(ls -1 "$REPORT_DIR"/weekly-*.md 2>/dev/null | sort | tail -2 | head -1 || true)"
ACTION_CLOSURE="无上周周报，无法自动检查"

if [[ -n "$PREV_REPORT" && -f "$PREV_REPORT" ]]; then
  PREV_ACTIONS_TOTAL="$(grep -Ec '^- \[ \]' "$PREV_REPORT" || true)"
  PREV_ACTIONS_DONE="$(grep -Ec '^- \[x\]|^- \[X\]' "$PREV_REPORT" || true)"
  PREV_ACTIONS_TOTAL="${PREV_ACTIONS_TOTAL:-0}"
  PREV_ACTIONS_DONE="${PREV_ACTIONS_DONE:-0}"
  ACTION_CLOSURE="上周待办 ${PREV_ACTIONS_TOTAL} 项，已勾选完成 ${PREV_ACTIONS_DONE} 项"
fi

# -----------------------------
# ROI（启发式）
# -----------------------------
VALUE_SIGNALS="$(git log --since='7 days ago' --pretty='%s' 2>/dev/null | grep -Eic '(fix|perf|optimi|stabil|reliab|自动化|效率|降本|提效)' || true)"
WASTE_SIGNALS="$(git log --since='7 days ago' --pretty='%s' 2>/dev/null | grep -Eic '(wip|tmp|revert|test only|尝试|临时)' || true)"
VALUE_SIGNALS="${VALUE_SIGNALS:-0}"
WASTE_SIGNALS="${WASTE_SIGNALS:-0}"

cat > "$REPORT" <<EOF
# Evolution Weekly Report ${YEAR_WEEK}

- 周期：${WEEK_START} ~ ${WEEK_END}
- 时区：Asia/Shanghai

## 1) 本周新增 / 删除 / 修改（Git 统计）

| 指标 | 数值 |
|---|---:|
| 提交数 | ${GIT_COMMITS} |
| 新增行数 | ${GIT_ADDED} |
| 删除行数 | ${GIT_DELETED} |
| 涉及文件数（去重） | ${GIT_FILES_MODIFIED} |

## 2) 本周修复问题数

- 依据 commit message 匹配 fix/bugfix/hotfix/修复：**${FIX_COUNT}**

## 3) self-evolving 指标变化

| 指标 | 当前值 | 近7天变化 |
|---|---:|---:|
| 技能数（SKILL.md） | ${SKILLS_NOW} | +${SKILLS_7D_DELTA} |
| 规则数（rules目录） | ${RULES_NOW} | +${RULES_7D_DELTA} |
| 评测覆盖率（启发式） | ${EVAL_COVERAGE_NOW}% | n/a |

## 4) ROI：哪些有价值，哪些浪费

- 有价值信号（fix/perf/自动化/提效等关键词）提交数：**${VALUE_SIGNALS}**
- 浪费信号（wip/tmp/revert/临时尝试等关键词）提交数：**${WASTE_SIGNALS}**
- 结论：
  - 若有价值信号 > 浪费信号：本周投入整体偏正向。
  - 若有价值信号 ≤ 浪费信号：建议下周减少临时性改动，增加可复用沉淀。

## 5) 行动闭环（上周建议执行情况）

- ${ACTION_CLOSURE}

## 6) 下周重点

- [ ] 聚焦高ROI事项：稳定性修复、自动化提效、可复用规则沉淀
- [ ] 将“临时/WIP”类改动收敛为明确任务并闭环
- [ ] 提升评测覆盖率口径准确性并持续追踪

---
_自动生成：weekly-evolution-report.sh | $(date '+%Y-%m-%d %H:%M:%S')_
EOF

echo "[$(date '+%Y-%m-%d %H:%M:%S')] weekly-evolution-report generated: $REPORT"
