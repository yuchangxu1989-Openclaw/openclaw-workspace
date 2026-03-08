#!/bin/bash
# test-harvest.sh — 基础测试：幂等性 + JSON格式正确性
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

# 用临时config覆盖badcase_file路径
TEST_BADCASE="$TMPDIR/badcases.json"
echo "[]" > "$TEST_BADCASE"
TEST_CONFIG="$TMPDIR/config.json"
cat "$SKILL_DIR/config.json" | node -e "
const fs=require('fs');
const c=JSON.parse(fs.readFileSync('/dev/stdin','utf8'));
c.badcase_file='$TEST_BADCASE';
c.goodcase_script='/bin/true';
c.feishu.app_id='test';
c.feishu.app_secret='test';
c.max_retries=1;
fs.writeFileSync('$TEST_CONFIG',JSON.stringify(c,null,2));
"

# 临时替换config
ORIG_CONFIG="$SKILL_DIR/config.json"
cp "$ORIG_CONFIG" "$TMPDIR/config.json.bak"
cp "$TEST_CONFIG" "$ORIG_CONFIG"
restore_config() { cp "$TMPDIR/config.json.bak" "$ORIG_CONFIG"; rm -rf "$TMPDIR"; }
trap restore_config EXIT

PASS=0
FAIL=0

# Test 1: 首次入库
echo "--- Test 1: 首次入库 ---"
OUTPUT=$(bash "$SKILL_DIR/harvest.sh" "test-001" "intent-miss" "测试描述" "wrong" "correct" "root" 2>&1)
if echo "$OUTPUT" | grep -q "✅ badcase入库成功"; then
  echo "✅ PASS: 首次入库成功"
  PASS=$((PASS+1))
else
  echo "❌ FAIL: 首次入库失败"
  echo "$OUTPUT"
  FAIL=$((FAIL+1))
fi

# Test 2: JSON格式正确性
echo "--- Test 2: JSON格式正确 ---"
if node -e "JSON.parse(require('fs').readFileSync('$TEST_BADCASE','utf8'))" 2>/dev/null; then
  echo "✅ PASS: JSON格式正确"
  PASS=$((PASS+1))
else
  echo "❌ FAIL: JSON格式错误"
  FAIL=$((FAIL+1))
fi

# Test 3: 幂等性 — 重复入库应跳过
echo "--- Test 3: 幂等性检查 ---"
OUTPUT2=$(bash "$SKILL_DIR/harvest.sh" "test-001" "intent-miss" "测试描述" "wrong" "correct" "root" 2>&1)
if echo "$OUTPUT2" | grep -q "⏭️ badcase已存在"; then
  echo "✅ PASS: 幂等性正确"
  PASS=$((PASS+1))
else
  echo "❌ FAIL: 幂等性失败"
  echo "$OUTPUT2"
  FAIL=$((FAIL+1))
fi

# Test 4: 记录数应为1（不是2）
echo "--- Test 4: 记录数验证 ---"
COUNT=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$TEST_BADCASE','utf8')).length)")
if [ "$COUNT" = "1" ]; then
  echo "✅ PASS: 记录数正确 ($COUNT)"
  PASS=$((PASS+1))
else
  echo "❌ FAIL: 记录数异常 ($COUNT)"
  FAIL=$((FAIL+1))
fi

echo ""
echo "========== 结果: $PASS passed, $FAIL failed =========="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
