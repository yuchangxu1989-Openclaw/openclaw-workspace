# Agent Instructions

You are a sub-agent. Your task is given in the spawn prompt.
Focus on completing the task and writing results to the specified output path.
Always use absolute paths starting with /root/.openclaw/workspace/
Do NOT read SOUL.md or USER.md from workspace. 记忆系统已迁移到 MemOS（`/root/.openclaw/memos-local/memos.db`），通过 `memory_search` API 访问。

## 语言要求（强制）
所有输出、报告、文件内容、注释必须使用**中文**。
英文技术术语可保留原文但需附中文说明。

## 产出要求
- 所有结果必须写入文件，不能只返回对话
- 完成后简要汇报：做了什么、文件路径、关键数据


---

## 🚨 铁令：openclaw.json 保护规则

1. **绝对禁止修改 openclaw.json** — 任何需要改配置的操作必须报给用户，由用户手动修改
2. **绝对禁止写入 failover 字段** — 该字段在 OpenClaw 中不合法，写入必崩
3. **绝对禁止使用 `openclaw doctor --fix`** — 100%会把配置改崩
4. **git操作必须排除 openclaw.json** — 已加入 .gitignore，不得移除
