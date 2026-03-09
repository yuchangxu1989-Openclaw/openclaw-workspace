#!/usr/bin/env bash
# feishu-send-voice.sh — Send a voice bubble message via Feishu API
# Usage: feishu-send-voice.sh <audio_file> <receive_id> [receive_id_type]
#
# Reads Feishu app credentials from /root/.openclaw/openclaw.json
# Converts audio to opus via ffmpeg, uploads, then sends as voice bubble.

set -euo pipefail

AUDIO_FILE="${1:?Usage: feishu-send-voice.sh <audio_file> <receive_id> [receive_id_type]}"
RECEIVE_ID="${2:?Missing receive_id}"
RECEIVE_ID_TYPE="${3:-open_id}"

CONFIG="/root/.openclaw/openclaw.json"
FEISHU_BASE="https://open.feishu.cn/open-apis"

# --- Read credentials ---
APP_ID=$(jq -r '.channels.feishu.accounts.default.appId' "$CONFIG")
APP_SECRET=$(jq -r '.channels.feishu.accounts.default.appSecret' "$CONFIG")

if [[ -z "$APP_ID" || -z "$APP_SECRET" || "$APP_ID" == "null" ]]; then
  echo "ERROR: Cannot read Feishu appId/appSecret from $CONFIG" >&2
  exit 1
fi

# --- Ensure ffmpeg ---
if ! command -v ffmpeg &>/dev/null; then
  echo "Installing ffmpeg..."
  apt-get update -qq && apt-get install -y -qq ffmpeg
fi

# --- Convert to opus ---
OPUS_FILE="/tmp/feishu-voice-$$.opus"
trap 'rm -f "$OPUS_FILE"' EXIT

echo "Converting $AUDIO_FILE → opus..."
ffmpeg -y -i "$AUDIO_FILE" -c:a libopus -b:a 32k -ar 16000 "$OPUS_FILE" -loglevel error

DURATION=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OPUS_FILE" | cut -d. -f1)
echo "Opus file ready: $(stat -c%s "$OPUS_FILE") bytes, ~${DURATION}s"

# --- Get tenant_access_token ---
echo "Getting tenant_access_token..."
TOKEN_RESP=$(curl -sf -X POST "$FEISHU_BASE/auth/v3/tenant_access_token/internal" \
  -H "Content-Type: application/json" \
  -d "{\"app_id\":\"$APP_ID\",\"app_secret\":\"$APP_SECRET\"}")

TOKEN=$(echo "$TOKEN_RESP" | jq -r '.tenant_access_token')
if [[ -z "$TOKEN" || "$TOKEN" == "null" ]]; then
  echo "ERROR: Failed to get token: $TOKEN_RESP" >&2
  exit 1
fi
echo "Token acquired."

# --- Upload opus file ---
echo "Uploading opus file..."
UPLOAD_RESP=$(curl -sf -X POST "$FEISHU_BASE/im/v1/files" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file_type=opus" \
  -F "file_name=voice.opus" \
  -F "file=@$OPUS_FILE")

FILE_KEY=$(echo "$UPLOAD_RESP" | jq -r '.data.file_key')
if [[ -z "$FILE_KEY" || "$FILE_KEY" == "null" ]]; then
  echo "ERROR: Upload failed: $UPLOAD_RESP" >&2
  exit 1
fi
echo "Uploaded: file_key=$FILE_KEY"

# --- Send voice message ---
echo "Sending voice message to $RECEIVE_ID ($RECEIVE_ID_TYPE)..."
SEND_RESP=$(curl -sf -X POST "$FEISHU_BASE/im/v1/messages?receive_id_type=$RECEIVE_ID_TYPE" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"receive_id\":\"$RECEIVE_ID\",\"msg_type\":\"audio\",\"content\":\"{\\\"file_key\\\":\\\"$FILE_KEY\\\"}\"}")

SEND_CODE=$(echo "$SEND_RESP" | jq -r '.code')
if [[ "$SEND_CODE" != "0" ]]; then
  echo "ERROR: Send failed: $SEND_RESP" >&2
  exit 1
fi

MSG_ID=$(echo "$SEND_RESP" | jq -r '.data.message_id')
echo "✅ Voice message sent! message_id=$MSG_ID"
