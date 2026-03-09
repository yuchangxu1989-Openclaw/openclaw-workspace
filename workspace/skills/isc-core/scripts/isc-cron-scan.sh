#!/usr/bin/env bash
# ISC Cron扫描入口 — 批量调用所有cron类检查脚本
HOOKS_DIR="/root/.openclaw/workspace/scripts/isc-hooks"
TOTAL=0; PASS=0; FAIL=0
DETAILS="["
FIRST=true

for script in "$HOOKS_DIR"/*.sh; do
  [ ! -x "$script" ] && continue
  TOTAL=$((TOTAL+1))
  OUTPUT=$(bash "$script" 2>&1)
  EXIT_CODE=$?
  if [ "$EXIT_CODE" -eq 0 ]; then
    PASS=$((PASS+1))
  else
    FAIL=$((FAIL+1))
  fi
  [ "$FIRST" = true ] && FIRST=false || DETAILS="${DETAILS},"
  DETAILS="${DETAILS}${OUTPUT}"
done

DETAILS="${DETAILS}]"
echo "{\"total\":${TOTAL},\"pass\":${PASS},\"fail\":${FAIL},\"details\":${DETAILS}}"
exit $([ "$FAIL" -eq 0 ] && echo 0 || echo 1)
