#!/usr/bin/env bash
# auto-skill-discovery.sh — 技能发现器 v2
# 归属技能: SEEF (自我进化引擎)
# 三阶段: 野生脚本发现 → 代码归属审计 → 重复文件检测
set -euo pipefail

WORKSPACE="${WORKSPACE:-/root/.openclaw/workspace}"
REPORT_DIR="$WORKSPACE/reports"
REPORT_FILE="$REPORT_DIR/misplaced-code-report.json"
mkdir -p "$REPORT_DIR"

NOW=$(date '+%Y-%m-%dT%H:%M:%S+08:00')

# Collect all skill directory names
SKILL_NAMES=()
for d in "$WORKSPACE/skills"/*/; do
  [ -d "$d" ] && SKILL_NAMES+=("$(basename "$d")")
done
# Also check skills/public/
for d in "$WORKSPACE/skills/public"/*/; do
  [ -d "$d" ] && SKILL_NAMES+=("$(basename "$d")")
done

# ═══════════════════════════════════════════════════
# 阶段一：野生脚本发现
# ═══════════════════════════════════════════════════
echo "── 阶段一：野生脚本发现 ──"

WILD_SCRIPTS_JSON=""
WILD_COUNT=0

if [ -d "$WORKSPACE/scripts" ]; then
  for script in "$WORKSPACE/scripts"/*.sh "$WORKSPACE/scripts"/*.js "$WORKSPACE/scripts"/*.py; do
    [ -f "$script" ] || continue
    lines=$(wc -l < "$script")
    [ "$lines" -le 50 ] && continue

    # Check if script imports/requires a specific skill
    suggested=""
    content=$(cat "$script" 2>/dev/null || true)
    for sname in "${SKILL_NAMES[@]}"; do
      if echo "$content" | grep -qP "require\(.*skills/(public/)?$sname|from ['\"].*skills/(public/)?$sname|skills/(public/)?$sname/"; then
        suggested="$sname"
        break
      fi
    done

    fname=$(basename "$script")
    entry="{\"file\":\"scripts/$fname\",\"lines\":$lines,\"suggestedSkill\":$([ -n "$suggested" ] && echo "\"$suggested\"" || echo "null")}"
    [ "$WILD_COUNT" -gt 0 ] && WILD_SCRIPTS_JSON+=","
    WILD_SCRIPTS_JSON+="$entry"
    WILD_COUNT=$((WILD_COUNT + 1))
  done
fi

echo "  发现 $WILD_COUNT 个野生脚本（>50行）"

# ═══════════════════════════════════════════════════
# 阶段二：代码归属审计（重写）
# ═══════════════════════════════════════════════════
echo "── 阶段二：代码归属审计 ──"

MISPLACED_JSON=""
MISPLACED_COUNT=0

add_misplaced() {
  local file="$1" dir="$2" belong="$3" reason="$4"
  local entry="{\"file\":\"$file\",\"currentDir\":\"$dir\",\"shouldBelongTo\":\"$belong\",\"reason\":\"$reason\"}"
  [ "$MISPLACED_COUNT" -gt 0 ] && MISPLACED_JSON+=","
  MISPLACED_JSON+="$entry"
  MISPLACED_COUNT=$((MISPLACED_COUNT + 1))
}

# Rule 1: handlers in infrastructure/event-bus/handlers/ → NORMAL, skip
# Rule 2: scripts/ files that require a skill module → mark as migratable
# (Already covered by phase 1 with suggestedSkill, but also add to misplaced)
if [ -d "$WORKSPACE/scripts" ]; then
  for script in "$WORKSPACE/scripts"/*.sh "$WORKSPACE/scripts"/*.js "$WORKSPACE/scripts"/*.py; do
    [ -f "$script" ] || continue
    content=$(cat "$script" 2>/dev/null || true)
    for sname in "${SKILL_NAMES[@]}"; do
      if echo "$content" | grep -qP "require\(.*skills/(public/)?$sname|from ['\"].*skills/(public/)?$sname"; then
        fname=$(basename "$script")
        add_misplaced "scripts/$fname" "scripts" "$sname" "脚本require/import了技能 $sname 的模块"
        break
      fi
    done
  done
fi

# Rule 3: infrastructure/ files (excluding handlers/) used by only one skill
if [ -d "$WORKSPACE/infrastructure" ]; then
  while IFS= read -r -d '' codefile; do
    rel="${codefile#$WORKSPACE/}"
    # Skip handlers — they belong in infrastructure
    [[ "$rel" == infrastructure/event-bus/handlers/* ]] && continue

    fname=$(basename "$codefile")
    fname_noext="${fname%.*}"

    # Grep: which skills reference this file?
    referencing_skills=()
    for sname in "${SKILL_NAMES[@]}"; do
      for sdir in "$WORKSPACE/skills/$sname" "$WORKSPACE/skills/public/$sname"; do
        [ -d "$sdir" ] || continue
        if grep -rql "$fname_noext\|$fname\|$rel" "$sdir" 2>/dev/null; then
          referencing_skills+=("$sname")
          break
        fi
      done
    done

    if [ "${#referencing_skills[@]}" -eq 1 ]; then
      add_misplaced "$rel" "$(dirname "$rel")" "${referencing_skills[0]}" "仅被技能 ${referencing_skills[0]} 引用，可迁入该技能"
    fi
  done < <(find "$WORKSPACE/infrastructure" -type f \( -name '*.js' -o -name '*.sh' -o -name '*.py' \) -not -path '*/node_modules/*' -print0 2>/dev/null)
fi

echo "  发现 $MISPLACED_COUNT 个错位文件"

# ═══════════════════════════════════════════════════
# 阶段三：重复文件检测
# ═══════════════════════════════════════════════════
echo "── 阶段三：重复文件检测 ──"

DUPES_JSON=""
DUPES_COUNT=0

# Find all code files, compute md5, find duplicates
TMPFILE=$(mktemp)
find "$WORKSPACE" -type f \( -name '*.js' -o -name '*.sh' -o -name '*.py' -o -name '*.json' -o -name '*.md' \) \
  -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/reports/*' -not -path '*/logs/*' \
  -exec md5sum {} + 2>/dev/null | sort > "$TMPFILE"

# Group by md5
prev_md5="" prev_files=""
while IFS=' ' read -r md5 filepath; do
  # md5sum output: "hash  filename" (two spaces)
  filepath="${filepath#  }"
  rel="${filepath#$WORKSPACE/}"
  if [ "$md5" = "$prev_md5" ]; then
    prev_files+=",\"$rel\""
  else
    if echo "$prev_files" | grep -q ','; then
      entry="{\"files\":[$prev_files],\"md5\":\"$prev_md5\"}"
      [ "$DUPES_COUNT" -gt 0 ] && DUPES_JSON+=","
      DUPES_JSON+="$entry"
      DUPES_COUNT=$((DUPES_COUNT + 1))
    fi
    prev_md5="$md5"
    prev_files="\"$rel\""
  fi
done < "$TMPFILE"
# Don't forget the last group
if echo "$prev_files" | grep -q ','; then
  entry="{\"files\":[$prev_files],\"md5\":\"$prev_md5\"}"
  [ "$DUPES_COUNT" -gt 0 ] && DUPES_JSON+=","
  DUPES_JSON+="$entry"
  DUPES_COUNT=$((DUPES_COUNT + 1))
fi
rm -f "$TMPFILE"

echo "  发现 $DUPES_COUNT 组重复文件"

# ═══════════════════════════════════════════════════
# 输出报告
# ═══════════════════════════════════════════════════

cat > "$REPORT_FILE" <<EOF
{
  "scan_time": "$NOW",
  "wild_scripts": [$WILD_SCRIPTS_JSON],
  "misplaced": [$MISPLACED_JSON],
  "duplicates": [$DUPES_JSON]
}
EOF

echo ""
echo "📋 报告已写入: $REPORT_FILE"
echo "   野生脚本: $WILD_COUNT | 错位文件: $MISPLACED_COUNT | 重复文件组: $DUPES_COUNT"

# ── 事件总线集成 ──
EVENT_BUS_FILE="$WORKSPACE/infrastructure/event-bus/events.jsonl"
if [ -d "$(dirname "$EVENT_BUS_FILE" 2>/dev/null)" ] 2>/dev/null; then
  EVENT_TS=$(date -Iseconds)
  echo "{\"type\":\"seef.skill_discovery.completed\",\"timestamp\":\"$EVENT_TS\",\"source\":\"auto-skill-discovery\",\"data\":{\"wild_scripts\":$WILD_COUNT,\"misplaced\":$MISPLACED_COUNT,\"duplicates\":$DUPES_COUNT,\"report\":\"$REPORT_FILE\"}}" >> "$EVENT_BUS_FILE"
fi
