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
QA_DISPATCHED_AGENT=""

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

  # Step 2: 质量核查判断 + AUTO_QA队列生成
  AGENT_ID=$(node -e "
const board = JSON.parse(require('fs').readFileSync('$BOARD_FILE','utf8'));
const task = board.find(t => t.label === '$TASK_ID' || t.taskId === '$TASK_ID');
if (task) console.log(task.agentId || '');
" 2>/dev/null)

  NEED_QA="false"
  AUTO_QA_FILE=""
  case "$AGENT_ID" in
    coder*|writer*|researcher*) NEED_QA="true" ;;
    # reviewer/analyst不触发auto-qa，避免无限循环（前缀匹配）
    reviewer*|analyst*) NEED_QA="false" ;;
  esac
  [ "$STATUS" = "failed" ] && NEED_QA="false"
  # Layer 2: label以qa-开头时不触发（防无限循环）
  case "$TASK_ID" in qa-*|auto-qa-*) NEED_QA="false" ;; esac

  if [ "$NEED_QA" = "true" ]; then
    echo "🔍 AUTO_QA: 自动派发reviewer核查 $TASK_ID (by $AGENT_ID)"
    # 生成auto-qa队列文件
    AUTO_QA_DIR="/root/.openclaw/workspace/logs/auto-qa-queue"
    mkdir -p "$AUTO_QA_DIR"
    SAFE_LABEL=$(echo "$TASK_ID" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9_-]/-/g' | sed 's/-\+/-/g' | sed 's/^-//;s/-$//')
    QA_TS=$(date +%Y%m%d%H%M%S)
    AUTO_QA_FILE="${AUTO_QA_DIR}/auto-qa-${SAFE_LABEL}-${QA_TS}.json"

    # 确定checklist模板类型（前缀匹配）
    QA_TYPE="code-qa"
    case "$AGENT_ID" in
      writer*) QA_TYPE="doc-qa" ;;
      researcher*) QA_TYPE="doc-qa" ;;
      coder*) QA_TYPE="code-qa" ;;
    esac

    node -e "
const fs = require('fs');
let taskDetail = '';
try {
  const board = JSON.parse(fs.readFileSync('$BOARD_FILE','utf8'));
  const task = board.find(t => t.label === '$TASK_ID' || t.taskId === '$TASK_ID');
  taskDetail = task?.task || task?.result_summary || '';
} catch(e) {}
const entry = {
  original_label: '$TASK_ID',
  original_agent: '$AGENT_ID',
  status: 'pending',
  qa_type: '$QA_TYPE',
  artifact_path: '$ARTIFACT_PATH' || null,
  task_summary: taskDetail,
  result_summary: $(printf '%s' "$SUMMARY" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.stringify(d)))"),
  created_at: new Date().toISOString()
};
fs.writeFileSync('$AUTO_QA_FILE', JSON.stringify(entry, null, 2));
" 2>/dev/null
    echo "📋 核查队列文件已生成: $AUTO_QA_FILE"

    # === 自动派发QA Agent ===
    QA_SPAWN_LOG="/root/.openclaw/workspace/logs/auto-qa-spawn.log"
    QA_LOCK="/tmp/auto-qa-spawn.lock"

    # 选择QA Agent：优先reviewer开头，其次任意空闲
    QA_AGENT=""
    IDLE_LIST=$(bash /root/.openclaw/workspace/scripts/get-idle-agent.sh 18 2>/dev/null || true)
    if [ -n "$IDLE_LIST" ]; then
      QA_AGENT=$(echo "$IDLE_LIST" | grep "^reviewer" | head -n1)
      [ -z "$QA_AGENT" ] && QA_AGENT=$(echo "$IDLE_LIST" | head -n1)
    fi

    if [ -n "$QA_AGENT" ]; then
      QA_LABEL="qa-${SAFE_LABEL}"
      QA_DATE=$(date +%Y-%m-%d)
      QA_MESSAGE="质量核查任务 [自动触发]
原始任务: ${TASK_ID}
执行Agent: ${AGENT_ID}
核查类型: ${QA_TYPE}
产出物路径: ${ARTIFACT_PATH:-无}
任务摘要: $(echo "$SUMMARY" | head -c 500)

请执行以下核查：
1. 读取产出物文件，检查质量
2. 根据核查类型(${QA_TYPE})使用对应checklist
3. 将核查报告写入 /root/.openclaw/workspace/reports/qa-${SAFE_LABEL}-${QA_DATE}.md
4. 报告格式：评级(通过/有条件通过/不通过) + 问题列表 + 改进建议
注意：所有文件路径使用绝对路径。这是自动触发的QA，label以qa-开头。"

      # 后台subshell派发，不阻塞主流程
      (
        # flock保护写操作（5秒超时）
        (
          flock -w 5 200 || { echo "$(date -Iseconds) ⚠️ flock超时，跳过注册" >> "$QA_SPAWN_LOG"; exit 1; }
          bash /root/.openclaw/workspace/scripts/register-task.sh \
            "$QA_LABEL" "$QA_LABEL" "$QA_AGENT" "auto-qa" "质量核查: ${TASK_ID}" 2>/dev/null || true
          if [ -f "$AUTO_QA_FILE" ]; then
            node -e "
              const fs=require('fs');
              const d=JSON.parse(fs.readFileSync('$AUTO_QA_FILE','utf8'));
              d.status='dispatched';
              d.dispatched_agent='$QA_AGENT';
              d.dispatched_at=new Date().toISOString();
              d.qa_label='$QA_LABEL';
              fs.writeFileSync('$AUTO_QA_FILE',JSON.stringify(d,null,2));
            " 2>/dev/null || true
          fi
        ) 200>"$QA_LOCK"
        echo "$(date -Iseconds) 派发QA: task=${TASK_ID} agent=${QA_AGENT} label=${QA_LABEL}" >> "$QA_SPAWN_LOG"
        openclaw agent --agent "$QA_AGENT" --message "$QA_MESSAGE" --timeout 300 >> "$QA_SPAWN_LOG" 2>&1 || {
          echo "$(date -Iseconds) ❌ CLI spawn失败，写pending文件兜底" >> "$QA_SPAWN_LOG"
          echo "{\"label\":\"$QA_LABEL\",\"agent\":\"$QA_AGENT\",\"task\":\"$TASK_ID\",\"created_at\":\"$(date -Iseconds)\"}" > "/tmp/qa-pending-${SAFE_LABEL}.json"
        }
      ) &

      QA_DISPATCHED_AGENT="$QA_AGENT"
      echo "🚀 已派发QA Agent: ${QA_AGENT} → 核查 ${TASK_ID} (label: ${QA_LABEL})"
    else
      # 全忙：写pending文件，等heartbeat扫描处理
      PENDING_FILE="/tmp/qa-pending-${SAFE_LABEL}.json"
      node -e "
        const fs=require('fs');
        fs.writeFileSync('$PENDING_FILE', JSON.stringify({
          label: '$TASK_ID',
          qa_label: 'qa-${SAFE_LABEL}',
          qa_type: '$QA_TYPE',
          artifact_path: '${ARTIFACT_PATH}' || null,
          queue_file: '$AUTO_QA_FILE',
          created_at: new Date().toISOString()
        }, null, 2));
      " 2>/dev/null || true
      echo "⏳ 所有Agent忙碌，QA任务已写入pending: $PENDING_FILE"
    fi
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

  # Step 7: 超时/失败自动重试入队 + pending-retry-pool写入
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
        PENDING_POOL="/root/.openclaw/workspace/logs/pending-retry-pool.json"
        node -e "
          const fs=require('fs');
          const board=JSON.parse(fs.readFileSync('$BOARD_FILE','utf8'));
          const task=board.filter(t=>t.label==='$TASK_ID'||t.taskId==='$TASK_ID').pop();
          const retryCount = (${RETRY_COUNT}||0)+1;
          const entry = {
            label:'$TASK_ID',
            original_agentId: task?.agentId||'unknown',
            original_model: task?.model||'unknown',
            retry_count: retryCount,
            reason:'$STATUS',
            status:'pending',
            queued_at: new Date().toISOString(),
            original_task_summary: task?.result_summary||task?.task||''
          };

          // Write to auto-retry-queue
          const queue_path='$AUTO_RETRY_QUEUE';
          let queue=[];
          try{queue=JSON.parse(fs.readFileSync(queue_path,'utf8'));}catch(e){}
          queue.push(entry);
          fs.writeFileSync(queue_path,JSON.stringify(queue,null,2));

          // Write to pending-retry-pool (deduplicated by label)
          const pool_path='$PENDING_POOL';
          let pool=[];
          try{pool=JSON.parse(fs.readFileSync(pool_path,'utf8'));}catch(e){}
          pool = pool.filter(p => p.label !== '$TASK_ID');
          pool.push({
            label:'$TASK_ID',
            originalTask: task?.task||'',
            retryCount: retryCount,
            addedAt: new Date().toISOString(),
            status:'pending',
            agentId: task?.agentId||'unknown',
            model: task?.model||'unknown',
            reason:'$STATUS'
          });
          fs.writeFileSync(pool_path,JSON.stringify(pool,null,2));
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
if [ -n "$AUTO_QA_FILE" ] && [ -f "$AUTO_QA_FILE" ]; then
  echo ""
  if [ -n "$QA_DISPATCHED_AGENT" ]; then
    echo "🚀 AUTO_QA_DISPATCHED: ${TASK_ID} → ${QA_DISPATCHED_AGENT}"
  else
    echo "🔍 AUTO_QA_PENDING: $TASK_ID (全忙，等待heartbeat处理)"
  fi
  echo "📋 核查队列: $AUTO_QA_FILE"
fi
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

# Step FINAL: 自动扩列检测 — 输出不可忽略的派发指令
bash /root/.openclaw/workspace/scripts/auto-backfill.sh 2>/dev/null || true
