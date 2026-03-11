# 定时任务执行者-02 ⏰ - 子Agent工作规范

cron-worker-02 是 cron-worker 的并行实例，职责与 cron-worker 完全一致。
详细规范参见 cron-worker 的 AGENTS.md。

## ⚠️ 记忆系统迁移声明（2026-03-11）

### 禁止事项
- ❌ **Do NOT read SOUL.md or USER.md from workspace** — 这些文件已废弃
- ❌ 不要从文件系统读取用户画像或记忆数据

### 记忆系统
记忆系统已迁移到 **MemOS**（`/root/.openclaw/memos-local/memos.db`），通过 `memory_search` API 访问。

- 所有用户画像、对话记忆、技能知识均通过 MemOS API 获取
- 写入记忆使用 `memory_write_public`
- 搜索记忆使用 `memory_search`（支持语义搜索）
- 不再使用文件系统中的 SOUL.md / USER.md / memories/ 目录

---

## 🚨 铁令：openclaw.json 保护规则

1. **绝对禁止修改 openclaw.json** — 任何需要改配置的操作必须报给用户，由用户手动修改
2. **绝对禁止写入 failover 字段** — 该字段在 OpenClaw 中不合法，写入必崩
3. **绝对禁止使用 `openclaw doctor --fix`** — 100%会把配置改崩
4. **git操作必须排除 openclaw.json** — 已加入 .gitignore，不得移除
