#!/usr/bin/env bash
# glm-tts — GLM语音合成 + 飞书语音气泡发送
# 用法: bash index.sh "<文本>" "<receive_id>" [receive_id_type]
#
# 流程: 文本 → GLM-TTS API(wav) → ffmpeg截掉开头2秒+转opus → 飞书上传 → 语音气泡发送
# 音色: douji（固定）
# API Key: 从 /root/.openclaw/.secrets/zhipu-keys.env 读取
set -euo pipefail

TEXT="${1:?用法: $0 \"<文本>\" \"<receive_id>\" [receive_id_type]}"
RECEIVE_ID="${2:?缺少 receive_id}"
RECEIVE_ID_TYPE="${3:-open_id}"

# 限制文本长度（GLM-TTS对超长文本不友好）
if [ ${#TEXT} -gt 500 ]; then
  echo "WARN: 文本超过500字，截断处理" >&2
  TEXT="${TEXT:0:500}"
fi

TMPDIR=$(mktemp -d /tmp/glm-tts-XXXXXX)
trap 'rm -rf "$TMPDIR"' EXIT

VOICE="douji"
TTS_SCRIPT="/root/.openclaw/workspace/scripts/glm-tts.js"
SEND_VOICE_SCRIPT="/root/.openclaw/workspace/scripts/feishu-send-voice.sh"

# 检查依赖
for cmd in node ffmpeg; do
  command -v "$cmd" &>/dev/null || { echo "ERROR: 缺少依赖 $cmd" >&2; exit 1; }
done
[ -f "$TTS_SCRIPT" ] || { echo "ERROR: 缺少 $TTS_SCRIPT" >&2; exit 1; }
[ -f "$SEND_VOICE_SCRIPT" ] || { echo "ERROR: 缺少 $SEND_VOICE_SCRIPT" >&2; exit 1; }

echo "🎤 GLM-TTS: \"${TEXT:0:30}...\" → voice=$VOICE"

# Step 1: GLM-TTS 生成 wav
RAW_WAV="$TMPDIR/raw.wav"
node "$TTS_SCRIPT" "$TEXT" "$RAW_WAV" "$VOICE"
if [ ! -f "$RAW_WAV" ] || [ ! -s "$RAW_WAV" ]; then
  echo "ERROR: TTS生成失败，wav文件为空" >&2
  exit 1
fi
echo "✅ WAV生成: $(du -h "$RAW_WAV" | cut -f1)"

# Step 2: ffmpeg 截掉开头2秒噪音 + 转opus
CLEAN_OPUS="$TMPDIR/clean.opus"
ffmpeg -y -i "$RAW_WAV" -ss 2.0 -af "afade=t=in:d=0.1" -c:a libopus -b:a 48k -ar 16000 "$CLEAN_OPUS" -loglevel error
if [ ! -f "$CLEAN_OPUS" ] || [ ! -s "$CLEAN_OPUS" ]; then
  echo "ERROR: ffmpeg转码失败" >&2
  exit 1
fi
DURATION=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$CLEAN_OPUS" 2>/dev/null | cut -d. -f1)
echo "✅ Opus转码: $(du -h "$CLEAN_OPUS" | cut -f1), ~${DURATION:-?}s"

# Step 3: 飞书语音气泡发送
bash "$SEND_VOICE_SCRIPT" "$CLEAN_OPUS" "$RECEIVE_ID" "$RECEIVE_ID_TYPE"

echo "✅ GLM-TTS 完成"
