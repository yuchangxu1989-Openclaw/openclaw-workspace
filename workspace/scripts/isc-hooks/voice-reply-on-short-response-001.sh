#!/usr/bin/env bash
set -euo pipefail

TEXT="${1:-}"
THRESHOLD="${THRESHOLD:-20}"

if [[ -z "$TEXT" ]]; then
  if [ ! -t 0 ]; then
    TEXT="$(cat)"
  fi
fi

if [[ -z "$TEXT" ]]; then
  echo '{"ok":false,"error":"empty response text"}'
  exit 2
fi

len=$(printf '%s' "$TEXT" | wc -m | awk '{print $1}')
if (( len < THRESHOLD )); then
  jq -n --arg text "$TEXT" --argjson length "$len" --argjson threshold "$THRESHOLD" '{ok:false,length:$length,threshold:$threshold,suggest_voice:true,message:"回复过短，建议使用语音回复"}'
  exit 1
else
  jq -n --argjson length "$len" --argjson threshold "$THRESHOLD" '{ok:true,length:$length,threshold:$threshold,suggest_voice:false}'
  exit 0
fi
