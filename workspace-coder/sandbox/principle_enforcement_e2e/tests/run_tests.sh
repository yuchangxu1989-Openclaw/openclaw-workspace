#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RUNNER="$ROOT/principle_to_enforcement_runner.py"
OUT="$ROOT/out"
TESTS="$ROOT/tests"

mkdir -p "$OUT"

run_case() {
  local name="$1" expected="$2"
  local input="$TESTS/${name}.json"
  local json_out="$OUT/${name}.result.json"
  local md_out="$OUT/${name}.report.md"
  set +e
  python3 "$RUNNER" "$input" --json-out "$json_out" --md-out "$md_out"
  local code=$?
  set -e
  if [[ "$expected" == "pass" && $code -eq 0 ]]; then
    echo "✅ $name passed as expected"
  elif [[ "$expected" == "fail" && $code -ne 0 ]]; then
    echo "✅ $name failed as expected"
  else
    echo "❌ $name unexpected exit=$code expected=$expected"
    return 1
  fi
}

run_case pass_case pass
run_case fail_case fail
run_case false_positive_case fail
run_case mismatch_case fail

echo "[extra] python regression assertions"
python3 "$ROOT/test_runner_regression.py"

echo "All sandbox principle-to-enforcement tests completed."
