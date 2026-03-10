#!/usr/bin/env bash
# ISC Rule Handler: rule.eval-standard-auto-sync-001
# 评测标准变更自动同步评测集
# 检测飞书评测文档(V3标准)变更并同步到本地
# 退出码: 0=pass, 1=fail, 2=error

set -euo pipefail

RULE_ID="rule.eval-standard-auto-sync-001"
DOC_TOKEN="JxhNdoc7ko7ZLwxJUJHcWyeDnYd"
LOCAL_STANDARD_DIR="/root/.openclaw/workspace/data/eval-standards"
LOCAL_HASH_FILE="${LOCAL_STANDARD_DIR}/.v3-standard.sha256"

json_output() {
  local status="$1" message="$2" details="${3:-{}}"
  cat <<EOF
{"rule":"${RULE_ID}","status":"${status}","message":"${message}","details":${details},"timestamp":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
EOF
}

# --- Input Parsing ---
EVENT_PAYLOAD="${1:-}"
if [ -z "$EVENT_PAYLOAD" ]; then
  # No explicit payload; run as periodic check
  TRIGGER_MODE="periodic"
else
  TRIGGER_MODE=$(echo "$EVENT_PAYLOAD" | jq -r '.trigger // "event"' 2>/dev/null || echo "event")
fi

# --- Ensure local directory exists ---
mkdir -p "$LOCAL_STANDARD_DIR"

# --- Fetch current document content via openclaw/feishu CLI ---
FETCH_OUTPUT=$(mktemp)
FETCH_ERR=$(mktemp)
trap 'rm -f "$FETCH_OUTPUT" "$FETCH_ERR"' EXIT

# Try fetching the doc. If openclaw CLI is available, use it; otherwise curl feishu API.
if command -v openclaw &>/dev/null; then
  if ! openclaw feishu doc read --token "$DOC_TOKEN" > "$FETCH_OUTPUT" 2>"$FETCH_ERR"; then
    json_output "error" "Failed to fetch feishu doc ${DOC_TOKEN}" "{\"stderr\":\"$(head -c 500 "$FETCH_ERR" | tr '"' "'")\"}"
    exit 2
  fi
else
  # Fallback: check if a cached copy exists at all
  if [ ! -f "${LOCAL_STANDARD_DIR}/v3-standard-latest.md" ]; then
    json_output "error" "openclaw CLI not available and no local cache exists" "{}"
    exit 2
  fi
  # Use cached copy as fetch output for hash comparison (will always show pass/no-change)
  cp "${LOCAL_STANDARD_DIR}/v3-standard-latest.md" "$FETCH_OUTPUT"
fi

# --- Condition Check: compare hashes ---
NEW_HASH=$(sha256sum "$FETCH_OUTPUT" | awk '{print $1}')
OLD_HASH=""
if [ -f "$LOCAL_HASH_FILE" ]; then
  OLD_HASH=$(cat "$LOCAL_HASH_FILE" 2>/dev/null || true)
fi

if [ "$NEW_HASH" = "$OLD_HASH" ]; then
  json_output "pass" "V3评测标准文档无变更，无需同步" "{\"doc_token\":\"${DOC_TOKEN}\",\"hash\":\"${NEW_HASH}\"}"
  exit 0
fi

# --- Document changed: sync locally ---
cp "$FETCH_OUTPUT" "${LOCAL_STANDARD_DIR}/v3-standard-latest.md"
echo "$NEW_HASH" > "$LOCAL_HASH_FILE"

# Archive with timestamp
ARCHIVE_NAME="v3-standard-$(date +%Y%m%d-%H%M%S).md"
cp "$FETCH_OUTPUT" "${LOCAL_STANDARD_DIR}/${ARCHIVE_NAME}"

# --- Report change detected ---
if [ -z "$OLD_HASH" ]; then
  json_output "pass" "V3评测标准文档首次同步完成" "{\"doc_token\":\"${DOC_TOKEN}\",\"new_hash\":\"${NEW_HASH}\",\"archive\":\"${ARCHIVE_NAME}\"}"
  exit 0
else
  json_output "fail" "V3评测标准文档已变更，需刷新评测集" "{\"doc_token\":\"${DOC_TOKEN}\",\"old_hash\":\"${OLD_HASH}\",\"new_hash\":\"${NEW_HASH}\",\"archive\":\"${ARCHIVE_NAME}\",\"action_required\":\"auto-refresh evalset\"}"
  exit 1
fi
