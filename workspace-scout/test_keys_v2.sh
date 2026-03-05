#!/bin/bash

BASE_URL="https://api.penguinsaichat.dpdns.org"

KEYS=(
  "sk-24LCF1n3IIor3At7xvetBv0oZyJYD51ATB28ODQOx56SZm8G"
  "sk-pz2MCBYWSbenZsqgVCfZDRzEaR3TUwQBQgSZxXS3jBbBSPz1"
  "sk-zGcFUDNZXL13QC69oJDup9qYK2Bf4lKbfW5RTXaP3tRuhy3A"
  "sk-T0jcshzeikmkTdVWVIjke42rXAbBGC8Ksd84gMKNx3zNU7XD"
  "sk-FwxTN0iPYmOeC4aj3JLkLfGMko7lorzcOW1U3zw7XPgNXiQX"
  "sk-qqFyIfNM1ujGH8oyD3XxyssK8c4cszwvsqiPMeZTpirzAJlw"
  "sk-dvtADlEkFXgJQNB9CAXQwSPEukS34ErSDyyHOL9w3Fyb2rTh"
  "sk-wKu5zI0zmxAdqjqluPo2VD2LeKhZ8oC68wfGYPuHuLnm746N"
)

KEY_LABELS=(
  "sk-24LCF1n3..."
  "sk-pz2MCBYW..."
  "sk-zGcFUDNZ..."
  "sk-T0jcshze..."
  "sk-FwxTN0iP..."
  "sk-qqFyIfNM..."
  "sk-dvtADlEk..."
  "sk-wKu5zI0z..."
)

MODELS=(
  "claude-opus-4-6-thinking"
  "claude-opus-4-6"
  "claude-sonnet-4-6-thinking"
  "claude-sonnet-4-6"
  "claude-opus-4.5"
  "claude-sonnet-4.5"
)

echo "Testing against: $BASE_URL"
echo ""

for ki in "${!KEYS[@]}"; do
  key="${KEYS[$ki]}"
  label="${KEY_LABELS[$ki]}"
  echo "=== Key #$((ki+1)) ($label) ==="
  
  for model in "${MODELS[@]}"; do
    if [[ "$model" == *"-thinking"* ]]; then
      BODY='{
        "model": "'"$model"'",
        "max_tokens": 128,
        "thinking": {"type": "enabled", "budget_tokens": 100},
        "messages": [{"role": "user", "content": "Say OK"}]
      }'
    else
      BODY='{
        "model": "'"$model"'",
        "max_tokens": 64,
        "messages": [{"role": "user", "content": "Say OK"}]
      }'
    fi
    
    RESPONSE=$(curl -s -w "\nHTTPCODE:%{http_code}" \
      --connect-timeout 15 \
      --max-time 60 \
      -H "x-api-key: $key" \
      -H "anthropic-version: 2023-06-01" \
      -H "content-type: application/json" \
      -d "$BODY" \
      "${BASE_URL}/v1/messages" 2>&1)
    
    HTTP_CODE=$(echo "$RESPONSE" | grep "HTTPCODE:" | sed 's/HTTPCODE://')
    RESP_BODY=$(echo "$RESPONSE" | grep -v "HTTPCODE:")
    
    if [[ "$HTTP_CODE" == "200" ]]; then
      # Check if response actually has content
      HAS_CONTENT=$(echo "$RESP_BODY" | grep -c '"content"')
      if [[ "$HAS_CONTENT" -gt 0 ]]; then
        result="✅"
      else
        result="⚠️ (200 but no content)"
      fi
    else
      ERR_TYPE=$(echo "$RESP_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('error',{}).get('type','') or d.get('error',{}).get('message','unknown'))" 2>/dev/null || echo "unknown")
      result="❌ ($HTTP_CODE: $ERR_TYPE)"
    fi
    
    echo "  $model | $result"
    sleep 1
  done
  
  echo ""
done

echo "=== DONE ==="
