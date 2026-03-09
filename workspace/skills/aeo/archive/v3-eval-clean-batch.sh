#!/bin/bash
# 批量清洗所有c2-golden下的JSON文件
DIR="/root/.openclaw/workspace/tests/benchmarks/intent/c2-golden"
for f in "$DIR"/*.json; do
  echo "=== 清洗: $(basename $f) ==="
  node /root/.openclaw/workspace/scripts/v3-eval-clean.js "$f"
  echo ""
done
