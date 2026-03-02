#!/bin/bash

# 8 keys
KEYS=(
  "sk-24LCF1n3IIor3At7xvetBv0oZyJYD51ATB28ODQOx56SZm8G"
  "sk-pz2MCBYWSbenZsqgVCfZDRzEaR3TUwQBQgSZxXS3jBbBSPz1"
  "REDACTED_CLAUDE_API_KEY"
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

# 6 models
MODELS=(
  "claude-opus-4-6-thinking"
  "claude-opus-4-6"
  "claude-sonnet-4-6-thinking"
  "claude-sonnet-4-6"
  "claude-opus-4.5"
  "claude-sonnet-4.5"
)

RESULTS_FILE="/root/.openclaw/workspace-scout/test_results.txt"
> "$RESULTS_FILE"

for ki in "${!KEYS[@]}"; do
  key="${KEYS[$ki]}"
  label="${KEY_LABELS[$ki]}"
  echo "=== Key #$((ki+1)) ($label) ===" | tee -a "$RESULTS_FILE"
  
  for model in "${MODELS[@]}"; do
    # For thinking models, need to include thinking parameter
    if [[ "$model" == *"-thinking"* ]]; then
      BODY='{
        "model": "'"$model"'",
        "max_tokens": 128,
        "thinking": {"type": "enabled", "budget_tokens": 100},
        "messages": [{"role": "user", "content": "Say hi"}]
      }'
    else
      BODY='{
        "model": "'"$model"'",
        "max_tokens": 64,
        "messages": [{"role": "user", "content": "Say hi"}]
      }'
    fi
    
    RESPONSE=$(curl -s -w "\n%{http_code}" \
      --connect-timeout 10 \
      --max-time 30 \
      -H "x-api-key: $key" \
      -H "anthropic-version: 2023-06-01" \
      -H "content-type: application/json" \
      -d "$BODY" \
      "https://api.anthropic.com/v1/messages" 2>&1)
    
    HTTP_CODE=$(echo "$RESPONSE" | tail -1)
    RESP_BODY=$(echo "$RESPONSE" | sed '$d')
    
    # Check result
    if [[ "$HTTP_CODE" == "200" ]]; then
      result="✅"
    else
      # Extract error type
      ERR_TYPE=$(echo "$RESP_BODY" | grep -o '"type":"[^"]*"' | head -1 | cut -d'"' -f4)
      ERR_MSG=$(echo "$RESP_BODY" | grep -o '"message":"[^"]*"' | head -1 | cut -d'"' -f4)
      result="❌ ($HTTP_CODE: $ERR_TYPE)"
    fi
    
    echo "$model | $result" | tee -a "$RESULTS_FILE"
    
    # Small delay to avoid rate limiting
    sleep 0.5
  done
  
  echo "" | tee -a "$RESULTS_FILE"
done

echo "DONE" | tee -a "$RESULTS_FILE"
