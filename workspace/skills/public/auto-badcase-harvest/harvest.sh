#!/bin/bash
# harvest.sh — 核心采集逻辑：幂等入库 + goodcase翻转 + 飞书通知
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "$0")" && pwd)"

BADCASE_ID="${1:-}"
CATEGORY="${2:-}"
DESCRIPTION="${3:-}"
WRONG_CHAIN="${4:-}"
CORRECT_CHAIN="${5:-}"
ROOT_CAUSE="${6:-}"
# V4评测字段（可选）
SCORING_RUBRIC="${7:-}"
NORTH_STAR_INDICATOR="${8:-}"
GATE="${9:-}"

if [ -z "$BADCASE_ID" ] || [ -z "$CATEGORY" ] || [ -z "$DESCRIPTION" ]; then
  echo "用法: harvest.sh <badcase_id> <category> <description> [wrong_chain] [correct_chain] [root_cause]"
  exit 1
fi

# 从 config.json 读取配置
CONFIG="$SKILL_DIR/config.json"
BADCASE_FILE=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$CONFIG','utf8')).badcase_file)")
GOODCASE_SCRIPT=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$CONFIG','utf8')).goodcase_script)")
FEISHU_APP_ID=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$CONFIG','utf8')).feishu.app_id)")
FEISHU_APP_SECRET=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$CONFIG','utf8')).feishu.app_secret)")
FEISHU_RECEIVE_ID=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$CONFIG','utf8')).feishu.receive_id)")
MAX_RETRIES=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$CONFIG','utf8')).max_retries||3)")
DIFFICULTY=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$CONFIG','utf8')).difficulty||'C2')")
DATA_SOURCE=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$CONFIG','utf8')).data_source||'auto-harvest')")

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
  id: $(node -e "process.stdout.write(JSON.stringify('$BADCASE_ID'))"),
  input: $(node -e "process.stdout.write(JSON.stringify('$DESCRIPTION'))"),
  context: $(node -e "process.stdout.write(JSON.stringify('$WRONG_CHAIN'))"),
  expected_behavior: $(node -e "process.stdout.write(JSON.stringify('$CORRECT_CHAIN'))"),
  actual_behavior: $(node -e "process.stdout.write(JSON.stringify('$WRONG_CHAIN'))"),
  badcase_category: $(node -e "process.stdout.write(JSON.stringify('$CATEGORY'))"),
  root_cause: $(node -e "process.stdout.write(JSON.stringify('$ROOT_CAUSE'))"),
  scoring_rubric: $(node -e "var v='$SCORING_RUBRIC'; process.stdout.write(v ? JSON.stringify(v) : 'undefined')"),
  north_star_indicator: $(node -e "var v='$NORTH_STAR_INDICATOR'; process.stdout.write(v ? JSON.stringify(v) : 'undefined')"),
  gate: $(node -e "var v='$GATE'; process.stdout.write(v ? JSON.stringify(v) : 'undefined')"),
  data_source: '$DATA_SOURCE',
  difficulty: '$DIFFICULTY',
  source: 'auto-harvest-engine',
  harvested_at: '$TIMESTAMP'
});

fs.writeFileSync(file, JSON.stringify(cases, null, 2));
console.log('✅ badcase入库成功: $BADCASE_ID (total: ' + cases.length + ')');
"

# Step 3: 自动翻转为goodcase
echo "🔄 翻转goodcase..."
bash "$GOODCASE_SCRIPT" 2>/dev/null || echo "⚠️ goodcase翻转失败(非致命)"

# Step 4: 推飞书通知（带重试）
echo "📤 推送飞书通知..."
RETRY=0
SENT=false
while [ "$RETRY" -lt "$MAX_RETRIES" ] && [ "$SENT" = "false" ]; do
  TENANT_TOKEN=$(curl -s -X POST "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal" \
    -H "Content-Type: application/json" \
    -d "{\"app_id\":\"$FEISHU_APP_ID\",\"app_secret\":\"$FEISHU_APP_SECRET\"}" | \
    node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));console.log(d.tenant_access_token||'')" 2>/dev/null || true)

  if [ -n "$TENANT_TOKEN" ]; then
    MSG_CONTENT=$(node -e "
process.stdout.write(JSON.stringify(JSON.stringify({
  text: '🚨 新Badcase入库\\n\\nID: $BADCASE_ID\\n分类: $CATEGORY\\n描述: $DESCRIPTION\\n根因: $ROOT_CAUSE\\n时间: $TIMESTAMP'
})))
")
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id" \
      -H "Authorization: Bearer $TENANT_TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"receive_id\":\"$FEISHU_RECEIVE_ID\",\"msg_type\":\"text\",\"content\":$MSG_CONTENT}" 2>/dev/null || echo "000")
    if [ "$HTTP_CODE" = "200" ]; then
      SENT=true
      echo "✅ 飞书通知已发送"
    fi
  fi

  if [ "$SENT" = "false" ]; then
    RETRY=$((RETRY + 1))
    [ "$RETRY" -lt "$MAX_RETRIES" ] && echo "⚠️ 重试飞书通知 ($RETRY/$MAX_RETRIES)..." && sleep 2
  fi
done

if [ "$SENT" = "false" ]; then
  echo "⚠️ 飞书通知发送失败(已重试${MAX_RETRIES}次)"
fi

echo "🎯 auto-badcase-harvest 完成: $BADCASE_ID"
