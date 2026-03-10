# 飞书开放平台 - 发送语音气泡消息 API 研究

## 概述

飞书发送语音气泡消息需要两步：
1. **上传音频文件** → 获取 `file_key`
2. **发送消息** → 使用 `msg_type=audio` + `file_key`

---

## Step 1: 上传音频文件

### API Endpoint

```
POST https://open.feishu.cn/open-apis/im/v1/files
```

### 请求方式

- **Content-Type**: `multipart/form-data`
- **鉴权**: `Authorization: Bearer <tenant_access_token>`

### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `file_type` | string | 是 | 文件类型，语音用 `opus` |
| `file_name` | string | 是 | 文件名，如 `voice.opus` |
| `file` | file | 是 | 音频文件二进制数据 |

### 音频格式要求

- **格式**: **Opus** 编码（`.opus` 文件）
- **容器**: OGG 容器（即 `audio/ogg; codecs=opus`）
- **时长限制**: 单条语音最长约 5 分钟
- **文件大小限制**: 约 30MB（im/v1/files 通用限制）

> ⚠️ **关键**: `file_type` 必须填 `opus`，不是 `audio`、`mp3` 或 `amr`。飞书语音消息专用 Opus 编码。

### 响应示例

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "file_key": "file_v2_xxxxx"
  }
}
```

### cURL 示例

```bash
curl -X POST 'https://open.feishu.cn/open-apis/im/v1/files' \
  -H 'Authorization: Bearer t-xxxxx' \
  -F 'file_type=opus' \
  -F 'file_name=voice.opus' \
  -F 'file=@/path/to/voice.opus'
```

---

## Step 2: 发送语音消息

### API Endpoint

```
POST https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id
```

### 请求方式

- **Content-Type**: `application/json`
- **鉴权**: `Authorization: Bearer <tenant_access_token>`

### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `receive_id` | string | 是 | 接收者 ID（open_id / chat_id 等） |
| `msg_type` | string | 是 | 固定为 `audio` |
| `content` | string | 是 | JSON 字符串，包含 `file_key` |

### Query 参数

- `receive_id_type`: 接收者 ID 类型（`open_id` / `user_id` / `union_id` / `email` / `chat_id`）

### Content 格式

```json
"{\"file_key\":\"file_v2_xxxxx\"}"
```

> 注意 `content` 是一个 **JSON 字符串**（string），不是 JSON 对象。

### 完整请求示例

```bash
curl -X POST 'https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id' \
  -H 'Authorization: Bearer t-xxxxx' \
  -H 'Content-Type: application/json' \
  -d '{
    "receive_id": "oc_xxxxx",
    "msg_type": "audio",
    "content": "{\"file_key\":\"file_v2_xxxxx\"}"
  }'
```

---

## 完整调用流程

```
1. 准备音频文件（Opus 编码，OGG 容器）
   ↓
2. 如果源文件不是 opus 格式，使用 ffmpeg 转换：
   ffmpeg -i input.mp3 -c:a libopus -b:a 32k output.opus
   ↓
3. POST /im/v1/files（multipart/form-data）
   - file_type=opus
   - file_name=voice.opus
   - file=<二进制数据>
   → 获取 file_key
   ↓
4. POST /im/v1/messages?receive_id_type=chat_id
   - msg_type=audio
   - content={"file_key":"<file_key>"}
   → 发送语音气泡消息
```

---

## 所需权限

- `im:message:send` — 发送消息
- `im:file` — 上传文件（部分文档写作 `im:resource`）

需要在飞书开放平台「开发者后台」→「权限管理」中申请。

---

## 音频转换参考

使用 ffmpeg 将常见音频格式转为飞书语音所需的 Opus 格式：

```bash
# MP3 → Opus
ffmpeg -i input.mp3 -c:a libopus -b:a 32k -ar 16000 output.opus

# WAV → Opus
ffmpeg -i input.wav -c:a libopus -b:a 32k -ar 16000 output.opus

# M4A/AAC → Opus
ffmpeg -i input.m4a -c:a libopus -b:a 32k -ar 16000 output.opus
```

推荐参数：
- 比特率: 32k（语音足够），可用 64k 获得更好质量
- 采样率: 16000 Hz（语音场景标准）

---

## 注意事项

1. **file_type 必须是 `opus`**，不能用 `mp3`、`audio` 等其他值
2. **content 是 JSON 字符串**，不是嵌套对象，需要转义
3. 语音消息在客户端显示为**语音气泡**（带播放按钮和波形），不是文件附件
4. 如果用 `file_type=file` 上传并用 `msg_type=file` 发送，会显示为文件附件而非语音气泡
5. 机器人需要在群里或与用户有会话才能发送消息

---

## 参考文档

- 发送消息: https://open.feishu.cn/document/server-docs/im-v1/message/create
- 上传文件: https://open.feishu.cn/document/server-docs/im-v1/file/create
- 消息内容结构: https://open.feishu.cn/document/server-docs/im-v1/message-content-description/create_json
