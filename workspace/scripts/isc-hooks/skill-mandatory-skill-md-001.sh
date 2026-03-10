#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-skills}"
if [[ ! -d "$ROOT" ]]; then
  echo '{"ok":false,"error":"skills directory not found","missing":[]}'
  exit 2
fi

missing="[]"
while IFS= read -r d; do
  [[ "$d" == "$ROOT" ]] && continue
  if [[ ! -f "$d/SKILL.md" ]]; then
    missing=$(printf '%s' "$missing" | jq --arg dir "$d" '. + [{dir:$dir}]')
  fi
done < <(find "$ROOT" -mindepth 1 -maxdepth 1 -type d | sort)

count=$(printf '%s' "$missing" | jq 'length')
if (( count > 0 )); then
  jq -n --arg root "$ROOT" --argjson count "$count" --argjson missing "$missing" '{ok:false,root:$root,missing_count:$count,missing:$missing}'
  exit 1
else
  jq -n --arg root "$ROOT" '{ok:true,root:$root,missing_count:0,missing:[]}'
  exit 0
fi
