#!/bin/bash
# auto-grant-feishu-perm.sh
# 用法: auto-grant-feishu-perm.sh <doc_token> [doc_type]
# 创建飞书文档后调用此脚本，自动给长煦加full_access权限
# doc_type默认docx，也支持sheet/bitable等

DOC_TOKEN="$1"
DOC_TYPE="${2:-docx}"
OWNER_OPENID="ou_a113e465324cc55f9ab3348c9a1a7b9b"

if [ -z "$DOC_TOKEN" ]; then
  echo "用法: $0 <doc_token> [doc_type]"
  exit 1
fi

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
  echo "ERROR: 获取token失败"
  exit 1
fi

# 授权
RESULT=$(curl -s -X POST "https://open.feishu.cn/open-apis/drive/v1/permissions/${DOC_TOKEN}/members?type=${DOC_TYPE}" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"member_type\":\"openid\",\"member_id\":\"${OWNER_OPENID}\",\"perm\":\"full_access\"}")

CODE=$(echo "$RESULT" | jq -r '.code')
if [ "$CODE" = "0" ]; then
  echo "OK: ${DOC_TOKEN} full_access granted"
else
  echo "FAIL: ${DOC_TOKEN} code=${CODE} msg=$(echo $RESULT | jq -r '.msg')"
  exit 1
fi
