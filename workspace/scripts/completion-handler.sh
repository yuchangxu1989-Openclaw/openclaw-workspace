#!/bin/bash
# 子Agent完成时的标准处理流程
# 用法: completion-handler.sh <taskId_or_label> <status> <summary>
# 主Agent收到completion event后，调用此脚本完成所有必做动作

TASK_ID="$1"
STATUS="$2"  # done / failed
SUMMARY="${3:-}"

if [ -z "$TASK_ID" ] || [ -z "$STATUS" ]; then
  echo "用法: completion-handler.sh <taskId_or_label> <done|failed> \"简要结果\""
  exit 1
fi

echo "=== Completion Handler ==="

# Step 1: 更新task-board（强制）
bash /root/.openclaw/workspace/scripts/update-task.sh "$TASK_ID" "$STATUS" "$SUMMARY"

# Step 2: 自动质量核查（强制）
# 判断是否需要核查（开发/写作类任务需要，纯分析/查询类不需要）
NEED_QA="false"

# 从task-board读取任务的agentId
AGENT_ID=$(node -e "
const board = JSON.parse(require('fs').readFileSync('$BOARD_FILE','utf8'));
const task = board.find(t => t.label === '$TASK_ID' || t.taskId === '$TASK_ID');
if (task) console.log(task.agentId || '');
")

# 开发类Agent的产出必须核查
case "$AGENT_ID" in
  coder|writer|researcher)
    NEED_QA="true"
    ;;
  reviewer|analyst|scout)
    NEED_QA="false"  # 核查者/分析者本身不需要再核查
    ;;
esac

# 如果任务状态是failed，不需要核查
if [ "$STATUS" = "failed" ]; then
  NEED_QA="false"
fi

if [ "$NEED_QA" = "true" ]; then
  echo ""
  echo "🔍 需要质量核查：$TASK_ID (by $AGENT_ID)"
  echo "请主Agent立即派reviewer或analyst核查此任务产出"
  echo "命令模板：sessions_spawn agentId=reviewer label=qa-$TASK_ID task='核查...'"
fi

# Step 3: 生成看板并直接推送飞书（不依赖主Agent转发）
bash /root/.openclaw/workspace/scripts/show-task-board-feishu.sh
bash /root/.openclaw/workspace/scripts/push-feishu-board.sh

# Step 4: 检查是否触发批量汇报（running=0时）
BOARD_FILE="/root/.openclaw/workspace/logs/subagent-task-board.json"
if [ -f "$BOARD_FILE" ]; then
  RUNNING=$(node -e "
const board = JSON.parse(require('fs').readFileSync('$BOARD_FILE','utf8'));
console.log(board.filter(t=>t.status==='running').length);
")

  if [ "$RUNNING" = "0" ]; then
    echo ""
    echo "🎯 所有任务已完成！请向用户推送最终汇总。"
  fi
fi

# Step 5: Badcase自动检测（ISC-EVAL-C2-AUTO-HARVEST-001）
BADCASE_KEYWORDS="badcase|违反|纠偏|反复未果|头痛医头|又忘了|第N次|不推看板|手动触发"
if echo "$SUMMARY" | grep -qiE "$BADCASE_KEYWORDS"; then
  echo ""
  echo "⚠️ 检测到潜在Badcase，建议入库！"
  echo "   匹配内容: $SUMMARY"
  echo "   入库命令: bash /root/.openclaw/workspace/scripts/auto-badcase-harvest.sh <badcase_id> <category> \"<description>\" \"<wrong_chain>\" \"<correct_chain>\" \"<root_cause>\""
  echo "   ISC规则: ISC-EVAL-C2-AUTO-HARVEST-001"
fi

echo "=== Handler Complete ==="
