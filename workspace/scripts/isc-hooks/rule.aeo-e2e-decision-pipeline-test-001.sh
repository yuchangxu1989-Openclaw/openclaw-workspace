#!/usr/bin/env bash
# ISC Hook: rule.aeo-e2e-decision-pipeline-test-001
# Description: 任何决策流水线变更必须通过端到端AEO测试：从真实事件触发→规则匹配→handler执行→结果验证，全链条真实跑通，禁止模拟数据
set -euo pipefail
RULE_ID="rule.aeo-e2e-decision-pipeline-test-001"

# Check: AEO e2e test reports exist and pass
REPORT_DIR="/root/.openclaw/workspace/reports/aeo-e2e"
if [ -d "$REPORT_DIR" ] && ls "$REPORT_DIR"/*.json 1>/dev/null 2>&1; then
  FAILURES=$(grep -rl '"status"\s*:\s*"fail"' "$REPORT_DIR" 2>/dev/null | wc -l)
  if [ "$FAILURES" -gt 0 ]; then
    echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"fail\",\"detail\":\"$FAILURES AEO e2e test report(s) with failures\"}"
  else
    echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"pass\",\"detail\":\"All AEO e2e test reports pass\"}"
  fi
else
  echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"fail\",\"detail\":\"No AEO e2e test reports found in $REPORT_DIR\"}"
fi
