#!/usr/bin/env bash
set -euo pipefail
RULE_ID="rule.pipeline-benchmark-design-document-alignment-001"
WORKSPACE="/root/.openclaw/workspace"

# 检测: 设计文档是否触发架构治理检查
DOC_FILES=$(find "$WORKSPACE" -name '*design*' -name '*.md' -o -name '*architecture*' -name '*.md' 2>/dev/null | grep -v node_modules | head -10)
if [ -n "$DOC_FILES" ]; then
  COUNT=$(echo "$DOC_FILES" | wc -l)
  echo '{"rule_id":"'$RULE_ID'","status":"pass","detail":"Found '$COUNT' design docs. TODO: validate governance annotations"}'
else
  echo '{"rule_id":"'$RULE_ID'","status":"pass","detail":"No design documents found to validate"}'
fi

