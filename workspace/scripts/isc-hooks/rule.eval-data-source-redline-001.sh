#!/usr/bin/env bash
# ISC Hook: rule.eval-data-source-redline-001
# Description: 评测数据只有两个合法来源：1)真实对话（你我之间的会话记录）2)网络搜索（真实用户场景、公开数据）。绝对禁止合成/想象/编造。
set -euo pipefail
RULE_ID="rule.eval-data-source-redline-001"

# Check: eval datasets don't contain synthetic markers
EVAL_DIR="/root/.openclaw/workspace/eval"
if [ -d "$EVAL_DIR" ]; then
  SYNTHETIC=$(grep -rl "synthetic\|generated\|fabricated\|imagined" "$EVAL_DIR"/*.json "$EVAL_DIR"/**/*.json 2>/dev/null | wc -l)
  if [ "$SYNTHETIC" -gt 0 ]; then
    echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"fail\",\"detail\":\"$SYNTHETIC eval files may contain synthetic data markers\"}"
  else
    echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"pass\",\"detail\":\"No synthetic data markers in eval datasets\"}"
  fi
else
  echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"pass\",\"detail\":\"No eval directory found\"}"
fi
