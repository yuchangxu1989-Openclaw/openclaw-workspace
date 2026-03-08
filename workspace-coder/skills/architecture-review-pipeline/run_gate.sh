#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: run_gate.sh <evaluation.json>" >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

python3 "$ROOT/.openclaw/gate_closed_book_eval.py" "$1"
python3 "$ROOT/.openclaw/gate_intent_eval.py" "$1"

echo "PASS: all hard gates satisfied."
