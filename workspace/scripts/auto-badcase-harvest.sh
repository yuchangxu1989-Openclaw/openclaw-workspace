#!/bin/bash
# auto-badcase-harvest.sh - 自动badcase采集引擎
# 用法: auto-badcase-harvest.sh <badcase_id> <category> <description> <wrong_chain> <correct_chain> <root_cause>
# 幂等：同一badcase_id不重复入库

set -euo pipefail

BADCASE_ID="${1:-}"
CATEGORY="${2:-}"
DESCRIPTION="${3:-}"
WRONG_CHAIN="${4:-}"
CORRECT_CHAIN="${5:-}"
ROOT_CAUSE="${6:-}"

if [ -z "$BADCASE_ID" ] || [ -z "$CATEGORY" ] || [ -z "$DESCRIPTION" ]; then
  echo "用法: auto-badcase-harvest.sh <badcase_id> <category> <description> <wrong_chain> <correct_chain> <root_cause>"
  exit 1
fi

BADCASE_FILE="/root/.openclaw/workspace/tests/benchmarks/intent/c2-golden/00-real-badcases.json"
SCRIPT_DIR="/root/.openclaw/workspace/scripts"

# Step 1: 幂等检查
if [ -f "$BADCASE_FILE" ]; then
  EXISTS=$(node -e "
const cases = JSON.parse(require('fs').readFileSync('$BADCASE_FILE','utf8'));
console.log(cases.some(c => c.id === '$BADCASE_ID') ? 'yes' : 'no');
" 2>/dev/null || echo "no")
  if [ "$EXISTS" = "yes" ]; then
    echo "⏭️ badcase已存在，跳过: $BADCASE_ID"
    exit 0
  fi
fi

# Step 2: 构造badcase记录并追加
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
node -e "
const fs = require('fs');
const file = '$BADCASE_FILE';
let cases = [];
try { cases = JSON.parse(fs.readFileSync(file, 'utf8')); } catch(e) {}

cases.push({
  id: '$BADCASE_ID',
  input: $(node -e "process.stdout.write(JSON.stringify('$DESCRIPTION'))"),
  context: $(node -e "process.stdout.write(JSON.stringify('$WRONG_CHAIN'))"),
  expected_behavior: $(node -e "process.stdout.write(JSON.stringify('$CORRECT_CHAIN'))"),
  actual_behavior: $(node -e "process.stdout.write(JSON.stringify('$WRONG_CHAIN'))"),
  badcase_category: $(node -e "process.stdout.write(JSON.stringify('$CATEGORY'))"),
  root_cause: $(node -e "process.stdout.write(JSON.stringify('$ROOT_CAUSE'))"),
  data_source: 'auto-harvest',
  difficulty: 'C2',
  source: 'auto-harvest-engine',
  harvested_at: '$TIMESTAMP'
});

fs.writeFileSync(file, JSON.stringify(cases, null, 2));
console.log('✅ badcase入库成功: $BADCASE_ID (total: ' + cases.length + ')');
"

# Step 3: 自动翻转为goodcase
echo "🔄 翻转goodcase..."
bash "$SCRIPT_DIR/badcase-to-goodcase.sh" 2>/dev/null || echo "⚠️ goodcase翻转失败(非致命)"

# Step 4: 推飞书通知
echo "📤 推送飞书通知..."
FEISHU_APP_ID="cli_a92f2a545838dcc8"
FEISHU_APP_SECRET="r5ERTp7T0JdxwzuEJ4HkzeCdAr7GLpeC"
FEISHU_RECEIVE_ID="ou_a113e465324cc55f9ab3348c9a1a7b9b"

TENANT_TOKEN=$(curl -s -X POST "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal" \
  -H "Content-Type: application/json" \
  -d "{\"app_id\":\"$FEISHU_APP_ID\",\"app_secret\":\"$FEISHU_APP_SECRET\"}" | \
  node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));console.log(d.tenant_access_token||'')" 2>/dev/null)

if [ -n "$TENANT_TOKEN" ]; then
  MSG_CONTENT=$(node -e "
process.stdout.write(JSON.stringify(JSON.stringify({
  text: '🚨 新Badcase入库\\n\\nID: $BADCASE_ID\\n分类: $CATEGORY\\n描述: $DESCRIPTION\\n根因: $ROOT_CAUSE\\n时间: $TIMESTAMP'
})))
")
  curl -s -X POST "https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id" \
    -H "Authorization: Bearer $TENANT_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"receive_id\":\"$FEISHU_RECEIVE_ID\",\"msg_type\":\"text\",\"content\":$MSG_CONTENT}" >/dev/null 2>&1
  echo "✅ 飞书通知已发送"
else
  echo "⚠️ 飞书通知发送失败(token获取失败)"
fi

echo "🎯 auto-badcase-harvest 完成: $BADCASE_ID"
