#!/usr/bin/env bash
# Handler: rule.project-artifact-gate-001 — 项目产物沉淀门禁
# Priority: P0 (block) | Domain: project-mgmt | Scope: artifact
# Trigger events: task.status.completed, task.status.done, subtask.status.completed, sprint.day.completed
#
# 任何任务标记完成前，必须验证可交付产物已沉淀。
# 无产物 = 未完成，禁止空标 completed。

set -euo pipefail

RULE_ID="rule.project-artifact-gate-001"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
TRACKER="$PROJECT_ROOT/PROJECT-TRACKER.md"

# --- Input ---
EVENT="${1:-}"          # e.g. task.status.completed
TASK_ID="${2:-}"        # task identifier
ARTIFACT_PATH="${3:-}"  # path to claimed artifact (file or directory)

if [[ -z "$EVENT" || -z "$TASK_ID" ]]; then
  echo "[$RULE_ID] ERROR: Usage: $0 <event> <task_id> [artifact_path]"
  exit 1
fi

echo "[$RULE_ID] Gate check triggered by event=$EVENT task=$TASK_ID"

FAILURES=()
WARNINGS=()

# --- Check 1: artifact_exists ---
if [[ -z "$ARTIFACT_PATH" ]]; then
  FAILURES+=("artifact_exists: 未提供产物路径，任务无关联产物")
elif [[ ! -e "$PROJECT_ROOT/$ARTIFACT_PATH" && ! -e "$ARTIFACT_PATH" ]]; then
  FAILURES+=("artifact_exists: 产物不存在 → $ARTIFACT_PATH")
fi

# --- Check 2: artifact_not_empty ---
resolve_path() {
  if [[ -e "$PROJECT_ROOT/$1" ]]; then echo "$PROJECT_ROOT/$1"
  elif [[ -e "$1" ]]; then echo "$1"
  else echo ""; fi
}

if [[ -n "$ARTIFACT_PATH" ]]; then
  RESOLVED="$(resolve_path "$ARTIFACT_PATH")"
  if [[ -n "$RESOLVED" ]]; then
    if [[ -f "$RESOLVED" ]]; then
      FILE_SIZE=$(wc -c < "$RESOLVED")
      if (( FILE_SIZE <= 200 )); then
        FAILURES+=("artifact_not_empty: 产物文件过小 (${FILE_SIZE}B ≤ 200B)，疑似占位模板")
      fi
      # Check if file is just headings (skeleton)
      NON_HEADING_LINES=$(grep -cvE '^(#|$|\s*$)' "$RESOLVED" 2>/dev/null || echo "0")
      if (( NON_HEADING_LINES == 0 )); then
        FAILURES+=("artifact_not_empty: 产物仅含标题/空行，无实质内容")
      fi
    elif [[ -d "$RESOLVED" ]]; then
      FILE_COUNT=$(find "$RESOLVED" -type f | wc -l)
      if (( FILE_COUNT == 0 )); then
        FAILURES+=("artifact_not_empty: 产物目录为空")
      fi
    fi
  fi
fi

# --- Check 3: acceptance_criteria_met ---
# Heuristic: artifact must contain at least one substantive section (>3 non-blank lines)
if [[ -n "${RESOLVED:-}" && -f "${RESOLVED:-}" ]]; then
  CONTENT_LINES=$(grep -cve '^\s*$' "$RESOLVED" 2>/dev/null || echo "0")
  if (( CONTENT_LINES < 3 )); then
    FAILURES+=("acceptance_criteria_met: 产物内容不足3行实质内容，验收标准无法满足")
  fi
fi

# --- Check 4: tracker_updated (warn only) ---
if [[ -f "$TRACKER" ]]; then
  if ! grep -q "$TASK_ID" "$TRACKER" 2>/dev/null; then
    WARNINGS+=("tracker_updated: PROJECT-TRACKER.md 中未找到任务 $TASK_ID 的条目")
  fi
else
  WARNINGS+=("tracker_updated: PROJECT-TRACKER.md 不存在")
fi

# --- Output warnings ---
for w in "${WARNINGS[@]+"${WARNINGS[@]}"}"; do
  [[ -n "$w" ]] && echo "[$RULE_ID] WARN: $w"
done

# --- Gate decision ---
if (( ${#FAILURES[@]} > 0 )); then
  echo ""
  echo "[$RULE_ID] ❌ GATE BLOCKED — 产物门禁未通过"
  echo "[$RULE_ID] 缺失产物清单:"
  for f in "${FAILURES[@]}"; do
    echo "  • $f"
  done
  echo ""
  echo "[$RULE_ID] ACTION: 任务 $TASK_ID 状态回退为 ⏳ 进行中"
  echo "[$RULE_ID] EVENT: task.artifact.rejected task=$TASK_ID rule=$RULE_ID"
  exit 1
else
  echo ""
  echo "[$RULE_ID] ✅ GATE PASSED — 产物验证通过"
  echo "[$RULE_ID] EVENT: task.artifact.verified task=$TASK_ID rule=$RULE_ID"
  echo "[$RULE_ID] ACTION: 更新 PROJECT-TRACKER.md 状态为 ✅"
  exit 0
fi
