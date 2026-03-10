#!/usr/bin/env bash
set -euo pipefail

SCRIPTS_DIR="${1:-scripts}"
SKILLS_DIR="${2:-skills}"

if [[ ! -d "$SCRIPTS_DIR" ]]; then
  echo '{"ok":false,"error":"scripts directory not found","wild_scripts":[]}'
  exit 2
fi

skill_docs=$(find "$SKILLS_DIR" -type f -name 'SKILL.md' 2>/dev/null || true)
wild='[]'

while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  ref=0
  while IFS= read -r md; do
    [[ -z "$md" ]] && continue
    if grep -Fq "${f#./}" "$md" || grep -Fq "$f" "$md" || grep -Fq "$(basename "$f")" "$md"; then
      ref=1
      break
    fi
  done <<< "$skill_docs"

  if (( ref == 0 )); then
    wild=$(printf '%s' "$wild" | jq --arg file "$f" '. + [{script:$file}]')
  fi
done < <(find "$SCRIPTS_DIR" -type f \( -name '*.sh' -o -name '*.py' -o -name '*.js' -o -name '*.ts' \) | sort)

count=$(printf '%s' "$wild" | jq 'length')
if (( count > 0 )); then
  jq -n --arg dir "$SCRIPTS_DIR" --argjson count "$count" --argjson wild_scripts "$wild" '{ok:false,scripts_dir:$dir,wild_count:$count,wild_scripts:$wild_scripts}'
  exit 1
else
  jq -n --arg dir "$SCRIPTS_DIR" '{ok:true,scripts_dir:$dir,wild_count:0,wild_scripts:[]}'
  exit 0
fi
