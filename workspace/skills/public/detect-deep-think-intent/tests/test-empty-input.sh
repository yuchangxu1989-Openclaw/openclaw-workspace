#!/usr/bin/env bash
# 测试：空输入应返回 should_delegate=false
set -euo pipefail

OUTPUT=$(echo "" | bash "$(dirname "$0")/../index.sh" 2>&1 || true)
if echo "$OUTPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['should_delegate']==False" 2>/dev/null; then
  echo "PASS: 空输入返回should_delegate=false"
  exit 0
fi
echo "FAIL: 空输入未正确处理"
exit 1
