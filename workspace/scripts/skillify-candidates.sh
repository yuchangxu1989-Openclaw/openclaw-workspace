#!/usr/bin/env bash
# skillify-candidates.sh — 技能发现→技能化闭环执行器
# 读取发现器报告，为缺少SKILL.md的候选目录自动创建技能骨架
set -euo pipefail

WORKSPACE="${WORKSPACE:-/root/.openclaw/workspace}"
REPORT="$WORKSPACE/reports/misplaced-code-report.json"
LOG="$WORKSPACE/logs/skillify-candidates.log"
CREATED=0
NOW=$(date '+%Y-%m-%dT%H:%M:%S+08:00')

mkdir -p "$(dirname "$LOG")"

# 阶段一：为 skills/ 下缺 SKILL.md 的目录补全
for dir in "$WORKSPACE/skills"/*/; do
  [ -d "$dir" ] || continue
  [ -f "$dir/SKILL.md" ] && continue
  name=$(basename "$dir")
  
  # 跳过明显的非技能目录
  [[ "$name" == _* ]] && continue
  [[ "$name" == "node_modules" ]] && continue
  
  # 检查是否有实质代码（至少一个 .js/.sh/.py 文件）
  code_files=$(find "$dir" -maxdepth 2 -type f \( -name '*.js' -o -name '*.sh' -o -name '*.py' -o -name '*.cjs' \) 2>/dev/null | head -1)
  [ -z "$code_files" ] && continue
  
  # 推断描述：从目录里找 README 或 package.json
  desc="Auto-discovered skill from $name"
  if [ -f "$dir/package.json" ]; then
    pkg_desc=$(node -e "try{console.log(require('$dir/package.json').description||'')}catch{}" 2>/dev/null || true)
    [ -n "$pkg_desc" ] && desc="$pkg_desc"
  elif [ -f "$dir/README.md" ]; then
    desc=$(head -3 "$dir/README.md" | grep -v '^#' | grep -v '^$' | head -1 || echo "$desc")
  fi
  
  cat > "$dir/SKILL.md" << EOF
---
name: $name
description: $desc
version: "0.1.0"
status: discovered
created_by: skillify-candidates
created_at: $NOW
---

# $name

$desc

> 本文件由技能发现闭环自动生成，请补充详细文档。
EOF
  
  echo "$NOW [CREATED] $name — SKILL.md generated" >> "$LOG"
  CREATED=$((CREATED + 1))
done

# 阶段二：为 scripts/ 下有子目录+代码的创建技能骨架
for dir in "$WORKSPACE/scripts"/*/; do
  [ -d "$dir" ] || continue
  name=$(basename "$dir")
  [[ "$name" == "isc-hooks" ]] && continue
  [[ "$name" == "node_modules" ]] && continue
  
  # 已有SKILL.md则跳过
  [ -f "$dir/SKILL.md" ] && continue
  
  # 需要有实质脚本
  code_files=$(find "$dir" -maxdepth 1 -type f \( -name '*.js' -o -name '*.sh' -o -name '*.py' \) 2>/dev/null | wc -l)
  [ "$code_files" -eq 0 ] && continue
  
  cat > "$dir/SKILL.md" << EOF
---
name: $name
description: Script collection discovered in scripts/$name
version: "0.1.0"
status: discovered
created_by: skillify-candidates
created_at: $NOW
---

# $name

Script collection discovered in scripts/$name.

> 本文件由技能发现闭环自动生成。建议迁移到 skills/ 目录。
EOF
  
  echo "$NOW [CREATED] scripts/$name — SKILL.md generated" >> "$LOG"
  CREATED=$((CREATED + 1))
done

# 输出
if [ "$CREATED" -gt 0 ]; then
  echo "✅ 技能化完成：$CREATED 个候选已生成 SKILL.md"
  
  # 发射事件
  EVENT_BUS="$WORKSPACE/infrastructure/event-bus/events.jsonl"
  if [ -d "$(dirname "$EVENT_BUS")" ]; then
    echo "{\"type\":\"seef.skillify.completed\",\"timestamp\":\"$NOW\",\"data\":{\"created\":$CREATED}}" >> "$EVENT_BUS"
  fi
else
  echo "无新候选需要技能化"
fi
