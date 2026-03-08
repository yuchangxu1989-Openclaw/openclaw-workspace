---
name: feishu-doc-verify
description: 飞书文档create/write后验证block_count>1，防止空文档推送
distribution: local
---

# feishu-doc-verify

验证飞书文档是否有实际内容（block_count > 1），防止空文档被推送给用户。

## 触发条件

- 飞书文档 create/write 操作完成后
- 作为文档推送前的质量关卡

## 输入/输出

- **输入**: `<doc_token>` 文档 token
- **输出**: JSON `{"doc_token":"...", "block_count":N, "verified":bool, "message":"..."}`

## 依赖

- curl
- jq

## 用法

```bash
bash index.sh <doc_token>
```
