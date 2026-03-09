# 飞书语音气泡消息发送方案

> 日期: 2026-03-10

## 问题

TTS 工具可生成 MP3 音频文件，但飞书不支持直接发送 MP3 为语音气泡（voice bubble）。
飞书语音消息需要：
1. 将音频上传为文件，获取 `file_key`
2. 使用 `file_key` 发送 `audio` 类型消息

## 方案概览

```
TTS生成MP3 → ffmpeg转码为OGG/Opus → 上传文件API → 获取file_key → 发送audio消息
```

## 音频格式要求

飞书语音消息（`msg_type: audio`）要求音频格式为 **Opus 编码**（`.ogg` 容器）。
- 不支持直接发送 MP3、WAV、AMR
- 需要先用 ffmpeg 将 MP3 转为 Opus：

```bash
ffmpeg -i input.mp3 -c:a libopus -b:a 32k -ac 1 -ar 16000 output.ogg
```

参数说明：
- `-c:a libopus`: Opus 编码
- `-b:a 32k`: 32kbps 码率（语音足够）
- `-ac 1`: 单声道
- `-ar 16000`: 16kHz 采样率（语音推荐）

## API 调用链

### 第一步：上传音频文件

**端点:** `POST https://open.feishu.cn/open-apis/im/v1/files`

**请求格式:** `multipart/form-data`

**参数:**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| file_type | string | 是 | 固定填 `opus` |
| file_name | string | 是 | 文件名，如 `voice.ogg` |
| file | file | 是 | 音频文件二进制 |

**权限:** `im:resource`（上传消息中的资源文件）

**curl 示例:**

```bash
curl -X POST 'https://open.feishu.cn/open-apis/im/v1/files' \
  -H 'Authorization: Bearer t-YOUR_TENANT_ACCESS_TOKEN' \
  -F 'file_type=opus' \
  -F 'file_name=voice.ogg' \
  -F 'file=@/path/to/voice.ogg'
```

**返回示例:**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "file_key": "file_v2_xxx"
  }
}
```

### 第二步：发送语音消息

**端点:** `POST https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id`

**请求格式:** `application/json`

**参数:**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| receive_id | string | 是 | 会话 ID（chat_id） |
| msg_type | string | 是 | 固定填 `audio` |
| content | string | 是 | JSON 字符串: `{"file_key":"file_v2_xxx"}` |

**权限:** `im:message:send_as_bot`（以应用身份发送消息）

**curl 示例:**

```bash
curl -X POST 'https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id' \
  -H 'Authorization: Bearer t-YOUR_TENANT_ACCESS_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "receive_id": "oc_YOUR_CHAT_ID",
    "msg_type": "audio",
    "content": "{\"file_key\":\"file_v2_xxx\"}"
  }'
```

## 完整流程脚本示例

```bash
#!/bin/bash
# tts-to-feishu-voice.sh
# 用法: ./tts-to-feishu-voice.sh <mp3文件> <chat_id> <tenant_access_token>

MP3_FILE="$1"
CHAT_ID="$2"
TOKEN="$3"
OGG_FILE="/tmp/voice_$(date +%s).ogg"

# 1. 转码 MP3 → Opus/OGG
ffmpeg -i "$MP3_FILE" -c:a libopus -b:a 32k -ac 1 -ar 16000 "$OGG_FILE" -y -loglevel quiet

# 2. 上传文件
FILE_KEY=$(curl -s -X POST 'https://open.feishu.cn/open-apis/im/v1/files' \
  -H "Authorization: Bearer $TOKEN" \
  -F 'file_type=opus' \
  -F 'file_name=voice.ogg' \
  -F "file=@$OGG_FILE" | jq -r '.data.file_key')

echo "file_key: $FILE_KEY"

# 3. 发送语音消息
curl -s -X POST "https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{
    \"receive_id\": \"$CHAT_ID\",
    \"msg_type\": \"audio\",
    \"content\": \"{\\\"file_key\\\":\\\"$FILE_KEY\\\"}\"
  }"

# 4. 清理
rm -f "$OGG_FILE"
```

## 注意事项

1. **格式必须是 Opus**: 飞书 `file_type=opus` 对应 Opus 编码的 OGG 文件，MP3 直接上传会报错或无法播放
2. **文件大小限制**: 上传文件最大 30MB
3. **file_key 有效期**: file_key 在上传后有一定时效，建议上传后立即发送
4. **权限要求**:
   - 应用需要 `im:resource`（上传资源）
   - 应用需要 `im:message` 或 `im:message:send_as_bot`（发送消息）
   - 机器人需要在目标群中或与目标用户有会话
5. **ffmpeg 依赖**: 服务器需安装 ffmpeg 和 libopus 编码器
6. **回复消息**: 如果要回复特定消息，在发送消息 API body 中加 `"reply_in_thread": false` 或使用 reply API
7. **OpenClaw 集成建议**: 在 TTS 工具链中，生成 MP3 后自动转码并通过飞书 API 发送，而非走 `message` tool 的文本通道

## 参考文档

- [上传文件 API](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1/file/create)
- [发送消息 API](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1/message/create)
- [消息类型-音频](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/im-v1/message/create_json#audio)
