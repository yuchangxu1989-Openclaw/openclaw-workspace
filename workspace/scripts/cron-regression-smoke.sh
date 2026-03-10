#!/usr/bin/env bash
# cron-regression-smoke.sh — Daily smoke test for 8 cron fixes (2026-03-10)
# Prevents regression on issues fixed today.
# Cron: 0 6 * * * /root/.openclaw/workspace/scripts/cron-regression-smoke.sh >> /root/.openclaw/workspace/infrastructure/logs/cron-smoke.log 2>&1

set -euo pipefail
PASS=0; FAIL=0; TOTAL=8
WS=/root/.openclaw/workspace

echo "=========================================="
echo "🔥 Cron Regression Smoke Test"
echo "   $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "=========================================="

run_test() {
  local name="$1"; shift
  local output rc
  output=$("$@" 2>&1) && rc=0 || rc=$?
  echo "$output" | tail -20  # context for logs
  printf -v _OUT "%s" "$output"
  eval "_RC=$rc"
}

# 1. api-probe
echo -e "\n[1/8] api-probe"
run_test "api-probe" node "$WS/scripts/api-probe.js"
if [ "$_RC" -eq 0 ] && ! echo "$_OUT" | grep -qi "SyntaxError"; then
  echo "✅ api-probe: exit 0, no SyntaxError"; ((PASS++))
else
  echo "❌ api-probe: exit=$_RC or SyntaxError found"; ((FAIL++))
fi

# 2. session-cleanup
echo -e "\n[2/8] session-cleanup"
run_test "session-cleanup" bash "$WS/skills/public/ops-maintenance/scripts/session-cleanup-governor.sh"
if [ "$_RC" -eq 0 ] && ! echo "$_OUT" | grep -qi "KeyError"; then
  echo "✅ session-cleanup: exit 0, no KeyError"; ((PASS++))
else
  echo "❌ session-cleanup: exit=$_RC or KeyError found"; ((FAIL++))
fi

# 3. pipeline-auto-recovery
echo -e "\n[3/8] pipeline-auto-recovery"
run_test "pipeline-auto-recovery" node "$WS/skills/lto-core/core/pipeline-auto-recovery.js"
if [ "$_RC" -eq 0 ] && ! echo "$_OUT" | grep -qi "MODULE_NOT_FOUND"; then
  echo "✅ pipeline-auto-recovery: exit 0, no MODULE_NOT_FOUND"; ((PASS++))
else
  echo "❌ pipeline-auto-recovery: exit=$_RC or MODULE_NOT_FOUND found"; ((FAIL++))
fi

# 4. weekly-evolution (syntax check only)
echo -e "\n[4/8] weekly-evolution (bash -n)"
run_test "weekly-evolution" bash -n "$WS/scripts/long-horizon/weekly-evolution-report.sh"
if [ "$_RC" -eq 0 ]; then
  echo "✅ weekly-evolution: syntax OK"; ((PASS++))
else
  echo "❌ weekly-evolution: syntax error (exit=$_RC)"; ((FAIL++))
fi

# 5. unknown-unknowns
echo -e "\n[5/8] unknown-unknowns"
run_test "unknown-unknowns" node "$WS/infrastructure/self-check/unknown-unknowns-scanner.js"
if ! echo "$_OUT" | grep -qi "handler_not_found"; then
  echo "✅ unknown-unknowns: no handler_not_found"; ((PASS++))
else
  echo "❌ unknown-unknowns: handler_not_found detected"; ((FAIL++))
fi

# 6. dead-skill-detector (must finish within 30s)
echo -e "\n[6/8] dead-skill-detector (timeout 30s)"
run_test "dead-skill-detector" timeout 30 bash "$WS/infrastructure/self-check/dead-skill-detector.sh"
if [ "$_RC" -eq 0 ]; then
  echo "✅ dead-skill-detector: completed within 30s"; ((PASS++))
elif [ "$_RC" -eq 124 ]; then
  echo "❌ dead-skill-detector: TIMED OUT (hung >30s)"; ((FAIL++))
else
  echo "❌ dead-skill-detector: exit=$_RC"; ((FAIL++))
fi

# 7. cras-double-print (no duplicate lines)
echo -e "\n[7/8] cras-double-print"
run_test "cras-double-print" node "$WS/infrastructure/cras/cras-daily-aggregator.js"
DUP_COUNT=$(echo "$_OUT" | sort | uniq -d | wc -l)
if [ "$DUP_COUNT" -eq 0 ]; then
  echo "✅ cras-double-print: no duplicate lines"; ((PASS++))
else
  echo "❌ cras-double-print: $DUP_COUNT duplicate line(s) found"; ((FAIL++))
fi

# 8. day-completion-scanner
echo -e "\n[8/8] day-completion-scanner"
run_test "day-completion-scanner" node "$WS/infrastructure/self-check/day-completion-scanner.js"
if [ "$_RC" -eq 0 ]; then
  echo "✅ day-completion-scanner: exit 0"; ((PASS++))
else
  echo "❌ day-completion-scanner: exit=$_RC"; ((FAIL++))
fi

# Summary
echo -e "\n=========================================="
echo "📊 Result: $PASS/$TOTAL passed, $FAIL failed"
echo "=========================================="
exit $FAIL
