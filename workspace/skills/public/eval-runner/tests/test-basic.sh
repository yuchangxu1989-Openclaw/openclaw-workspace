#!/bin/bash
# test-basic.sh — 用mined-r2-01.json的第1条case跑一次完整流程验证
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
CASE_FILE="/root/.openclaw/workspace/tests/benchmarks/intent/c2-golden/mined-r2-01.json"

if [ ! -f "$CASE_FILE" ]; then
  echo "SKIP: 评测集文件不存在: $CASE_FILE"
  exit 0
fi

echo "=== eval-runner 基础测试 ==="

# 提取第1条case
CASE_JSON=$(python3 -c "
import json
cases = json.load(open('$CASE_FILE'))
if isinstance(cases, list):
    print(json.dumps(cases[0], ensure_ascii=False))
else:
    print(json.dumps(cases, ensure_ascii=False))
")

echo "📋 Case ID: $(echo "$CASE_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin).get('id','unknown'))")"

# 运行单条评测
RESULT=$(node "$SKILL_DIR/scripts/eval-single-case.js" "$CASE_JSON")

echo "📊 结果:"
echo "$RESULT" | python3 -c "
import json, sys
r = json.load(sys.stdin)
print(f'  Verdict: {r[\"verdict\"]}')
print(f'  Summary: {r[\"summary\"]}')
for k, v in r.get('dimensions', {}).items():
    status = '✅' if v.get('pass') else '❌'
    print(f'  {status} {k}: {v.get(\"reason\",\"\")}')
"

echo ""
echo "✅ 基础测试通过"
