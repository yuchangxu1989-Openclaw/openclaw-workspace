#!/usr/bin/env bash
# ISC Hook: rule.intent-aeo-quality-gate-001
# Description: 意图识别系统的任何变更（新增意图类型、修改识别逻辑、更换模型）必须通过AEO评测准出：黄金评测集自动化测试通过 + Badcase主动根因分析完成。评测链必须以
set -euo pipefail
RULE_ID="rule.intent-aeo-quality-gate-001"

# Check: intent system changes have AEO evaluation reports
EVAL_REPORTS="/root/.openclaw/workspace/reports/aeo"
INTENT_CHANGES=$(cd /root/.openclaw/workspace && git log --oneline -10 --diff-filter=M -- "skills/*/intent*" "skills/isc-core/rules/rule.intent*" 2>/dev/null | wc -l)
if [ "$INTENT_CHANGES" -gt 0 ]; then
  if [ -d "$EVAL_REPORTS" ] && [ "$(ls -A "$EVAL_REPORTS" 2>/dev/null)" ]; then
    echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"pass\",\"detail\":\"Intent changes detected with AEO reports present\"}"
  else
    echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"fail\",\"detail\":\"Intent changes without AEO evaluation reports\"}"
  fi
else
  echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"pass\",\"detail\":\"No recent intent system changes\"}"
fi
