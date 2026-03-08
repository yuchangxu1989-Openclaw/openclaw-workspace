#!/usr/bin/env bash
# 测试：无参数调用应报错
set -euo pipefail

if bash "$(dirname "$0")/../index.sh" 2>/dev/null; then
  echo "FAIL: 无参数应返回非零退出码"
  exit 1
fi
echo "PASS: 无参数正确报错"
exit 0
