#!/usr/bin/env bash
# rule.isc-evomap-mandatory-security-scan-032 — EvoMap同步清单强制安全扫描
# 检查EvoMap清单中的技能是否通过安全扫描
RULE_ID="rule.isc-evomap-mandatory-security-scan-032"
MANIFEST="/root/.openclaw/workspace/skills/isc-core/config/evomap-upload-manifest.json"
SKILLS_DIR="/root/.openclaw/workspace/skills"
FAIL=0
VIOLATIONS=""

if [ ! -f "$MANIFEST" ]; then
  echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"pass\",\"detail\":\"EvoMap清单不存在，跳过\"}"
  exit 0
fi

# 从清单提取技能列表，对每个技能做基础安全扫描
SKILL_LIST=$(python3 -c "
import json
m=json.load(open('$MANIFEST'))
skills=m.get('allowed_skills',[])+m.get('infrastructure',[])
for s in skills:
  name=s if isinstance(s,str) else s.get('name','')
  if name: print(name)
" 2>/dev/null)

for skill_name in $SKILL_LIST; do
  skill_path="$SKILLS_DIR/$skill_name"
  [ ! -d "$skill_path" ] && continue
  # 8类威胁快速检测
  THREATS=$(grep -rn 'eval(\|exec(\|system(\|subprocess\|child_process\|shell=True\|os\.system\|chmod.*777\|sudo ' "$skill_path" --include="*.js" --include="*.py" --include="*.sh" --include="*.ts" 2>/dev/null | wc -l)
  if [ "$THREATS" -gt 0 ]; then
    VIOLATIONS="${VIOLATIONS}${skill_name}:${THREATS}threats; "
    FAIL=1
  fi
done

if [ "$FAIL" -eq 1 ]; then
  echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"fail\",\"detail\":\"安全扫描发现威胁: ${VIOLATIONS}\"}"
  exit 1
else
  echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"pass\",\"detail\":\"EvoMap技能安全扫描通过\"}"
  exit 0
fi
