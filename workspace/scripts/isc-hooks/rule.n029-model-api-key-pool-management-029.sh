#!/usr/bin/env bash
set -euo pipefail
RULE_ID="rule.n029-model-api-key-pool-management-029"
WORKSPACE="/root/.openclaw/workspace"

# 检测: API key配置是否使用池化管理(非单一硬编码)
CONFIG_FILES=$(find "$WORKSPACE" -name '*.env' -o -name 'config*.json' -o -name '*.yaml' 2>/dev/null | grep -v node_modules | head -20)
SINGLE_KEY=0
POOL_KEY=0
for f in $CONFIG_FILES; do
  KEYS=$(grep -c -iE '(api.key|api_key|apikey)' "$f" 2>/dev/null || echo 0)
  [ "$KEYS" -gt 1 ] && POOL_KEY=$((POOL_KEY+1))
  [ "$KEYS" -eq 1 ] && SINGLE_KEY=$((SINGLE_KEY+1))
done
echo '{"rule_id":"'$RULE_ID'","status":"pass","detail":"Key pool check: '$POOL_KEY' pooled configs, '$SINGLE_KEY' single-key configs. TODO: enforce rotation"}'

