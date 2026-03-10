#!/usr/bin/env bash
# ISC Handler: rule.auto-skill-discovery-001
# 功能：扫描workspace下脚本目录，发现没有SKILL.md的目录标记为技能候选
# 协议：stdin JSON → 条件判断 → JSON输出 → 退出码(0=matched, 1=no-match, 2=error)
set -euo pipefail

WORKSPACE="/root/.openclaw/workspace"
SCRIPTS_DIR="$WORKSPACE/scripts"
SKILLS_DIR="$WORKSPACE/skills"
SIGNAL_DIR="$WORKSPACE/.skill-discovery-signals"
REPORT="$WORKSPACE/reports/skill-discovery-candidates.md"

# Read stdin event JSON (unused fields tolerated)
INPUT=$(cat)

# Collect candidate directories: any dir under scripts/ or skills/ that lacks SKILL.md
candidates=()

# Scan skills/ subdirectories
for dir in "$SKILLS_DIR"/*/; do
  [ -d "$dir" ] || continue
  if [ ! -f "$dir/SKILL.md" ]; then
    candidates+=("$(basename "$dir")|$dir")
  fi
done

# Scan scripts/ subdirectories (non-hook dirs with .sh files)
for dir in "$SCRIPTS_DIR"/*/; do
  [ -d "$dir" ] || continue
  dirname="$(basename "$dir")"
  [ "$dirname" = "isc-hooks" ] && continue
  # Has at least one .sh file and no SKILL.md
  if ls "$dir"/*.sh &>/dev/null && [ ! -f "$dir/SKILL.md" ]; then
    candidates+=("$dirname|$dir")
  fi
done

NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)

if [ ${#candidates[@]} -eq 0 ]; then
  # No candidates found
  echo "{\"rule_id\":\"rule.auto-skill-discovery-001\",\"status\":\"no-match\",\"candidates\":[],\"scanned_at\":\"$NOW\"}"
  echo "$NOW no-candidates" > "$SIGNAL_DIR/last-scan-result.txt"
  exit 1
fi

# Build JSON array and markdown report
json_arr=""
md_lines="# Skill Discovery Candidates\n\nGenerated: $NOW\n\n| Name | Path | Reason |\n|------|------|--------|\n"

for entry in "${candidates[@]}"; do
  name="${entry%%|*}"
  path="${entry#*|}"
  [ -n "$json_arr" ] && json_arr="$json_arr,"
  json_arr="$json_arr{\"name\":\"$name\",\"path\":\"$path\",\"reason\":\"missing SKILL.md\"}"
  md_lines="$md_lines| $name | $path | missing SKILL.md |\n"
done

# Write report
mkdir -p "$(dirname "$REPORT")"
printf "$md_lines" > "$REPORT"

# Write signal
echo "$NOW found=${#candidates[@]}" > "$SIGNAL_DIR/last-scan-result.txt"

# Output JSON
echo "{\"rule_id\":\"rule.auto-skill-discovery-001\",\"status\":\"matched\",\"candidate_count\":${#candidates[@]},\"candidates\":[$json_arr],\"scanned_at\":\"$NOW\",\"report\":\"$REPORT\"}"
exit 0
