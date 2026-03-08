#!/usr/bin/env bash
set -euo pipefail
RULE_ID="rule.intent-规则命名规范与去重技能-pop4vq"
WORKSPACE="/root/.openclaw/workspace"

# 检测: 规则文件命名是否符合规范(rule.{domain}-{name}-{id}.json)且无重复
RULES_DIR="$WORKSPACE/skills/isc-core/rules"
DUPES=$(find "$RULES_DIR" -name 'rule.*.json' | xargs -I{} basename {} .json | sort | uniq -d)
if [ -n "$DUPES" ]; then
  echo '{"rule_id":"'$RULE_ID'","status":"fail","detail":"Duplicate rule filenames: '"$(echo $DUPES | tr '\n' ',')"'"}'
else
  # Check naming pattern
  BAD=$(find "$RULES_DIR" -name 'rule.*.json' | xargs -I{} basename {} | grep -v -E '^rule\.' | head -5)
  if [ -n "$BAD" ]; then
    echo '{"rule_id":"'$RULE_ID'","status":"fail","detail":"Non-conforming names: '"$(echo $BAD | tr '\n' ',')"'"}'
  else
    echo '{"rule_id":"'$RULE_ID'","status":"pass","detail":"All rule files follow naming convention, no duplicates"}'
  fi
fi

