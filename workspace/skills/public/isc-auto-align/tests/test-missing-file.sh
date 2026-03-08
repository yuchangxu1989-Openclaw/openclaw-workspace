#!/usr/bin/env bash
# 测试：不存在的规则文件应报错
set -euo pipefail

OUTPUT=$(bash "$(dirname "$0")/../index.sh" /nonexistent/rule.json 2>&1 || true)
if echo "$OUTPUT" | grep -q "not found"; then
  echo "PASS: 不存在的文件正确报错"
  exit 0
fi
echo "FAIL: 未检测到文件不存在"
exit 1
