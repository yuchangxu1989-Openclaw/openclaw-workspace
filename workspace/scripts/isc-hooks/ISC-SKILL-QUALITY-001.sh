#!/usr/bin/env bash
# ISC-SKILL-QUALITY-001 — skill_no_placeholder
# 扫描所有技能目录，检测占位符技能
RULE_ID="ISC-SKILL-QUALITY-001"
SKILLS_DIR="/root/.openclaw/workspace/skills"
VIOLATIONS=""
FAIL=0

for skill_dir in "$SKILLS_DIR"/*/; do
  [ ! -d "$skill_dir" ] && continue
  skill_name=$(basename "$skill_dir")
  SKILL_MD="$skill_dir/SKILL.md"
  
  # 检查SKILL.md是否存在且内容>100字
  if [ ! -f "$SKILL_MD" ]; then
    VIOLATIONS="${VIOLATIONS}${skill_name}:missing_SKILL.md; "
    FAIL=1
    continue
  fi
  
  CHAR_COUNT=$(wc -c < "$SKILL_MD" 2>/dev/null || echo 0)
  if [ "$CHAR_COUNT" -lt 100 ]; then
    VIOLATIONS="${VIOLATIONS}${skill_name}:SKILL.md<100chars; "
    FAIL=1
    continue
  fi
  
  # 检查是否有可执行代码文件
  CODE_FILES=$(find "$skill_dir" -maxdepth 2 \( -name "*.js" -o -name "*.py" -o -name "*.sh" -o -name "*.ts" \) -size +0c 2>/dev/null | head -1)
  # 不强制要求代码文件，SKILL.md充分即可
done

if [ "$FAIL" -eq 1 ]; then
  echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"fail\",\"detail\":\"占位符技能: ${VIOLATIONS}\"}"
  exit 1
else
  echo "{\"rule_id\":\"$RULE_ID\",\"status\":\"pass\",\"detail\":\"所有技能均有实质内容\"}"
  exit 0
fi
