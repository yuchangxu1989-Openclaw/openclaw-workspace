#!/bin/bash
# auto-qa-on-completion.sh — completion后自动派QA核查
# 用法: auto-qa-on-completion.sh <label> <agentId> [artifact_path]
# 退出码: 0=已派发/已入队, 1=不需要QA, 2=参数错误
# stdout: 派发结果摘要（供completion-handler捕获）

LABEL="$1"
AGENT_ID="$2"
ARTIFACT_PATH="${3:-}"
BOARD_FILE="/root/.openclaw/workspace/logs/subagent-task-board.json"
QA_SPAWN_LOG="/root/.openclaw/workspace/logs/auto-qa-spawn.log"

if [ -z "$LABEL" ] || [ -z "$AGENT_ID" ]; then
  echo "用法: auto-qa-on-completion.sh <label> <agentId> [artifact_path]"
  exit 2
fi

# ===== 判断是否需要QA =====
NEED_QA="false"
case "$AGENT_ID" in
  coder*|writer*|researcher*)  NEED_QA="true" ;;
  # reviewer/analyst不再核查（避免无限循环）
  reviewer*|analyst*|scout*)   NEED_QA="false" ;;
esac

# label以qa-/auto-qa-开头的也跳过（防循环）
case "$LABEL" in
  qa-*|auto-qa-*) NEED_QA="false" ;;
esac

if [ "$NEED_QA" != "true" ]; then
  echo "SKIP: ${LABEL} (agent=${AGENT_ID}) 不需要QA"
  exit 1
fi

# ===== 准备QA参数 =====
SAFE_LABEL=$(echo "$LABEL" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9_-]/-/g' | sed 's/-\+/-/g' | sed 's/^-//;s/-$//')
QA_LABEL="qa-${SAFE_LABEL}"
QA_DATE=$(date +%Y-%m-%d)
QA_TS=$(date +%Y%m%d%H%M%S)

# 核查类型：writer/researcher用doc-qa，coder用code-qa
QA_TYPE="code-qa"
case "$AGENT_ID" in
  writer*|researcher*) QA_TYPE="doc-qa" ;;
esac

# ===== 选择QA Agent（角色分离铁律：核查者≠执行者） =====
QA_AGENT=""
IDLE_LIST=$(bash /root/.openclaw/workspace/scripts/get-idle-agent.sh 18 2>/dev/null || true)
if [ -n "$IDLE_LIST" ]; then
  # 优先选reviewer，但不能和执行者同名
  QA_AGENT=$(echo "$IDLE_LIST" | grep -v "^${AGENT_ID}$" | grep "^reviewer" | head -n1)
  # 其次analyst
  [ -z "$QA_AGENT" ] && QA_AGENT=$(echo "$IDLE_LIST" | grep -v "^${AGENT_ID}$" | grep "^analyst" | head -n1)
  # 兜底：任意空闲（但不能是执行者自己）
  [ -z "$QA_AGENT" ] && QA_AGENT=$(echo "$IDLE_LIST" | grep -v "^${AGENT_ID}$" | head -n1)
fi

# ===== 生成核查队列文件 =====
AUTO_QA_DIR="/root/.openclaw/workspace/logs/auto-qa-queue"
mkdir -p "$AUTO_QA_DIR"
AUTO_QA_FILE="${AUTO_QA_DIR}/auto-qa-${SAFE_LABEL}-${QA_TS}.json"

# 从看板读取任务详情
TASK_SUMMARY=$(node -e "
try {
  const b=JSON.parse(require('fs').readFileSync('$BOARD_FILE','utf8'));
  const t=b.find(t=>t.label==='$LABEL'||t.taskId==='$LABEL');
  console.log(t?.task||t?.result_summary||'');
} catch(e) { console.log(''); }
" 2>/dev/null)

node -e "
const fs=require('fs');
fs.writeFileSync('$AUTO_QA_FILE', JSON.stringify({
  original_label: '$LABEL',
  original_agent: '$AGENT_ID',
  qa_label: '$QA_LABEL',
  qa_type: '$QA_TYPE',
  artifact_path: '${ARTIFACT_PATH}' || null,
  task_summary: $(printf '%s' "$TASK_SUMMARY" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.stringify(d)))"),
  status: '$( [ -n "$QA_AGENT" ] && echo dispatched || echo pending )',
  dispatched_agent: '$QA_AGENT' || null,
  created_at: new Date().toISOString()
}, null, 2));
" 2>/dev/null

# ===== 派发或入队 =====
if [ -n "$QA_AGENT" ]; then
  QA_MESSAGE="质量核查任务 [自动触发]
原始任务: ${LABEL}
执行Agent: ${AGENT_ID}
核查类型: ${QA_TYPE}
产出物路径: ${ARTIFACT_PATH:-无}
任务摘要: ${TASK_SUMMARY}

请执行以下核查：
1. 读取产出物文件，检查质量
2. 根据核查类型(${QA_TYPE})使用对应checklist
3. 将核查报告写入 /root/.openclaw/workspace/reports/qa-${SAFE_LABEL}-${QA_DATE}.md
4. 报告格式：评级(通过/有条件通过/不通过) + 问题列表 + 改进建议
注意：所有文件路径使用绝对路径。这是自动触发的QA，label以qa-开头。"

  # 后台派发，不阻塞主流程
  (
    QA_LOCK="/tmp/auto-qa-spawn.lock"
    (
      flock -w 5 200 || exit 1
      # 注册到看板
      bash /root/.openclaw/workspace/scripts/register-task.sh \
        "$QA_LABEL" "$QA_LABEL" "$QA_AGENT" "auto-qa" "质量核查: ${LABEL}" 2>/dev/null || true
    ) 200>"$QA_LOCK"

    echo "$(date -Iseconds) 派发QA: task=${LABEL} agent=${QA_AGENT} label=${QA_LABEL}" >> "$QA_SPAWN_LOG"

    openclaw agent --agent "$QA_AGENT" --message "$QA_MESSAGE" --timeout 300 >> "$QA_SPAWN_LOG" 2>&1 || {
      echo "$(date -Iseconds) ❌ CLI spawn失败" >> "$QA_SPAWN_LOG"
      echo "{\"label\":\"$QA_LABEL\",\"agent\":\"$QA_AGENT\",\"task\":\"$LABEL\",\"failed_at\":\"$(date -Iseconds)\"}" \
        > "/tmp/qa-pending-${SAFE_LABEL}.json"
    }
  ) &

  echo "QA_DISPATCHED:${QA_AGENT}:${QA_LABEL}:${AUTO_QA_FILE}"
  exit 0
else
  # 全忙，写pending等heartbeat处理
  echo "{\"label\":\"$LABEL\",\"qa_label\":\"$QA_LABEL\",\"qa_type\":\"$QA_TYPE\",\"artifact_path\":\"${ARTIFACT_PATH}\",\"queue_file\":\"$AUTO_QA_FILE\",\"created_at\":\"$(date -Iseconds)\"}" \
    > "/tmp/qa-pending-${SAFE_LABEL}.json"

  echo "QA_PENDING:${QA_LABEL}:${AUTO_QA_FILE}"
  exit 0
fi
