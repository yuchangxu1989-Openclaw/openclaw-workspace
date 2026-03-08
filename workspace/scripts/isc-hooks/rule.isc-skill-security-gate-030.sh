#!/usr/bin/env bash
# rule.isc-skill-security-gate-030 — 技能安全准出标准
# 对所有技能执行8类威胁检测
RULE_ID="rule.isc-skill-security-gate-030"
SKILLS_DIR="/root/.openclaw/workspace/skills"
FAIL=0
VIOLATIONS=""

for skill_dir in "$SKILLS_DIR"/*/; do
  [ ! -d "$skill_dir" ] && continue
  skill_name=$(basename "$skill_dir")
  
  # Snyk 8类威胁检测模式
  THREATS=$(grep -rn \
    -e 'eval(' -e 'exec(' -e 'system(' -e 'subprocess\.call' -e 'child_process' \
    -e 'shell=True' -e 'os\.system' -e 'os\.popen' \
    -e 'chmod.*777' -e 'sudo ' -e 'setuid' \
    -e 'api[_-]\?key.*=.*["'"'"']' \
    -e 'password.*=.*["'"'"']' \
    "$skill_dir" --include="*.js" --include="*.py" --include="*.ts" 2>/dev/null | \
    grep -v 'node_modules' | grep -v '\.min\.' | wc -l)
  
  if [ "$THREATS" -gt 0 ]; then
    VIOLATIONS="${VIOLATIONS}${skill_name}:${THREATS}; "
    FAIL=1
  fi
done

if [ "$FAIL" -eq 1 ]; then
  echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"fail\",\"detail\":\"安全威胁检测: ${VIOLATIONS}\"}"
  exit 1
else
  echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"pass\",\"detail\":\"所有技能通过8类威胁检测\"}"
  exit 0
fi
