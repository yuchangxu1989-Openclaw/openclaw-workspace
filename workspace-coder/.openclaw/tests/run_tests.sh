#!/usr/bin/env bash
# Test runner for hard gates
# Verifies both ISC-CLOSED-BOOK-001 and ISC-INTENT-EVAL-001
set -uo pipefail

# Resolve to workspace-coder root
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WS_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

CLOSED_BOOK_GATE="$WS_ROOT/.openclaw/gate_closed_book_eval.py"
INTENT_GATE="$WS_ROOT/.openclaw/gate_intent_eval.py"
TESTS_DIR="$WS_ROOT/.openclaw/tests"
PASS_COUNT=0
FAIL_COUNT=0

run_test() {
  local desc="$1" cmd="$2" expected_exit="$3"
  local actual_exit output
  output=$(eval "$cmd" 2>&1)
  actual_exit=$?
  if [[ $actual_exit -eq $expected_exit ]]; then
    echo "✅ PASS: $desc (exit=$actual_exit)"
    ((PASS_COUNT++))
  else
    echo "❌ FAIL: $desc — expected exit=$expected_exit, got exit=$actual_exit"
    echo "   output: $output"
    ((FAIL_COUNT++))
  fi
}

echo "=== Hard Gate Verification ==="
echo ""

echo "-- Closed-book gate --"
run_test "Closed-book compliant eval should PASS" \
  "python3 $CLOSED_BOOK_GATE $TESTS_DIR/test_closed_book_pass.json" 0
run_test "Closed-book disabled should FAIL" \
  "python3 $CLOSED_BOOK_GATE $TESTS_DIR/test_closed_book_fail_disabled.json" 1
run_test "Forbidden reference path in checked list should FAIL" \
  "python3 $CLOSED_BOOK_GATE $TESTS_DIR/test_closed_book_fail_forbidden_checked.json" 1
run_test "Forbidden reference accessed should FAIL" \
  "python3 $CLOSED_BOOK_GATE $TESTS_DIR/test_closed_book_fail_accessed.json" 1
run_test "Non-existent file should FAIL" \
  "python3 $CLOSED_BOOK_GATE $TESTS_DIR/nonexistent.json" 2

echo ""
echo "-- Intent-eval gate --"
run_test "Valid LLM-based eval should PASS" \
  "python3 $INTENT_GATE $TESTS_DIR/test_pass.json" 0
run_test "Non-LLM basis should FAIL" \
  "python3 $INTENT_GATE $TESTS_DIR/test_fail_no_llm.json" 1
run_test "Empty evidence should FAIL" \
  "python3 $INTENT_GATE $TESTS_DIR/test_fail_missing_evidence.json" 1
run_test "Missing intent_basis entirely should FAIL" \
  "python3 $INTENT_GATE $TESTS_DIR/test_fail_no_intent_basis.json" 1
run_test "Gate status != PASS should FAIL" \
  "python3 $INTENT_GATE $TESTS_DIR/test_fail_gate_not_pass.json" 1

echo ""
echo "=== Results: $PASS_COUNT passed, $FAIL_COUNT failed ==="
if [[ $FAIL_COUNT -gt 0 ]]; then
  echo "⛔ Hard gate verification FAILED"
  exit 1
else
  echo "✅ All hard gate tests passed — fail-closed enforcement is active"
  exit 0
fi
