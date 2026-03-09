#!/bin/bash
# 子Agent完成时的标准处理流程
# 用法: completion-handler.sh <taskId_or_label> <status> <summary>
# stdout≤10行，详细日志写文件

TASK_ID="$1"
STATUS="$2"  # done / failed
SUMMARY="${3:-}"
BOARD_FILE="/root/.openclaw/workspace/logs/subagent-task-board.json"
RETRY_QUEUE="/root/.openclaw/workspace/logs/retry-queue.json"
LOGFILE="/root/.openclaw/workspace/logs/completion-handler-latest.log"

mkdir -p /root/.openclaw/workspace/logs

if [ -z "$TASK_ID" ] || [ -z "$STATUS" ]; then
  echo "用法: completion-handler.sh <taskId_or_label> <done|failed> \"简要结果\""
  exit 1
fi

HARVESTED="false"
HARVEST_ID=""

# 所有详细输出写日志文件
{
  echo "=== Completion Handler $(date -Iseconds) ==="
  echo "Task: $TASK_ID | Status: $STATUS | Summary: $SUMMARY"

  # Step 1: 更新task-board
  bash /root/.openclaw/workspace/scripts/update-task.sh "$TASK_ID" "$STATUS" "$SUMMARY"

  # Step 1.5: 产出物路径检测提示
  ARTIFACT_PATH=$(echo "$SUMMARY" | grep -oE "(/[^[:space:]\"'<>]+\.(md|json|js|sh))" | head -n1 || true)
  if [ -n "$ARTIFACT_PATH" ]; then
    echo "📎 产出物待发送: $ARTIFACT_PATH"
  fi

  # Step 2: 质量核查判断
  AGENT_ID=$(node -e "
const board = JSON.parse(require('fs').readFileSync('$BOARD_FILE','utf8'));
const task = board.find(t => t.label === '$TASK_ID' || t.taskId === '$TASK_ID');
if (task) console.log(task.agentId || '');
" 2>/dev/null)

  NEED_QA="false"
  case "$AGENT_ID" in
    coder|writer|researcher) NEED_QA="true" ;;
  esac
  [ "$STATUS" = "failed" ] && NEED_QA="false"

  if [ "$NEED_QA" = "true" ]; then
    echo "🔍 需要质量核查：$TASK_ID \(by $AGENT_ID\)"
  fi

  # Step 3: 看板+飞书
  bash /root/.openclaw/workspace/scripts/show-task-board-feishu.sh
  bash /root/.openclaw/workspace/scripts/push-feishu-board.sh 2>/dev/null || true

  # Step 4: running=0检查
  if [ -f "$BOARD_FILE" ]; then
    RUNNING=$(node -e "
const board = JSON.parse(require('fs').readFileSync('$BOARD_FILE','utf8'));
console.log(board.filter(t=>t.status==='running').length);
" 2>/dev/null || echo "0")
    [ "$RUNNING" = "0" ] && echo "🎯 所有任务已完成！"
  fi

  # Step 5: Badcase检测 + 自动入库（原子化）
  BADCASE_KEYWORDS="badcase|违反|纠偏|反复未果|头痛医头|又忘了|第N次|不推看板|手动触发"
  if echo "$SUMMARY" | grep -qiE "$BADCASE_KEYWORDS"; then
    echo "⚠️ 检测到潜在Badcase: $SUMMARY"

    SAFE_TASK_ID=$(echo "$TASK_ID" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/-\+/-/g' | sed 's/^-//;s/-$//')
    [ -z "$SAFE_TASK_ID" ] && SAFE_TASK_ID="task"
    SAFE_TS=$(date +%Y%m%d%H%M%S)
    HARVEST_ID="auto-${SAFE_TASK_ID}-${SAFE_TS}"

    if bash /root/.openclaw/workspace/scripts/auto-badcase-harvest.sh \
      "$HARVEST_ID" \
      "自主性缺失类" \
      "completion-handler自动检测: task=$TASK_ID status=$STATUS summary=$SUMMARY" \
      "任务总结含badcase语义 then仅口头标记 then未程序化入库" \
      "任务总结命中badcase关键词 thencompletion-handler自动触发harvest then记录落库" \
      "口头判断与结构化记录脱钩，缺少强制原子绑定"; then
      HARVESTED="true"
      echo "✅ Badcase已自动入库: $HARVEST_ID"
    else
      echo "❌ Badcase自动入库失败: $HARVEST_ID"
    fi
  fi

  # Step 5.5: 空闲slot检查 + 待重试任务提示
  MAX_CONCURRENT=19
  if [ -f "$BOARD_FILE" ]; then
    RUNNING_NOW=$(jq '[.[] | select(.status=="running")] | length' "$BOARD_FILE" 2>/dev/null || echo "0")
    if [ "$RUNNING_NOW" -lt "$MAX_CONCURRENT" ] 2>/dev/null; then
      # 查找待重试任务：status=timeout/failed/timed_out 且 retry_count<3
      RETRYABLE=$(jq -r '
        [.[] | select(
          (.status=="timeout" or .status=="timed_out" or .status=="failed") and
          ((.retry_count // 0) < 3)
        )] | if length > 0 then
          "FOUND\n" + (map("  - \(.label) (\(.status), retry \(.retry_count // 0)/3)") | join("\n"))
        else "NONE" end
      ' "$BOARD_FILE" 2>/dev/null || echo "NONE")

      FREE_SLOTS=$((MAX_CONCURRENT - RUNNING_NOW))
      if echo "$RETRYABLE" | grep -q "^FOUND"; then
        echo ""
        if [ "$FREE_SLOTS" -ge 5 ]; then
          echo "🚨🚨🚨 扩列提醒 🚨🚨🚨"
          RETRYABLE_COUNT=$(echo "$RETRYABLE" | tail -n +2 | wc -l)
          echo "空闲slot: ${FREE_SLOTS}/${MAX_CONCURRENT} | 待派任务池: ${RETRYABLE_COUNT}条"
          echo "立即扩列！不要让算力闲置！"
          echo ""
          echo "可重试任务："
          echo "$RETRYABLE" | tail -n +2
        else
          echo "🔄 有空闲slot（当前running: ${RUNNING_NOW}/${MAX_CONCURRENT}，空闲: ${FREE_SLOTS}），以下任务可重试："
          echo "$RETRYABLE" | tail -n +2
          echo "建议立即扩列。"
        fi

        # 为待重试任务初始化 retry_count 字段（如果不存在则设为0）
        jq '[ .[] | if (.status=="timeout" or .status=="timed_out" or .status=="failed") and ((.retry_count // 0) < 3) and (.retry_count == null) then .retry_count = 0 else . end ]' "$BOARD_FILE" > "${BOARD_FILE}.tmp" && mv "${BOARD_FILE}.tmp" "$BOARD_FILE"
      fi
    fi
  fi

  # Step 6: 超时扫描
  bash /root/.openclaw/workspace/scripts/task-timeout-check.sh 2>/dev/null || true

  # Step 7: 超时/失败自动重试入队
  if [ "$STATUS" = "timed_out" ] || [ "$STATUS" = "timeout" ] || [ "$STATUS" = "failed" ]; then
    # 检查是否为user_cancelled，是则跳过
    IS_CANCELLED=$(node -e "
      const b=JSON.parse(require('fs').readFileSync('$BOARD_FILE','utf8'));
      const t=b.filter(t=>t.label==='$TASK_ID'||t.taskId==='$TASK_ID').pop();
      console.log(t?.cancel_reason==='user_cancelled'?'yes':'no');
    " 2>/dev/null || echo "no")

    if [ "$IS_CANCELLED" != "yes" ]; then
      RETRY_COUNT=$(node -e "
        const b=JSON.parse(require('fs').readFileSync('$BOARD_FILE','utf8'));
        const t=b.filter(t=>t.label==='$TASK_ID'||t.taskId==='$TASK_ID').pop();
        console.log(t?.retry_count||0);
      " 2>/dev/null || echo "0")

      MAX_RETRY=2

      if [ "$RETRY_COUNT" -lt "$MAX_RETRY" ] 2>/dev/null; then
        AUTO_RETRY_QUEUE="/root/.openclaw/workspace/logs/auto-retry-queue.json"
        node -e "
          const fs=require('fs');
          const board=JSON.parse(fs.readFileSync('$BOARD_FILE','utf8'));
          const task=board.filter(t=>t.label==='$TASK_ID'||t.taskId==='$TASK_ID').pop();
          const queue_path='$AUTO_RETRY_QUEUE';
          let queue=[];
          try{queue=JSON.parse(fs.readFileSync(queue_path,'utf8'));}catch(e){}
          queue.push({
            label:'$TASK_ID',
            original_agentId: task?.agentId||'unknown',
            original_model: task?.model||'unknown',
            retry_count: (${RETRY_COUNT}||0)+1,
            reason:'$STATUS',
            status:'pending',
            queued_at: new Date().toISOString(),
            original_task_summary: task?.result_summary||task?.task||''
          });
          fs.writeFileSync(queue_path,JSON.stringify(queue,null,2));
        " 2>/dev/null
        echo "🔄 自动重试已入队: $TASK_ID (第$((RETRY_COUNT+1))次)"
      else
        echo "❌ $TASK_ID 已达最大重试次数($MAX_RETRY)，不再重试"
      fi
    else
      echo "⏭️ $TASK_ID 为用户取消，跳过自动重试"
    fi
  fi

  echo "=== Handler Complete ==="
} > "$LOGFILE" 2>&1

# === stdout精简摘要（≤10行） ===

# 看板摘要1行
BOARD_SUMMARY=$(node -e "
const fs = require('fs');
try {
  const board = JSON.parse(fs.readFileSync('$BOARD_FILE','utf8'));
  const r = board.filter(t=>t.status==='running').length;
  const d = board.filter(t=>t.status==='done').length;
  const t = board.filter(t=>t.status==='timeout').length;
  const f = board.filter(t=>t.status==='failed').length;
  console.log('running: '+r+' | done: '+d+' | timeout: '+t+' | failed: '+f);
} catch(e) { console.log('看板读取失败'); }
" 2>/dev/null)

# 重试队列数
PENDING_COUNT=0
if [ -f "$RETRY_QUEUE" ]; then
  PENDING_COUNT=$(node -e "
const q = JSON.parse(require('fs').readFileSync('$RETRY_QUEUE','utf8'));
console.log(q.filter(r=>r.status==='pending').length);
" 2>/dev/null || echo "0")
fi

echo "✅ 已更新: $TASK_ID → $STATUS"
echo "📋 $BOARD_SUMMARY"
if [ "$HARVESTED" = "true" ]; then
  echo "🧷 已自动Badcase入库: $HARVEST_ID"
fi
if [ "$PENDING_COUNT" != "0" ]; then
  # 从看板获取当前running数
  CUR_RUNNING=$(jq '[.[] | select(.status=="running")] | length' "$BOARD_FILE" 2>/dev/null || echo "0")
  CUR_FREE=$((19 - CUR_RUNNING))
  if [ "$CUR_FREE" -ge 5 ]; then
    echo ""
    echo "🚨🚨🚨 扩列提醒 🚨🚨🚨"
    echo "空闲slot: ${CUR_FREE}/19 | 待派任务池: ${PENDING_COUNT}条"
    echo "立即扩列！不要让算力闲置！"
  else
    echo "🔄 当前有${PENDING_COUNT}条任务待重试（详见logs/completion-handler-latest.log）"
  fi
fi

# 检查：running=0 但有已完成任务（说明刚完成一波但没派新的）
if [ -f "$BOARD_FILE" ]; then
  _CHK_RUNNING=$(jq '[.[] | select(.status=="running")] | length' "$BOARD_FILE" 2>/dev/null || echo "0")
  _CHK_DONE=$(jq '[.[] | select(.status=="done")] | length' "$BOARD_FILE" 2>/dev/null || echo "0")
  if [ "$_CHK_RUNNING" = "0" ] && [ "$_CHK_DONE" -gt 0 ] 2>/dev/null; then
    echo ""
    echo "⚠️ 全部完成，无任务在跑！检查是否有下一批任务需要派发"
  fi
fi

# Detect batch completion: when no running tasks remain after an update
if [ "${after_running:-}" = "0" ] && [ "${before_running:-}" != "0" ] && [ "${status:-}" != "running" ]; then
  echo ""
  echo "🏁🏁🏁 ALL_TASKS_DONE — 所有任务已完成，必须立即推送最终看板给用户！"
  echo "执行: bash /root/.openclaw/workspace/scripts/show-task-board-feishu.sh"
  echo "🏁🏁🏁"
fi
