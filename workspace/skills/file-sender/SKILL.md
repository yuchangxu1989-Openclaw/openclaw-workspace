---
name: file-sender
description: |
  通过飞书API发送本地文件到聊天对话。用于：用户说"发文件"/"发源文件"/"把XX发给我"时自动触发。
  支持任意文件类型（json/md/pdf/doc/xls/ppt等），30MB以内。
  NOT for: 发送文本消息、发送图片（用message工具）、发送链接。
---

# file-sender — 飞书文件发送

## 调用方式

```bash
node /root/.openclaw/workspace/skills/file-sender/index.js <文件路径> <receive_id> [receive_id_type] [显示文件名]
```

**常用模式（发给当前用户）：**
```bash
node /root/.openclaw/workspace/skills/file-sender/index.js /path/to/file.json ou_a113e465324cc55f9ab3348c9a1a7b9b open_id 文件名.json
```

## 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| 文件路径 | ✅ | 本地文件绝对路径 |
| receive_id | ✅ | 飞书用户open_id或群chat_id |
| receive_id_type | 可选 | open_id / chat_id / user_id，默认chat_id |
| 显示文件名 | 可选 | 接收方看到的文件名，默认取原文件名 |

## 工作原理

三步飞书API调用（零外部依赖）：
1. 获取 tenant_access_token（自动缓存110分钟）
2. `POST /open-apis/im/v1/files` 上传文件 → file_key
3. `POST /open-apis/im/v1/messages` 发送 msg_type=file 消息

凭据自动从 `/root/.openclaw/openclaw.json` 的 `channels.feishu.accounts.default` 读取。

## ⚠️ 禁止事项

**禁止**用 `message` 工具的 `filePath` 参数发送文件——那只发路径字符串，不发文件本体。
