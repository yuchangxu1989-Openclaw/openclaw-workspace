#!/usr/bin/env bash
# feishu-doc-verify — 飞书文档创建/写入后验证非空
# 用法: feishu-doc-verify.sh <doc_token>
# 输出: JSON {"doc_token":"...", "block_count":N, "verified":bool, "message":"..."}
set -euo pipefail

DOC_TOKEN="${1:?用法: $0 <doc_token>}"

# 从.env.feishu读取密钥
ENV_FILE="/root/.openclaw/workspace/.env.feishu"
if [ -f "$ENV_FILE" ]; then
  set -a; source "$ENV_FILE"; set +a
fi
FEISHU_APP_ID="${FEISHU_APP_ID:?缺少FEISHU_APP_ID}"
FEISHU_APP_SECRET="${FEISHU_APP_SECRET:?缺少FEISHU_APP_SECRET}"

# 获取tenant_access_token
TOKEN=$(curl -s -X POST 'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal' \
  -H 'Content-Type: application/json' \
  -d "{\"app_id\":\"$FEISHU_APP_ID\",\"app_secret\":\"$FEISHU_APP_SECRET\"}" | jq -r '.tenant_access_token')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo '{"doc_token":"'"$DOC_TOKEN"'","block_count":0,"verified":false,"message":"获取token失败"}'
  exit 1
fi

# 获取文档blocks
RESULT=$(curl -s -X GET "https://open.feishu.cn/open-apis/docx/v1/documents/${DOC_TOKEN}/blocks" \
  -H "Authorization: Bearer $TOKEN")

CODE=$(echo "$RESULT" | jq -r '.code')
if [ "$CODE" != "0" ]; then
  MSG=$(echo "$RESULT" | jq -r '.msg')
  echo "{\"doc_token\":\"$DOC_TOKEN\",\"block_count\":0,\"verified\":false,\"message\":\"API错误: $MSG\"}"
  exit 1
fi

BLOCK_COUNT=$(echo "$RESULT" | jq '.data.items | length')

if [ "$BLOCK_COUNT" -gt 1 ]; then
  echo "{\"doc_token\":\"$DOC_TOKEN\",\"block_count\":$BLOCK_COUNT,\"verified\":true,\"message\":\"文档验证通过\"}"
  exit 0
else
  echo "{\"doc_token\":\"$DOC_TOKEN\",\"block_count\":$BLOCK_COUNT,\"verified\":false,\"message\":\"文档为空或仅有根block，block_count=$BLOCK_COUNT\"}"
  exit 1
fi
