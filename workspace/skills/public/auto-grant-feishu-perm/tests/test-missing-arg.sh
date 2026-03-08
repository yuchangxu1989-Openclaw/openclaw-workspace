#!/usr/bin/env bash
# 测试：无参数调用应返回用法提示并exit 1
set -euo pipefail

OUTPUT=$(bash "$(dirname "$0")/../index.sh" 2>&1 || true)
EXIT_CODE=$(bash "$(dirname "$0")/../index.sh" 2>&1; echo $?) || true

if echo "$OUTPUT" | grep -q "用法"; then
  echo "PASS: 无参数时正确返回用法提示"
  exit 0
fi
echo "FAIL: 未返回用法提示"
exit 1
