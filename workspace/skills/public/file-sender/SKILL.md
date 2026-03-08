---
name: file-sender
description: |
  通过飞书API发送本地文件到聊天对话。
  触发词：发文件、发源文件、把XX发给我、发附件、发送文件、把报告发我、把这个文件给我、源文件发一下、发一下文件、文件发我、给我发文件、把XX文件给我、发个文件、传文件、传一下、把XX传给我。
  支持任意文件类型（json/md/pdf/doc/xls/ppt/zip/tar等），30MB以内。
  NOT for: 发送文本消息、发送图片（用message工具）、发送链接。
  关键：receive_id从会话上下文sender_id获取，receive_id_type默认open_id。禁止用message工具的filePath（只发路径字符串）。
---

# file-sender — 飞书文件发送

## 调用方式

```bash
node <skill_dir>/index.js <文件路径> <receive_id> [receive_id_type] [显示文件名]
```

其中 `<skill_dir>` 是本技能所在目录（即 SKILL.md 的同级目录）。

## 参数说明

| 参数 | 必填 | 说明 |
|------|------|------|
| 文件路径 | ✅ | 本地文件绝对路径 |
| receive_id | ✅ | 飞书用户 open_id（`ou_xxx`）或群 chat_id（`oc_xxx`） |
| receive_id_type | 可选 | `open_id`（默认）/ `chat_id` / `user_id` |
| 显示文件名 | 可选 | 接收方看到的文件名，默认取原文件名 |

### ⚡ 默认行为

- **默认 `receive_id_type` 是 `open_id`**（优先发给用户个人）
- 如果 receive_id 以 `oc_` 开头，会**自动修正** receive_id_type 为 `chat_id`
- 如果 receive_id 以 `ou_` 开头，会**自动确认** receive_id_type 为 `open_id`

### 🛡️ 自动纠错

脚本会检测并自动纠正常见的参数误用：

| 错误场景 | 你传的 | 脚本行为 |
|---------|--------|---------|
| 参数顺序颠倒 | `open_id ou_xxx` | 自动交换，纠正为 `ou_xxx open_id` |
| type 与前缀不匹配 | `oc_xxx open_id` | 自动修正 type 为 `chat_id` |
| type 不在合法列表 | `ou_xxx blah` | 报错并给出合法值 |
| 空文件 | (0 bytes) | 报错：文件为空 |

## 正确调用示例

```bash
# ✅ 发给用户（最常用，默认 open_id）
node index.js /tmp/report.pdf ou_xxxxxxxxxxxx

# ✅ 发到群聊
node index.js /tmp/data.xlsx oc_xxxxxxxxxxxx chat_id

# ✅ 指定显示名
node index.js /tmp/code.zip ou_xxxxxxxxxxxx open_id my-code.zip

# ✅ 运行自检
node index.js --self-test
```

## ❌ 常见误用

```bash
# ❌ 参数顺序写反（脚本会自动纠正并警告）
node index.js /tmp/a.pdf open_id ou_xxxxxxxxxxxx
# → 自动纠正为: receive_id=ou_xxx, receive_id_type=open_id

# ❌ 用 message 工具的 filePath（只发路径字符串，不发文件！）
# 必须用本技能的 node index.js 方式

# ❌ 文件不存在
node index.js /tmp/nonexistent.pdf ou_xxx
# → 报错：文件不存在 + 下一步建议
```

## 编程调用 (API)

```javascript
const { FileSender } = require('./index.js');

const sender = new FileSender();
const result = await sender.sendFile({
  filePath: '/tmp/report.pdf',
  receiveId: 'ou_xxxxxxxxxxxx',
  receiveIdType: 'open_id',  // 可省略，默认 open_id
  filename: 'report.pdf',     // 可省略
});
// result: { success, fileKey, messageId, filePath, filename, size, receiveId, receiveIdType }
```

## 前置条件

- `openclaw.json` 中已配置 `channels.feishu.accounts.default.appId/appSecret`
- 飞书应用已开通权限：`im:message`、`im:message:send_as_bot`、`im:resource`
- 零外部依赖，仅用 Node.js 内置模块

## 工作原理

1. 从 `openclaw.json` 读取飞书 appId/appSecret
2. 获取 tenant_access_token（自动缓存 110 分钟）
3. `POST /open-apis/im/v1/files` 上传文件 → file_key
4. `POST /open-apis/im/v1/messages` 发送 msg_type=file 消息

## 失败排查

| 错误 | 原因 | 下一步 |
|------|------|--------|
| code=230001 | 用户未与机器人对话 | 让用户先给机器人发一条消息 |
| code=230002 | 机器人不在群中 | 将机器人加入群聊 |
| code=230006 | receive_id 无效 | 确认 ID 正确且类型匹配 |
| code=99991663 | 缺少权限 | 在开放平台添加 im:resource |
| 文件过大 | >30MB | 压缩或分片 |
