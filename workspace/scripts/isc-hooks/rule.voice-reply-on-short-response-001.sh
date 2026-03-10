#!/usr/bin/env bash
# ISC Handler: rule.voice-reply-on-short-response-001
# Detects reply text < 20 chars → suggests voice reply.
# Input: JSON on stdin with "text" field
# Exit 0 = triggered, Exit 1 = not triggered
set -euo pipefail

INPUT=$(cat)
TEXT=$(printf '%s' "$INPUT" | jq -r '.text // ""')
LEN=${#TEXT}

if [ "$LEN" -gt 0 ] && [ "$LEN" -lt 20 ]; then
  cat <<EOF
{"matched":true,"suggestion":"reply_as_voice","reason":"回复文本长度(${LEN}字)少于20字，建议使用语音回复。","char_count":${LEN}}
EOF
  exit 0
else
  cat <<EOF
{"matched":false,"char_count":${LEN}}
EOF
  exit 1
fi
