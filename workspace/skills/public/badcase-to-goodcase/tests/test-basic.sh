#!/usr/bin/env bash
# 基本测试：创建临时badcase，运行翻转，验证输出非空
set -euo pipefail

TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

mkdir -p "$TMPDIR"
cat > "$TMPDIR/test-badcase.json" <<'EOF'
[{"id":"bc-001","input":"帮我查天气","expected_behavior":"调用天气API","actual_behavior":"回复不知道","root_cause":"意图未识别","difficulty":"C2"}]
EOF

# 修改脚本中的目录指向临时目录运行
sed "s|DIR=.*|DIR=\"$TMPDIR\"|" "$(dirname "$0")/../index.sh" | bash

if [ -f "$TMPDIR/goodcases-from-badcases.json" ]; then
  COUNT=$(python3 -c "import json; print(len(json.load(open('$TMPDIR/goodcases-from-badcases.json'))))")
  if [ "$COUNT" -ge 1 ]; then
    echo "PASS: 生成 $COUNT 个goodcase"
    exit 0
  fi
fi
echo "FAIL: 未生成goodcase"
exit 1
