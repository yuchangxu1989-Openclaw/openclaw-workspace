#!/bin/bash
# auto-completion-dispatch.sh — completion event 一站式处理
# 主Agent收到completion只需调这个脚本，读输出JSON决定下一步
# 用法: auto-completion-dispatch.sh <label> <status> <result_summary>
# 输出: 标准化JSON到 logs/completion-actions.json (追加模式)

set -euo pipefail

WORKSPACE="/root/.openclaw/workspace"
BOARD_FILE="$WORKSPACE/logs/subagent-task-board.json"
RETRY_QUEUE="$WORKSPACE/logs/retry-queue.json"
ACTIONS_FILE="$WORKSPACE/logs/completion-actions.json"
LOGFILE="$WORKSPACE/logs/auto-completion-dispatch.log"

LABEL="${1:-}"
STATUS="${2:-}"
SUMMARY="${3:-}"

if [ -z "$LABEL" ] || [ -z "$STATUS" ]; then
  echo '{"error":"用法: auto-completion-dispatch.sh <label> <done|failed> \"结果摘要\""}'
  exit 1
fi

mkdir -p "$WORKSPACE/logs"

# --- Step 1: 调用 completion-handler.sh 更新看板 ---
bash "$WORKSPACE/scripts/completion-handler.sh" "$LABEL" "$STATUS" "$SUMMARY" >> "$LOGFILE" 2>&1 || true

# --- Step 2: 从看板获取任务元信息 ---
AGENT_ID=""
DESCRIPTION=""
RETRY_COUNT=0
if [ -f "$BOARD_FILE" ]; then
  AGENT_ID=$(node -e "
    const b=JSON.parse(require('fs').readFileSync('$BOARD_FILE','utf8'));
    const t=b.find(x=>x.label==='$LABEL'||x.taskId==='$LABEL');
    console.log(t?.agentId||'');
  " 2>/dev/null || true)
  DESCRIPTION=$(node -e "
    const b=JSON.parse(require('fs').readFileSync('$BOARD_FILE','utf8'));
    const t=b.find(x=>x.label==='$LABEL'||x.taskId==='$LABEL');
    console.log(t?.description||t?.task||'');
  " 2>/dev/null || true)
fi

# 从retry-queue获取已有重试次数
if [ -f "$RETRY_QUEUE" ]; then
  RETRY_COUNT=$(node -e "
    const q=JSON.parse(require('fs').readFileSync('$RETRY_QUEUE','utf8'));
    const t=q.find(x=>x.original_label==='$LABEL'||x.label==='$LABEL');
    console.log(t?.timeout_count||t?.retryCount||0);
  " 2>/dev/null || echo "0")
fi

# --- Step 3: 决策逻辑 ---
ACTION=""
REASON=""
RETRY_TASK=""

if [ "$STATUS" = "done" ]; then
  # 成功：判断是否需要QA
  case "$AGENT_ID" in
    coder*|writer*|researcher*)
      ACTION="qa_required"
      REASON="agent=$AGENT_ID 完成任务，需自动质量核查"
      echo "AUTO_QA_REQUIRED"
      ;;
    *)
      ACTION="done"
      REASON="任务完成，无需额外操作"
      ;;
  esac

elif [ "$STATUS" = "failed" ]; then
  # 失败：分析原因决定是否重试
  SUMMARY_LOWER=$(echo "$SUMMARY" | tr '[:upper:]' '[:lower:]')

  if echo "$SUMMARY_LOWER" | grep -qE "workspace.*不对|workspace.*wrong|no such file|enoent.*workspace|路径错误|workspace-coder"; then
    # 路径错误 → 加绝对路径重派
    ACTION="retry"
    REASON="路径错误(workspace不对)，需加绝对路径 /root/.openclaw/workspace/ 重派"
    RETRY_TASK="【绝对路径修正重派】$DESCRIPTION — 所有路径用绝对路径 /root/.openclaw/workspace/ 开头！"

  elif echo "$SUMMARY_LOWER" | grep -qE "boom.*400|400.*boom|api.*400|model.*unavailable|boom-.*400"; then
    # boom 400 → 模型不可用，不重试
    ACTION="archive"
    REASON="boom 400 模型不可用，标记废弃不重试"

  elif echo "$SUMMARY_LOWER" | grep -qE "timeout|timed.out|超时|context.limit|token.limit"; then
    # timeout → 检查重试次数
    if [ "$RETRY_COUNT" -lt 3 ]; then
      ACTION="retry"
      REASON="超时(第${RETRY_COUNT}次)，retry<3可重试"
      RETRY_TASK="【超时重试#$((RETRY_COUNT+1))】$DESCRIPTION"
    else
      ACTION="archive"
      REASON="超时已达3次上限，放弃重试"
    fi

  elif echo "$SUMMARY_LOWER" | grep -qE "rate.limit|429|too many|quota"; then
    # 限流 → 可重试
    if [ "$RETRY_COUNT" -lt 3 ]; then
      ACTION="retry"
      REASON="API限流，稍后可重试"
      RETRY_TASK="【限流重试#$((RETRY_COUNT+1))】$DESCRIPTION"
    else
      ACTION="archive"
      REASON="限流重试已达上限"
    fi

  else
    # 其他失败 → 首次可重试，否则归档
    if [ "$RETRY_COUNT" -lt 2 ]; then
      ACTION="retry"
      REASON="未知失败原因，首次重试"
      RETRY_TASK="【重试】$DESCRIPTION"
    else
      ACTION="archive"
      REASON="多次失败，归档处理: $SUMMARY"
    fi
  fi
else
  ACTION="done"
  REASON="状态=$STATUS，按完成处理"
fi

# --- Step 4: 输出标准化JSON ---
TIMESTAMP=$(date -Iseconds)
ENTRY=$(node -e "
const e = {
  label: $(printf '%s' "$LABEL" | node -e "process.stdout.write(JSON.stringify(require('fs').readFileSync('/dev/stdin','utf8')))"),
  action: '$ACTION',
  reason: $(printf '%s' "$REASON" | node -e "process.stdout.write(JSON.stringify(require('fs').readFileSync('/dev/stdin','utf8')))"),
  agent: '$AGENT_ID',
  status: '$STATUS',
  retry_task: $(printf '%s' "$RETRY_TASK" | node -e "process.stdout.write(JSON.stringify(require('fs').readFileSync('/dev/stdin','utf8')))"),
  retry_count: $RETRY_COUNT,
  timestamp: '$TIMESTAMP'
};
console.log(JSON.stringify(e));
" 2>/dev/null)

# 追加到 completion-actions.json (保持为JSON数组)
if [ -f "$ACTIONS_FILE" ]; then
  node -e "
    const fs=require('fs');
    let arr=[];
    try { arr=JSON.parse(fs.readFileSync('$ACTIONS_FILE','utf8')); } catch(e){}
    if(!Array.isArray(arr)) arr=[];
    arr.push($ENTRY);
    // 只保留最近100条
    if(arr.length>100) arr=arr.slice(-100);
    fs.writeFileSync('$ACTIONS_FILE', JSON.stringify(arr,null,2));
  "
else
  echo "[$ENTRY]" | node -e "
    const fs=require('fs');
    let d='';process.stdin.on('data',c=>d+=c);
    process.stdin.on('end',()=>fs.writeFileSync('$ACTIONS_FILE',JSON.stringify(JSON.parse(d),null,2)));
  "
fi

# --- Step 5: 输出到stdout供主Agent直接读取 ---
echo "$ENTRY"

# 日志
echo "[$(date -Iseconds)] $LABEL | $STATUS | action=$ACTION | reason=$REASON" >> "$LOGFILE"
