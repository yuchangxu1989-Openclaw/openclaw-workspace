#!/usr/bin/env bash
set -euo pipefail

SKILL_DIR="${1:-}"
if [[ -z "$SKILL_DIR" ]]; then
  echo '{"ok":false,"error":"usage: script <new_skill_dir>","checks":{}}'
  exit 2
fi

file="$SKILL_DIR/SKILL.md"
exists=false
version_ok=false
description_ok=false

if [[ -f "$file" ]]; then
  exists=true
  if grep -Eqi '(^|[[:space:]])(version|版本)[[:space:]:：]+[^[:space:]]+' "$file"; then
    version_ok=true
  fi
  if grep -Eqi '(^|[[:space:]])(description|描述)[[:space:]:：]+.+' "$file"; then
    description_ok=true
  fi
fi

if [[ "$exists" == true && "$version_ok" == true && "$description_ok" == true ]]; then
  jq -n --arg dir "$SKILL_DIR" '{ok:true,skill_dir:$dir,checks:{skill_md_exists:true,version_present:true,description_non_empty:true}}'
  exit 0
else
  jq -n --arg dir "$SKILL_DIR" --argjson exists "$exists" --argjson version_ok "$version_ok" --argjson description_ok "$description_ok" '{ok:false,skill_dir:$dir,checks:{skill_md_exists:$exists,version_present:$version_ok,description_non_empty:$description_ok}}'
  exit 1
fi
