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
node <skill_dir>/index.js <文件路径> <receive_id> [receive_id_type] [显示文件名]
```

其中 `<skill_dir>` 是本技能所在目录（即 SKILL.md 的同级目录）。

**参数说明：**

| 参数 | 必填 | 说明 |
|------|------|------|
| 文件路径 | ✅ | 本地文件绝对路径 |
| receive_id | ✅ | 飞书用户open_id或群chat_id（从会话上下文获取） |
| receive_id_type | 可选 | open_id / chat_id / user_id，默认chat_id |
| 显示文件名 | 可选 | 接收方看到的文件名，默认取原文件名 |

## 前置条件

- `openclaw.json` 中已配置 `channels.feishu.accounts.default.appId/appSecret`
- 飞书应用已开通权限：`im:message`、`im:message:send_as_bot`、`im:resource`
- 零外部依赖，仅用 Node.js 内置模块

## 工作原理

1. 从 `openclaw.json` 读取飞书 appId/appSecret
2. 获取 tenant_access_token（自动缓存110分钟）
3. `POST /open-apis/im/v1/files` 上传文件 → file_key
4. `POST /open-apis/im/v1/messages` 发送 msg_type=file 消息

## ⚠️ 禁止事项

**禁止**用 `message` 工具的 `filePath` 参数发送文件——那只发路径字符串，不发文件本体。
