#!/bin/bash
# 一键TTS+飞书语音气泡发送
# Usage: feishu-voice-reply.sh "<文本>" "<receive_id>" [receive_id_type]
TEXT="$1"
RECEIVE_ID="$2"
RECEIVE_ID_TYPE="${3:-open_id}"
TMPDIR=$(mktemp -d)

# 1. GLM-TTS生成wav
node /root/.openclaw/workspace/scripts/glm-tts.js "$TEXT" "$TMPDIR/raw.wav" douji

# 2. 截掉开头2秒噪音 + 转opus
ffmpeg -i "$TMPDIR/raw.wav" -ss 2.0 -af "afade=t=in:d=0.1" -c:a libopus -b:a 48k "$TMPDIR/clean.opus" -y 2>/dev/null

# 3. 飞书语音气泡发送
bash /root/.openclaw/workspace/scripts/feishu-send-voice.sh "$TMPDIR/clean.opus" "$RECEIVE_ID" "$RECEIVE_ID_TYPE"

# 清理
rm -rf "$TMPDIR"
