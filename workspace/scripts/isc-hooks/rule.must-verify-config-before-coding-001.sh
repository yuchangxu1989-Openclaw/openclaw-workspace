#!/usr/bin/env bash
set -euo pipefail
RULE_ID="rule.must-verify-config-before-coding-001"
WORKSPACE="/root/.openclaw/workspace"

# 检测: 代码中是否有硬编码的API key/URL模式
CODE_DIRS="$WORKSPACE/scripts $WORKSPACE/skills"
HARDCODED=$(grep -rn -E '(sk-[a-zA-Z0-9]{20,}|https?://api\.[a-z]+\.com/v[0-9])' $CODE_DIRS --include='*.sh' --include='*.py' --include='*.js' --include='*.ts' 2>/dev/null | grep -v 'node_modules' | head -10)
if [ -n "$HARDCODED" ]; then
  COUNT=$(echo "$HARDCODED" | wc -l)
  echo '{"rule_id":"'$RULE_ID'","status":"fail","detail":"Found '$COUNT' potential hardcoded API keys/URLs in code"}'
else
  echo '{"rule_id":"'$RULE_ID'","status":"pass","detail":"No hardcoded API keys/URLs detected"}'
fi

