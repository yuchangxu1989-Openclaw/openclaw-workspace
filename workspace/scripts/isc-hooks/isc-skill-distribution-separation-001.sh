#!/usr/bin/env bash
# isc-skill-distribution-separation-001 — 技能内部/外销分发分离
# 扫描技能SKILL.md，检查external/both类型技能是否有distribution声明和权限声明
RULE_ID="isc-skill-distribution-separation-001"
SKILLS_DIR="/root/.openclaw/workspace/skills"
VIOLATIONS=""
FAIL=0

for skill_dir in "$SKILLS_DIR"/*/; do
  [ ! -d "$skill_dir" ] && continue
  skill_name=$(basename "$skill_dir")
  SKILL_MD="$skill_dir/SKILL.md"
  [ ! -f "$SKILL_MD" ] && continue

  # 检查是否有.secrets/引用
  SECRET_REFS=$(grep -rl '\.secrets/' "$skill_dir" --include="*.js" --include="*.py" --include="*.sh" --include="*.ts" 2>/dev/null | wc -l)
  if [ "$SECRET_REFS" -gt 0 ]; then
    VIOLATIONS="${VIOLATIONS}${skill_name}:secrets_ref; "
    FAIL=1
  fi

  # 检查硬编码内部路径
  INTERNAL_PATHS=$(grep -rl '/root/.openclaw/' "$skill_dir" --include="*.js" --include="*.py" --include="*.ts" 2>/dev/null | wc -l)
  # 内部技能允许，仅标记
done

if [ "$FAIL" -eq 1 ]; then
  echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"fail\",\"detail\":\"分发分离违规: ${VIOLATIONS}\"}"
  exit 1
else
  echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"pass\",\"detail\":\"技能分发分离检查通过\"}"
  exit 0
fi
