#!/usr/bin/env bash
set -euo pipefail

# 用法：snapshot-report-data.sh <report-file> [data-path ...]
# 示例：snapshot-report-data.sh reports/daily.md reports/data.json output/*.csv

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <report-file> [data-path ...]" >&2
  exit 1
fi

REPORT_FILE="$1"
shift || true

WORKSPACE_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPORT_ABS="${REPORT_FILE}"
if [[ ! "$REPORT_ABS" = /* ]]; then
  REPORT_ABS="$WORKSPACE_ROOT/$REPORT_FILE"
fi

if [[ ! -f "$REPORT_ABS" ]]; then
  echo "[snapshot-report-data] report file not found: $REPORT_ABS" >&2
  exit 2
fi

REPORT_DIR="$(dirname "$REPORT_ABS")"
REPORT_BASENAME="$(basename "$REPORT_ABS")"
REPORT_NAME="${REPORT_BASENAME%.*}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
SNAPSHOT_DIR="$REPORT_DIR/snapshots/${REPORT_NAME}-${TIMESTAMP}-snapshot"
mkdir -p "$SNAPSHOT_DIR"

# 数据路径来源：参数优先；否则尝试同目录 data/ 与 report-data/
DATA_PATHS=()
if [[ $# -gt 0 ]]; then
  DATA_PATHS=("$@")
else
  [[ -d "$REPORT_DIR/data" ]] && DATA_PATHS+=("$REPORT_DIR/data")
  [[ -d "$REPORT_DIR/report-data" ]] && DATA_PATHS+=("$REPORT_DIR/report-data")
fi

copied_any=0
for p in "${DATA_PATHS[@]:-}"; do
  [[ -z "${p:-}" ]] && continue
  ABS_P="$p"
  if [[ ! "$ABS_P" = /* ]]; then
    ABS_P="$WORKSPACE_ROOT/$p"
  fi
  if [[ -e "$ABS_P" ]]; then
    copied_any=1
    base_name="$(basename "$ABS_P")"
    cp -a "$ABS_P" "$SNAPSHOT_DIR/$base_name"
  else
    echo "[snapshot-report-data] warn: data path not found, skip: $p" >&2
  fi
done

if [[ $copied_any -eq 0 ]]; then
  echo "[snapshot-report-data] warn: no data copied. snapshot dir created only: $SNAPSHOT_DIR" >&2
fi

MANIFEST="$SNAPSHOT_DIR/manifest.txt"
{
  echo "report: $REPORT_ABS"
  echo "snapshot: $SNAPSHOT_DIR"
  echo "timestamp: $TIMESTAMP"
  echo "data_paths:"
  for p in "${DATA_PATHS[@]:-}"; do
    echo "  - $p"
  done
} > "$MANIFEST"

REL_SNAPSHOT="$SNAPSHOT_DIR"
if [[ "$REL_SNAPSHOT" == "$WORKSPACE_ROOT"/* ]]; then
  REL_SNAPSHOT="${REL_SNAPSHOT#"$WORKSPACE_ROOT/"}"
fi

if ! grep -q "快照路径：$REL_SNAPSHOT" "$REPORT_ABS"; then
  {
    echo ""
    echo "---"
    echo "数据快照：已锁定本报告关联数据，防止后续版本漂移。"
    echo "快照路径：$REL_SNAPSHOT"
  } >> "$REPORT_ABS"
fi

echo "$REL_SNAPSHOT"
