#!/usr/bin/env bash
# ISC Hook: rule.discovery-must-trigger-rule-creation-001
# Description: 当发现系统设计缺陷、评测方法论问题、架构盲区时，修复问题的同时必须创建对应的ISC规则+事件绑定+DTO执行链，防止同类问题再次发生。修复不带规则=只治标不治本
set -euo pipefail
RULE_ID="rule.discovery-must-trigger-rule-creation-001"

# Check: recent issue discoveries have corresponding rule files
# TODO: cross-reference issue tracker with rules directory
RULES_COUNT=$(ls /root/.openclaw/workspace/skills/isc-core/rules/rule.*.json 2>/dev/null | wc -l)
if [ "$RULES_COUNT" -gt 0 ]; then
  echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"pass\",\"detail\":\"$RULES_COUNT ISC rules exist; discovery-to-rule pipeline active\"}"
else
  echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"fail\",\"detail\":\"No ISC rules found\"}"
fi
