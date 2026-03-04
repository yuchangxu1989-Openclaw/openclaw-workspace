#!/bin/bash
KEY="REDACTED_CLAUDE_API_KEY"
URL="https://api.penguinsaichat.dpdns.org/v1/messages"

RESP=$(curl -s -w "\n%{http_code}" "$URL" \
  -H "x-api-key: $KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"claude-opus-4-6","max_tokens":10,"messages":[{"role":"user","content":"ok"}]}')

HTTP_CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | head -1)

if [ "$HTTP_CODE" = "200" ]; then
  echo "OK"
elif echo "$BODY" | grep -q "额度不足"; then
  BALANCE=$(echo "$BODY" | grep -o '剩余额度: [^"]*' | head -1)
  echo "INSUFFICIENT:$BALANCE"
else
  MSG=$(echo "$BODY" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('error',{}).get('message','unknown')[:80])" 2>/dev/null)
  echo "ERROR:$MSG"
fi
