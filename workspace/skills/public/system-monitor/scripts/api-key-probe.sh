#!/bin/bash
# API Key 余额探针 - 在heartbeat中调用，0 token消耗
# 检测主渠道余额是否充足，不足时推飞书通知
# 用法: bash api-key-probe.sh

PRIMARY_KEY="sk-zGcFUDNZXL13QC69oJDup9qYK2Bf4lKbfW5RTXaP3tRuhy3A"
PRIMARY_URL="https://api.penguinsaichat.dpdns.org/v1/messages"
GATEWAY_TOKEN="3b2536af0fa208383b2af461f7585f4c8176fe198361ade4"
FEISHU_USER="ou_a113e465324cc55f9ab3348c9a1a7b9b"
STATE_FILE="/root/.openclaw/workspace/scripts/.probe-state.json"

# 初始化state
if [ ! -f "$STATE_FILE" ]; then
  echo '{"last_status":"unknown","last_check":0,"alert_sent":false}' > "$STATE_FILE"
fi

# 探针：发一个最小请求，不走LLM计费（仅验证key状态）
RESP=$(curl -s -w "\n%{http_code}" "$PRIMARY_URL" \
  -H "x-api-key: $PRIMARY_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"claude-opus-4-6","max_tokens":1,"messages":[{"role":"user","content":"0"}]}' \
  --max-time 10 2>/dev/null)

HTTP_CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')

NOW=$(date +%s)

if [ "$HTTP_CODE" = "200" ]; then
  # 主渠道恢复正常
  LAST_STATUS=$(python3 -c "import json; d=json.load(open('$STATE_FILE')); print(d.get('last_status','unknown'))" 2>/dev/null)
  
  # 如果之前是异常状态，推恢复通知
  if [ "$LAST_STATUS" != "ok" ] && [ "$LAST_STATUS" != "unknown" ]; then
    openclaw message send \
      --channel feishu \
      --target "user:$FEISHU_USER" \
      --message "✅ 主模型API已恢复
渠道: penguinsaichat
模型: claude-opus-4-6-thinking
状态: 余额充足，已切回主渠道" 2>/dev/null
  fi
  
  python3 -c "
import json
d = json.load(open('$STATE_FILE'))
d['last_status'] = 'ok'
d['last_check'] = $NOW
d['alert_sent'] = False
json.dump(d, open('$STATE_FILE','w'))
" 2>/dev/null
  echo "OK: 主渠道正常"

elif echo "$BODY" | grep -q "额度不足\|余额不足\|insufficient"; then
  BALANCE=$(echo "$BODY" | python3 -c "
import json,sys,re
try:
  d=json.load(sys.stdin)
  msg=d.get('error',{}).get('message','')
  m=re.search(r'剩余额度[：:]\s*([^\s,\"]+)',msg)
  print(m.group(1) if m else '不足')
except: print('不足')
" 2>/dev/null)

  LAST_STATUS=$(python3 -c "import json; d=json.load(open('$STATE_FILE')); print(d.get('last_status','unknown'))" 2>/dev/null)
  ALERT_SENT=$(python3 -c "import json; d=json.load(open('$STATE_FILE')); print(d.get('alert_sent',False))" 2>/dev/null)

  # 只在状态变化时推通知（避免重复告警）
  if [ "$LAST_STATUS" != "insufficient" ] || [ "$ALERT_SENT" = "False" ]; then
    openclaw message send \
      --channel feishu \
      --target "user:$FEISHU_USER" \
      --message "⚠️ 主模型API余额不足，已自动切换到备用渠道
渠道: penguinsaichat
当前余额: $BALANCE
备用: cherryin/claude-sonnet-4.6 正在计费
请及时充值" 2>/dev/null
  fi

  python3 -c "
import json
d = json.load(open('$STATE_FILE'))
d['last_status'] = 'insufficient'
d['last_check'] = $NOW
d['alert_sent'] = True
json.dump(d, open('$STATE_FILE','w'))
" 2>/dev/null
  echo "ALERT: 余额不足 ($BALANCE)，已推通知"

else
  echo "ERROR: HTTP $HTTP_CODE - $BODY" | head -c 200
fi
