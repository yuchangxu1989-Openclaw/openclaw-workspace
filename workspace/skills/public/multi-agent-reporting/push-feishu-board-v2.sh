#!/bin/bash
# push-feishu-board-v2.sh - 直接从openclaw sessions获取实时数据推送看板
# 不依赖subagent-task-board.json

DEDUP_DIR="/tmp/feishu-board-push-dedup"
mkdir -p "$DEDUP_DIR"
DEDUP_FILE="$DEDUP_DIR/last-push-ts"
NOW_TS=$(date +%s)
if [ -f "$DEDUP_FILE" ]; then
  LAST_TS=$(cat "$DEDUP_FILE" 2>/dev/null || echo 0)
  DIFF=$((NOW_TS - LAST_TS))
  if [ "$DIFF" -lt 3 ]; then
    echo "⏭️ 3秒防抖跳过"
    exit 0
  fi
fi

DATE_STR=$(TZ=Asia/Shanghai date +%Y-%m-%d)
# 从.env.feishu读取密钥
ENV_FILE="/root/.openclaw/workspace/.env.feishu"
if [ -f "$ENV_FILE" ]; then
  set -a; source "$ENV_FILE"; set +a
fi
FEISHU_APP_ID="${FEISHU_APP_ID:?缺少FEISHU_APP_ID}"
FEISHU_APP_SECRET="${FEISHU_APP_SECRET:?缺少FEISHU_APP_SECRET}"
FEISHU_RECEIVE_ID="${FEISHU_RECEIVE_ID:?缺少FEISHU_RECEIVE_ID}"

# 直接从openclaw获取活跃子Agent
LIVE_JSON=$(openclaw sessions --active 60 --json 2>/dev/null)

BOARD_JSON=$(node -e "
const live = JSON.parse(process.argv[1]);
const sessions = (live.sessions || []).filter(s => s.key && s.key.includes(':subagent:') && !s.abortedLastRun);
const board = JSON.parse(require('fs').readFileSync('/root/.openclaw/workspace/logs/subagent-task-board.json','utf8'));
const now = Date.now();

// running = 活跃session中非aborted的
const rows = sessions.map(s => {
  const id = s.key.split(':subagent:')[1] || '';
  // 尝试从board找label
  const boardEntry = board.find(t => t.taskId === id || (t.sessionId && t.sessionId === s.sessionId));
  const label = (boardEntry && boardEntry.label) || (boardEntry && boardEntry.description) || ('sub-' + id.substring(0,8));
  const ageMin = Math.floor((s.ageMs || 0) / 60000);
  const duration = ageMin >= 60 ? Math.floor(ageMin/60)+'h'+ageMin%60+'m' : ageMin+'m';
  return {task: label, model: (s.model||'').replace('claude-main/',''), status: '🟢运行中', duration};
});

// 历史统计从board取
const done = board.filter(t => t.status==='done').length;
const timeout = board.filter(t => t.status==='timeout').length;
const failed = board.filter(t => t.status==='failed').length;
const summary = '✅完成 '+done+' | ⏰超时 '+timeout+' | ❌失败 '+failed;

console.log(JSON.stringify({rows, running: rows.length, done, failed, summary}));
" "$LIVE_JSON" 2>/dev/null)

if [ -z "$BOARD_JSON" ]; then
  BOARD_JSON='{"rows":[],"running":0,"done":0,"failed":0,"summary":"看板生成失败"}'
fi

# 获取token
TOKEN_RESP=$(curl -s -X POST "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal" \
  -H "Content-Type: application/json" \
  -d "{\"app_id\":\"$FEISHU_APP_ID\",\"app_secret\":\"$FEISHU_APP_SECRET\"}")
TENANT_TOKEN=$(echo "$TOKEN_RESP" | jq -r '.tenant_access_token // empty' 2>/dev/null)
if [ -z "$TENANT_TOKEN" ]; then echo "❌ token失败"; exit 1; fi

RUNNING_COUNT=$(echo "$BOARD_JSON" | jq -r '.running')
SUMMARY=$(echo "$BOARD_JSON" | jq -r '.summary')
ROWS=$(echo "$BOARD_JSON" | jq -c '.rows')
ROW_COUNT=$(echo "$BOARD_JSON" | jq '.rows | length')

if [ "$ROW_COUNT" -gt 0 ]; then
  ELEMENTS=$(jq -n \
    --arg rc "$RUNNING_COUNT" \
    --arg summary "$SUMMARY" \
    --argjson rows "$ROWS" \
    '[
      {tag: "markdown", content: ("**Agent并行总数：" + $rc + "**")},
      {
        tag: "table",
        page_size: 50,
        row_height: "low",
        header_style: {text_align: "left", bold: true, background_style: "blue"},
        columns: [
          {name: "task", display_name: "任务", width: "auto", data_type: "text"},
          {name: "model", display_name: "模型", width: "auto", data_type: "text"},
          {name: "status", display_name: "状态", width: "auto", data_type: "text"},
          {name: "duration", display_name: "耗时", width: "auto", data_type: "text"}
        ],
        rows: $rows
      },
      {tag: "markdown", content: $summary}
    ]')
else
  ELEMENTS=$(jq -n \
    --arg rc "$RUNNING_COUNT" \
    --arg summary "$SUMMARY" \
    '[
      {tag: "markdown", content: ("**Agent并行总数：" + $rc + "**")},
      {tag: "markdown", content: "暂无运行中任务"},
      {tag: "markdown", content: $summary}
    ]')
fi

PAYLOAD=$(jq -n \
  --arg rid "$FEISHU_RECEIVE_ID" \
  --arg date "$DATE_STR" \
  --argjson elements "$ELEMENTS" \
  '{
    receive_id: $rid,
    msg_type: "interactive",
    content: ({
      config: {wide_screen_mode: true},
      header: {
        title: {tag: "plain_text", content: ("📋 Agent任务看板（" + $date + "）")},
        template: "blue"
      },
      elements: $elements
    } | tostring)
  }')

SEND_RESP=$(curl -s -X POST "https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id" \
  -H "Authorization: Bearer $TENANT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

SEND_CODE=$(echo "$SEND_RESP" | jq -r '.code // 0' 2>/dev/null)
if [ "$SEND_CODE" = "0" ]; then
  echo "$NOW_TS" > "$DEDUP_FILE"
  echo "✅ 看板v2已推送"
else
  echo "❌ 推送失败: $SEND_RESP"
fi
