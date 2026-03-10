#!/usr/bin/env bash
set -euo pipefail

FILE="${1:-MEMORY.md}"
MIN_REPEAT="${MIN_REPEAT:-2}"
TOP_N="${TOP_N:-20}"

if [[ ! -f "$FILE" ]]; then
  echo '{"ok":false,"error":"MEMORY.md not found","concepts":[]}'
  exit 2
fi

concepts=$(tr -cs '[:alnum:]\u4e00-\u9fff' '\n' < "$FILE" \
  | awk 'length($0)>=2' \
  | tr '[:upper:]' '[:lower:]' \
  | sort | uniq -c \
  | awk -v min="$MIN_REPEAT" '$1>=min {print $2"\t"$1}' \
  | sort -k2,2nr \
  | head -n "$TOP_N")

arr='[]'
while IFS=$'\t' read -r concept cnt; do
  [[ -z "${concept:-}" ]] && continue
  arr=$(printf '%s' "$arr" | jq --arg c "$concept" --argjson n "$cnt" '. + [{concept:$c,count:$n,suggestion:"升级到AGENTS.md或代码实现"}]')
done <<< "$concepts"

count=$(printf '%s' "$arr" | jq 'length')
if (( count > 0 )); then
  jq -n --arg file "$FILE" --argjson count "$count" --argjson concepts "$arr" '{ok:false,file:$file,escalation_candidates:$count,concepts:$concepts}'
  exit 1
else
  jq -n --arg file "$FILE" '{ok:true,file:$file,escalation_candidates:0,concepts:[]}'
  exit 0
fi
