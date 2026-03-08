#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORKSPACE_ROOT="$(cd "$ROOT/.." && pwd)"

echo "[1/6] hard-gate self tests"
bash "$ROOT/../.openclaw/tests/run_tests.sh"

echo "[2/6] capability regression"
python3 "$ROOT/scripts/test_capability_regression.py"

echo "[3/6] pb010 hardened regression"
python3 "$ROOT/scripts/test_pb010_hardened.py"

echo "[4/6] batch benchmark regression"
python3 "$ROOT/scripts/test_batch_benchmark_runner.py"

echo "[5/6] benchmark smoke"
python3 "$ROOT/scripts/benchmark_runner.py" \
  --case "$ROOT/examples/benchmark_case_pass.json" \
  --runtime "$ROOT/examples/closed_book_pass.json" \
  --out "$ROOT/examples/.smoke-out.json" >/dev/null

echo "[6/6] publish silence watchdog regression"
node "$WORKSPACE_ROOT/skills/evomap-publisher/test_publish_silence_watchdog.js"

echo "✅ hard-gate + principle-e2e capability + PB-010 hardened + batch regression + smoke + publish watchdog passed"
