#!/usr/bin/env bash
# badcase→goodcase 自动翻转（全量扫描版）
# 扫描 c2-golden/ 下所有json文件，翻转为goodcase
# 翻转成功后自动推飞书通知
# 触发方式：ISC rule badcase-auto-flip-001 / pre-commit hook / 手动

set -euo pipefail
DIR="/root/.openclaw/workspace/tests/benchmarks/intent/c2-golden"
OUT="$DIR/goodcases-from-badcases.json"

# 飞书通知配置
FEISHU_APP_ID="cli_a92f2a545838dcc8"
FEISHU_APP_SECRET="r5ERTp7T0JdxwzuEJ4HkzeCdAr7GLpeC"
FEISHU_RECEIVE_ID="ou_a113e465324cc55f9ab3348c9a1a7b9b"
MAX_RETRIES=3

# 增量翻转逻辑：只翻转新badcase，追加到现有文件
FLIP_RESULT=$(python3 -c "
import json, os, glob, sys

src_dir = '$DIR'
out_path = '$OUT'

# 1. 读取现有goodcase，提取已翻转的badcase_id集合
existing_goodcases = []
existing_badcase_ids = set()
if os.path.exists(out_path):
    try:
        existing_goodcases = json.load(open(out_path))
        if not isinstance(existing_goodcases, list):
            existing_goodcases = []
        for gc in existing_goodcases:
            bid = gc.get('original_badcase_id', '')
            if bid:
                existing_badcase_ids.add(bid)
    except:
        existing_goodcases = []

# 2. 扫描所有badcase，只翻转不在已有集合中的新badcase
new_goodcases = []
for fpath in sorted(glob.glob(f'{src_dir}/*.json')):
    fname = os.path.basename(fpath)
    if fname == 'goodcases-from-badcases.json':
        continue
    try:
        cases = json.load(open(fpath))
        if not isinstance(cases, list): continue
    except: continue

    for c in cases:
        if not isinstance(c, dict): continue
        cid = c.get('id', fname.replace('.json',''))
        # 去重：跳过已翻转的badcase
        if cid in existing_badcase_ids:
            continue
        exp = c.get('expected_behavior') or c.get('expected_chain') or c.get('expected_output') or ''
        act = c.get('actual_behavior') or c.get('actual_chain') or ''
        rc = c.get('root_cause', '')
        inp = c.get('input', '')
        ctx = c.get('context', '')
        if not exp or not inp: continue
        new_goodcases.append({
            'id': f'goodcase-{cid}',
            'input': inp,
            'context': ctx,
            'expected_output': exp,
            'scoring_rubric': f'系统应执行: {exp[:100]}',
            'negative_example': act,
            'root_cause_to_avoid': rc,
            'difficulty': c.get('difficulty', 'C2'),
            'source': 'badcase_flip',
            'original_badcase_id': cid,
            'original_file': fname
        })

# 3. 追加新goodcase到现有列表，写入文件
all_goodcases = existing_goodcases + new_goodcases
json.dump(all_goodcases, open(out_path, 'w'), ensure_ascii=False, indent=2)

# 4. 输出摘要：只包含本次新增的
summary_items = []
for gc in new_goodcases:
    summary_items.append({
        'goodcase_id': gc['id'],
        'badcase_id': gc['original_badcase_id'],
        'desc': gc['input'][:80]
    })
json.dump({'count': len(new_goodcases), 'total': len(all_goodcases), 'items': summary_items}, sys.stdout, ensure_ascii=False)
")

FLIP_COUNT=$(echo "$FLIP_RESULT" | python3 -c "import json,sys; print(json.load(sys.stdin)['count'])")
TOTAL_COUNT=$(echo "$FLIP_RESULT" | python3 -c "import json,sys; print(json.load(sys.stdin)['total'])")
LATEST_INFO=$(echo "$FLIP_RESULT" | python3 -c "
import json,sys
data=json.load(sys.stdin)
if data['items']:
    it=data['items'][-1]
    print(f\"{it['goodcase_id']} (来源: {it['badcase_id']})\")
else:
    print('无')
")
echo "翻转完成: 新增${FLIP_COUNT}条, 累计${TOTAL_COUNT}条goodcase"
echo "最新: ${LATEST_INFO}"

# 无翻转结果则跳过通知
if [ "$FLIP_COUNT" -eq 0 ]; then
  echo "无goodcase产出，跳过飞书通知"
  exit 0
fi

# 构造通知正文（只展示最新翻转的1条）
NOTIFY_BODY=$(echo "$FLIP_RESULT" | python3 -c "
import json, sys, os
data = json.load(sys.stdin)
lines = ['✅ 新Goodcase入库', '', f'今日新增 {data[\"count\"]} 条goodcase（累计 {data[\"total\"]} 条）']
if data['items']:
    it = data['items'][-1]
    lines.append('')
    lines.append(f'最新入库:')
    lines.append(f'• ID: {it[\"goodcase_id\"]}')
    lines.append(f'• 来源Badcase: {it[\"badcase_id\"]}')
    lines.append(f'• 描述: {it[\"desc\"]}')
print('\n'.join(lines))
")

# 推飞书通知（带重试）
echo "📤 推送Goodcase入库飞书通知..."
RETRY=0
SENT=false
while [ "$RETRY" -lt "$MAX_RETRIES" ] && [ "$SENT" = "false" ]; do
  TENANT_TOKEN=$(curl -s -X POST "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal" \
    -H "Content-Type: application/json" \
    -d "{\"app_id\":\"$FEISHU_APP_ID\",\"app_secret\":\"$FEISHU_APP_SECRET\"}" | \
    node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));console.log(d.tenant_access_token||'')" 2>/dev/null || true)

  if [ -n "$TENANT_TOKEN" ]; then
    MSG_CONTENT=$(node -e "
const body = require('fs').readFileSync('/dev/stdin','utf8');
process.stdout.write(JSON.stringify(JSON.stringify({text: body})));
" <<< "$NOTIFY_BODY")
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id" \
      -H "Authorization: Bearer $TENANT_TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"receive_id\":\"$FEISHU_RECEIVE_ID\",\"msg_type\":\"text\",\"content\":$MSG_CONTENT}" 2>/dev/null || echo "000")
    if [ "$HTTP_CODE" = "200" ]; then
      SENT=true
      echo "✅ Goodcase入库飞书通知已发送"
    fi
  fi

  if [ "$SENT" = "false" ]; then
    RETRY=$((RETRY + 1))
    [ "$RETRY" -lt "$MAX_RETRIES" ] && echo "⚠️ 重试飞书通知 ($RETRY/$MAX_RETRIES)..." && sleep 2
  fi
done

if [ "$SENT" = "false" ]; then
  echo "⚠️ Goodcase飞书通知发送失败(已重试${MAX_RETRIES}次)"
fi
