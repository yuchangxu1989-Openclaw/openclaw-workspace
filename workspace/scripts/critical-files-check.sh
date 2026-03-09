#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="$SCRIPT_DIR/../skills/public/ops-maintenance/scripts/critical-files-check.sh"

if [ ! -f "$TARGET" ]; then
  echo "Error: target script not found: $TARGET" >&2
  exit 1
fi

exec bash "$TARGET" "$@"
