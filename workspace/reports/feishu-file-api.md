# 飞书开放平台 - 发送文件消息到聊天的完整流程

> 情报可信度：**已验证**（来源：飞书官方 Go SDK 源码 + API 文档结构）
> 最后更新：2026-03-06

## 概述

通过飞书开放平台 API 发送文件消息到聊天需要两步：
1. **上传文件** → 获取 `file_key`
2. **发送消息** → 使用 `file_key` 发送文件类型消息

---

## 第一步：上传文件获取 file_key

### API 信息

| 属性 | 值 |
|------|-----|
| **接口** | `POST /open-apis/im/v1/files` |
| **认证方式** | `tenant_access_token`（仅支持租户令牌） |
| **Content-Type** | `multipart/form-data` |
| **官方文档** | https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1/file/create |

### 请求参数（form-data）

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `file_type` | string | 是 | 文件类型：`opus`(音频)、`mp4`(视频)、`pdf`、`doc`、`xls`、`ppt`、`stream`(通用二进制) |
| `file_name` | string | 是 | 带后缀的文件名，如 `report.pdf` |
| `duration` | int | 否 | 视频/音频时长（毫秒），仅 mp4/opus 类型需要 |
| `file` | file | 是 | 文件二进制数据 |

### 响应示例

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "file_key": "file_v2_xxxx"
  }
}
```

### 限制

- 文件大小不得超过 **30MB**
- 不允许上传空文件
- 需要开启**机器人能力**

### curl 示例

```bash
# 第一步：上传文件
curl -X POST 'https://open.feishu.cn/open-apis/im/v1/files' \
  -H 'Authorization: Bearer t-xxxxxxxxxx' \
  -F 'file_type=pdf' \
  -F 'file_name=report.pdf' \
  -F 'file=@/path/to/report.pdf'
```

---

## 第二步：发送文件消息

### API 信息

| 属性 | 值 |
|------|-----|
| **接口** | `POST /open-apis/im/v1/messages` |
| **认证方式** | `tenant_access_token` / `user_access_token` |
| **Content-Type** | `application/json` |
| **Query 参数** | `receive_id_type`：接收者 ID 类型 |
| **官方文档** | https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1/message/create |

### Query 参数

| 参数 | 值 | 说明 |
|------|-----|------|
| `receive_id_type` | `open_id` / `user_id` / `union_id` / `email` / `chat_id` | 接收者 ID 类型 |

### 请求体（JSON）

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `receive_id` | string | 是 | 接收者 ID（根据 receive_id_type 而定） |
| `msg_type` | string | 是 | 消息类型，文件消息为 `file` |
| `content` | string | 是 | 消息内容（JSON 字符串） |
| `uuid` | string | 否 | 幂等 UUID，防止重复发送 |

### content 格式（文件消息）

```json
"{\"file_key\":\"file_v2_xxxx\"}"
```

### curl 示例

```bash
# 第二步：发送文件消息到群聊
curl -X POST 'https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id' \
  -H 'Authorization: Bearer t-xxxxxxxxxx' \
  -H 'Content-Type: application/json' \
  -d '{
    "receive_id": "oc_xxxxxxxxxxxxx",
    "msg_type": "file",
    "content": "{\"file_key\":\"file_v2_xxxx\"}"
  }'
```

### 响应示例

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "message_id": "om_xxxxxxxxxxxxxxxx",
    "root_id": "",
    "parent_id": "",
    "msg_type": "file",
    "create_time": "1709712000000",
    "update_time": "1709712000000",
    "deleted": false,
    "chat_id": "oc_xxxxxxxxxxxxx",
    "sender": {
      "id": "cli_xxxxxxxxxxxx",
      "id_type": "app_id",
      "sender_type": "app",
      "tenant_key": "xxxxxxxxxx"
    },
    "body": {
      "content": "{\"file_key\":\"file_v2_xxxx\"}"
    }
  }
}
```

---

## 完整流程 curl 示例

```bash
#!/bin/bash

# ============================================
# 飞书发送文件消息完整流程
# ============================================

# 配置
APP_ID="cli_xxxxxxxxxxxx"
APP_SECRET="xxxxxxxxxxxxxxxxxxxxxxxx"
CHAT_ID="oc_xxxxxxxxxxxxx"           # 目标群聊 ID
FILE_PATH="/path/to/your/file.pdf"   # 本地文件路径
FILE_NAME="report.pdf"               # 文件名
FILE_TYPE="pdf"                       # 文件类型

# 0. 获取 tenant_access_token
TOKEN_RESP=$(curl -s -X POST 'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal' \
  -H 'Content-Type: application/json' \
  -d "{
    \"app_id\": \"${APP_ID}\",
    \"app_secret\": \"${APP_SECRET}\"
  }")

TENANT_TOKEN=$(echo "$TOKEN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['tenant_access_token'])")
echo "Token: ${TENANT_TOKEN:0:10}..."

# 1. 上传文件获取 file_key
UPLOAD_RESP=$(curl -s -X POST 'https://open.feishu.cn/open-apis/im/v1/files' \
  -H "Authorization: Bearer ${TENANT_TOKEN}" \
  -F "file_type=${FILE_TYPE}" \
  -F "file_name=${FILE_NAME}" \
  -F "file=@${FILE_PATH}")

FILE_KEY=$(echo "$UPLOAD_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['file_key'])")
echo "File Key: ${FILE_KEY}"

# 2. 发送文件消息
SEND_RESP=$(curl -s -X POST "https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id" \
  -H "Authorization: Bearer ${TENANT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{
    \"receive_id\": \"${CHAT_ID}\",
    \"msg_type\": \"file\",
    \"content\": \"{\\\"file_key\\\":\\\"${FILE_KEY}\\\"}\"
  }")

echo "Send Result: $SEND_RESP"
```

---

## 需要的权限 Scope

### 必需权限

| Scope | 类型 | 说明 |
|-------|------|------|
| `im:message` | tenant | 发送消息的基础权限 |
| `im:message:send_as_bot` | tenant | 以机器人身份发送消息 |
| `im:resource` | tenant | 上传/下载消息中的资源文件（图片、文件等） |

### 前提条件

1. **开启机器人能力**：在飞书开放平台 > 应用功能 > 机器人 中开启
2. **机器人在群中**：发送群聊消息前，机器人必须已经加入该群
3. **用户可用性**：发送私聊消息时，机器人对目标用户需要有可用性

### 当前应用权限状态

经检查，当前应用已具备以下关键权限（均为 tenant 类型）：
- ✅ `im:message` — 消息基础权限
- ✅ `im:message:send_as_bot` — 机器人发送消息
- ✅ `im:resource` — 资源（文件/图片）上传下载

**结论：当前应用权限已满足发送文件消息的需求。**

---

## 其他消息类型的 content 格式参考

| msg_type | content 格式 |
|----------|-------------|
| `text` | `{"text":"Hello"}` |
| `image` | `{"image_key":"img_v2_xxx"}` |
| `file` | `{"file_key":"file_v2_xxx"}` |
| `audio` | `{"file_key":"file_v2_xxx"}` |
| `media` (视频) | `{"file_key":"file_v2_xxx","image_key":"img_v2_xxx"}` |
| `sticker` | `{"file_key":"file_v2_xxx"}` |

---

## 下载文件（反向操作）

| 接口 | 说明 |
|------|------|
| `GET /open-apis/im/v1/files/:file_key` | 下载机器人自己上传的文件 |
| `GET /open-apis/im/v1/messages/:message_id/resources/:file_key` | 获取消息中的资源文件（用户发送的） |

### curl 示例

```bash
# 下载机器人上传的文件
curl -X GET 'https://open.feishu.cn/open-apis/im/v1/files/file_v2_xxxx' \
  -H 'Authorization: Bearer t-xxxxxxxxxx' \
  -o downloaded_file.pdf
```

---

## 信息来源

- 飞书官方 Go SDK 源码：[larksuite/oapi-sdk-go](https://github.com/larksuite/oapi-sdk-go/tree/v3_main/service/im/v1)
- 官方 SDK 示例：`sample/apiall/imv1/create_file.go`, `create_message.go`
- API 路径确认：`resource.go` 中的 `ApiPath` 定义
- 权限确认：SDK 源码中的 `SupportedAccessTokenTypes` 字段
