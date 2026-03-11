#!/bin/bash
# push-feishu-board.sh - 生成看板并直接推送到飞书（使用table组件）
# 不依赖主Agent，脚本自己调飞书API发消息

# === 去重机制：3秒防抖（同一事件连续触发时去重，不阻止正常数据变更推送） ===
DEDUP_DIR="/tmp/feishu-board-push-dedup"
mkdir -p "$DEDUP_DIR"
BOARD_FILE="/root/.openclaw/workspace/logs/subagent-task-board.json"
DEDUP_FILE="$DEDUP_DIR/last-push-ts"
NOW_TS=$(date +%s)
if [ -f "$DEDUP_FILE" ]; then
  LAST_TS=$(cat "$DEDUP_FILE" 2>/dev/null || echo 0)
  DIFF=$((NOW_TS - LAST_TS))
  if [ "$DIFF" -lt 3 ]; then
    echo "⏭️ 3秒内已推送过，防抖跳过"
    exit 0
  fi
fi

# === 同步活跃session到看板 ===
bash "$(dirname "$0")/sync-live-sessions.sh" 15 2>/dev/null || true

DATE_STR=$(TZ=Asia/Shanghai date +%Y-%m-%d)

FEISHU_APP_ID="cli_a92f2a545838dcc8"
FEISHU_APP_SECRET="r5ERTp7T0JdxwzuEJ4HkzeCdAr7GLpeC"
FEISHU_RECEIVE_ID="ou_a113e465324cc55f9ab3348c9a1a7b9b"

# Step 1: 获取JSON格式的看板数据
BOARD_JSON=$(bash /root/.openclaw/workspace/scripts/show-task-board-feishu.sh --json 2>/dev/null)
if [ -z "$BOARD_JSON" ] || ! echo "$BOARD_JSON" | jq . >/dev/null 2>&1; then
  BOARD_JSON='{"rows":[],"running":0,"done":0,"failed":0,"summary":"看板生成失败"}'
fi

# Step 2: 获取 tenant_access_token
TOKEN_RESP=$(curl -s -X POST "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal" \
  -H "Content-Type: application/json" \
  -d "{\"app_id\":\"$FEISHU_APP_ID\",\"app_secret\":\"$FEISHU_APP_SECRET\"}")

TENANT_TOKEN=$(echo "$TOKEN_RESP" | jq -r '.tenant_access_token // empty' 2>/dev/null)

if [ -z "$TENANT_TOKEN" ]; then
  echo "❌ 获取飞书token失败: $TOKEN_RESP"
  exit 1
fi

# Step 3: 构造飞书交互卡片（使用table组件替代markdown表格）
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

# Step 4: 发送消息
SEND_RESP=$(curl -s -X POST "https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id" \
  -H "Authorization: Bearer $TENANT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

SEND_CODE=$(echo "$SEND_RESP" | jq -r '.code // 0' 2>/dev/null)

if [ "$SEND_CODE" = "0" ]; then
  # 记录本次推送时间戳
  echo "$NOW_TS" > "$DEDUP_FILE"
  echo "✅ 看板已推送到飞书"
else
  echo "❌ 飞书推送失败: $SEND_RESP"
fi
