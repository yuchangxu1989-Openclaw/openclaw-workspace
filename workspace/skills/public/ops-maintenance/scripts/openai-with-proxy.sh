#!/bin/bash
# openai-with-proxy.sh - 临时代理调用OpenAI
# 使用方式: ./openai-with-proxy.sh "你的prompt"

PROXY_URL="http://muhwcx:in5p3kvq@96.62.177.228:42001"
API_KEY="${OPENAI_API_KEY_1}"
MODEL="gpt-5.3-codex"

if [ -z "$1" ]; then
    echo "用法: $0 '你的prompt'"
    exit 1
fi

PROMPT="$1"

# 仅此次调用使用代理
HTTPS_PROXY="$PROXY_URL" \
curl -s -X POST https://api.openai.com/v1/chat/completions \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"model\":\"$MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"$PROMPT\"}]}" \
    -m 60

echo ""
