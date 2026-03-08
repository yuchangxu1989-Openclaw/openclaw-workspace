---
name: auto-grant-feishu-perm
description: 飞书文档创建后自动授权指定用户full_access权限
distribution: local
---

# auto-grant-feishu-perm

飞书文档创建后，自动给指定用户授予 `full_access` 权限。

## 触发条件

- 飞书文档/表格/多维表格创建成功后
- Agent 创建文档的 post-hook

## 输入/输出

- **输入**: `<doc_token> [doc_type]`（doc_type 默认 docx，支持 sheet/bitable）
- **输出**: 成功输出 `OK: <token> full_access granted`，失败输出错误信息

## 依赖

- curl
- jq

## 用法

```bash
bash index.sh <doc_token> [docx|sheet|bitable]
```
