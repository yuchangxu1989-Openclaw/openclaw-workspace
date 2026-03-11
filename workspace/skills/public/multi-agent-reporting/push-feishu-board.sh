#!/bin/bash
# push-feishu-board-v6.sh — 重写版：sessions.json为唯一数据源
# 解决：label显示UUID、模型空、running数不准、耗时错误

set -euo pipefail

DEDUP_DIR="/tmp/feishu-board-push-dedup"
mkdir -p "$DEDUP_DIR"
DEDUP_FILE="$DEDUP_DIR/last-push-ts"
DONE_FILE="$DEDUP_DIR/done-sessions.txt"
BOARD_FILE="/root/.openclaw/workspace/logs/subagent-task-board.json"
SESSIONS_FILE="/root/.openclaw/agents/main/sessions/sessions.json"

# 防抖3秒（可用 --force 跳过）
if [ "${1:-}" != "--force" ]; then
  NOW_TS=$(date +%s)
  if [ -f "$DEDUP_FILE" ]; then
    LAST_TS=$(cat "$DEDUP_FILE" 2>/dev/null || echo 0)
    if [ $((NOW_TS - LAST_TS)) -lt 3 ]; then echo "⏭️ 防抖"; exit 0; fi
  fi
fi

touch "$DONE_FILE"

FEISHU_APP_ID="cli_a92f2a545838dcc8"
FEISHU_APP_SECRET="r5ERTp7T0JdxwzuEJ4HkzeCdAr7GLpeC"
FEISHU_RECEIVE_ID="ou_a113e465324cc55f9ab3348c9a1a7b9b"
DATE_STR=$(TZ=Asia/Shanghai date "+%Y-%m-%d %H:%M")

# 核心逻辑：Node生成看板数据
BOARD_JSON=$(node -e "
const fs = require('fs');
const sessions = JSON.parse(fs.readFileSync('$SESSIONS_FILE','utf8'));
const doneSet = new Set(fs.readFileSync('$DONE_FILE','utf8').split('\n').filter(Boolean));
const now = Date.now();

// 从board.json取历史统计
let histDone=0, histTimeout=0, histFailed=0;
try {
  const board = JSON.parse(fs.readFileSync('$BOARD_FILE','utf8'));
  for (const t of board) {
    if (t.status==='done'||t.status==='archived') histDone++;
    else if (t.status==='timeout') histTimeout++;
    else if (t.status==='failed') histFailed++;
  }
} catch(e) {}

// 从sessions.json提取subagent
const running = [];
let doneCount = doneSet.size;

for (const [key, val] of Object.entries(sessions)) {
  if (!key.includes(':subagent:')) continue;
  
  const label = val.label || key.split(':subagent:')[1].substring(0,12);
  
  // 判断是否已完成
  if (doneSet.has(label) || doneSet.has(key) || doneSet.has(val.sessionId)) continue;
  if (val.abortedLastRun) { doneCount++; continue; }
  
  // 判断是否活跃（2小时内有更新）
  const age = now - (val.updatedAt || 0);
  if (age > 2 * 3600 * 1000) continue; // 超过2小时认为已结束
  
  // 计算耗时
  const ageMin = Math.floor(age / 60000);
  const duration = ageMin >= 60 ? Math.floor(ageMin/60)+'h'+(ageMin%60).toString().padStart(2,'0')+'m' : ageMin+'m';
  
  // 模型：从session取，清理前缀
  let model = val.model || val.contextModel || '';
  model = model.replace(/^claude-[^/]+\//,'').replace(/^boom-[^/]+\//,'').substring(0,25);
  if (!model) model = '-';
  
  // thinking标记
  const think = val.thinkingLevel ? ' 🧠' : '';
  
  running.push({
    task: label,
    model: model + think,
    status: '🟢运行中',
    duration: duration
  });
}

// 按耗时排序（最新的在前）
running.sort((a,b) => {
  const parseMin = s => {
    const h = s.match(/(\d+)h/); const m = s.match(/(\d+)m/);
    return (h?parseInt(h[1])*60:0) + (m?parseInt(m[1]):0);
  };
  return parseMin(a.duration) - parseMin(b.duration);
});

const totalDone = Math.max(histDone, doneCount);
const summary = '✅完成 '+totalDone+' | ⏰超时 '+histTimeout+' | ❌失败 '+histFailed+' | 🟢运行 '+running.length;

console.log(JSON.stringify({rows: running, running: running.length, summary}));
" 2>&1)

if [ -z "$BOARD_JSON" ] || ! echo "$BOARD_JSON" | jq . >/dev/null 2>&1; then
  echo "❌ 看板数据生成失败: $BOARD_JSON"
  exit 1
fi

# 获取飞书Token
TENANT_TOKEN=$(curl -s -X POST "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal" \
  -H "Content-Type: application/json" \
  -d "{\"app_id\":\"$FEISHU_APP_ID\",\"app_secret\":\"$FEISHU_APP_SECRET\"}" | jq -r '.tenant_access_token // empty')
if [ -z "$TENANT_TOKEN" ]; then echo "❌ token失败"; exit 1; fi

RUNNING_COUNT=$(echo "$BOARD_JSON" | jq -r '.running')
SUMMARY=$(echo "$BOARD_JSON" | jq -r '.summary')
ROW_COUNT=$(echo "$BOARD_JSON" | jq '.rows | length')

if [ "$ROW_COUNT" -gt 0 ]; then
  ELEMENTS=$(echo "$BOARD_JSON" | jq --arg rc "$RUNNING_COUNT" --arg summary "$SUMMARY" '[
    {tag:"markdown",content:("**🤖 Agent并行数："+$rc+"**")},
    {tag:"table",page_size:50,row_height:"low",
     header_style:{text_align:"left",bold:true,background_style:"blue"},
     columns:[
       {name:"task",display_name:"任务",width:"auto",data_type:"text"},
       {name:"model",display_name:"模型",width:"auto",data_type:"text"},
       {name:"status",display_name:"状态",width:"auto",data_type:"text"},
       {name:"duration",display_name:"耗时",width:"auto",data_type:"text"}
     ],rows:.rows},
    {tag:"markdown",content:$summary}]')
else
  ELEMENTS=$(jq -n --arg summary "$SUMMARY" '[
    {tag:"markdown",content:"**🤖 Agent并行数：0**"},
    {tag:"markdown",content:"暂无运行中任务"},
    {tag:"markdown",content:$summary}]')
fi

PAYLOAD=$(jq -n --arg rid "$FEISHU_RECEIVE_ID" --arg date "$DATE_STR" --argjson elements "$ELEMENTS" '{
  receive_id:$rid, msg_type:"interactive",
  content:({config:{wide_screen_mode:true},
    header:{title:{tag:"plain_text",content:("📋 Agent任务看板（"+$date+"）")},template:"blue"},
    elements:$elements} | tostring)}')

SEND_RESP=$(curl -s -X POST "https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id" \
  -H "Authorization: Bearer $TENANT_TOKEN" -H "Content-Type: application/json" -d "$PAYLOAD")

CODE=$(echo "$SEND_RESP" | jq -r '.code // 0')
if [ "$CODE" = "0" ]; then
  echo "$(date +%s)" > "$DEDUP_FILE"
  echo "✅ 看板v6推送成功 (running=$RUNNING_COUNT)"
else
  echo "❌ 推送失败: $(echo "$SEND_RESP" | jq -r '.msg // "unknown"')"
  exit 1
fi
